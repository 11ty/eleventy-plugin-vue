const path = require("path");
const fastglob = require("fast-glob");
const lodashMerge = require("lodash.merge");

const Vue = require("vue");
const vueServerRenderer = require("vue-server-renderer");
const renderer = vueServerRenderer.createRenderer();

const rollup = require("rollup");
const rollupPluginVue = require("rollup-plugin-vue");
const rollupPluginCssOnly = require("rollup-plugin-css-only");

const { InlineCodeManager } = require("@11ty/eleventy-assets");

const globalOptions = {
  cacheDirectory: ".cache/vue/",
  // See https://rollup-plugin-vue.vuejs.org/options.html
  rollupPluginVueOptions: {},
  assets: {
    css: null
  } // optional `eleventy-assets` instances
};

function clearVueFilesFromRequireCache(cacheDir) {
  let deleteCount = 0;
  for(let fullPath in require.cache) {
    if(fullPath.startsWith(cacheDir)) {
      deleteCount++;
      delete require.cache[fullPath];
    }
  }
  // console.log( `Deleted ${deleteCount} vue components from require.cache.` );
}

function getLocalVueFilePath(fullPath, projectDir) {
  let filePath = fullPath;
  if(fullPath.startsWith(projectDir)) {
    filePath = `.${fullPath.substr(projectDir.length)}`;
  }
  let extension = ".vue";
  return filePath.substr(0, filePath.lastIndexOf(extension) + extension.length);
}

module.exports = function(eleventyConfig, configGlobalOptions = {}) {
  let options = lodashMerge({}, globalOptions, configGlobalOptions);

  let templates = {};
  let vueFileToJavaScriptFilenameMap = {};
  let vueFileToCSSMap = {};

  let cssManager = options.assets.css || new InlineCodeManager();
  let workingDirectory = path.resolve(".");

  // Only add this filter if you’re not re-using your own asset manager.
  if(!options.assets.css) {
    // TODO Add warnings to readme
    // * This will probably only work in a layout template.
    // * Probably complications with components that are only used in a layout template.
    eleventyConfig.addFilter("getVueComponentCssForPage", (url) => {
      return cssManager.getCodeForUrl(url);
    });
  }

  eleventyConfig.addTemplateFormats("vue");

  eleventyConfig.addExtension("vue", {
    read: false, // We use rollup to read the files
    getData: true,
    getInstanceFromInputPath: async function(inputPath) {
      if(!(inputPath in templates)) {
        throw new Error(`"${inputPath}" is not a valid Vue template.`);
      }
      return templates[inputPath];
    },
    init: async function() {
      let inputDir = path.join(workingDirectory, this.config.inputDir);
      let includesDir = path.join(inputDir, this.config.dir.includes);
      let searchGlob = path.join(inputDir, "**/*.vue");
      let vueFiles = await fastglob(searchGlob, {
        caseSensitiveMatch: false
      });
      let rollupVueOptions = lodashMerge({
        css: false,
        template: {
          optimizeSSR: true
        }
        // compilerOptions: {} // https://github.com/vuejs/vue/tree/dev/packages/vue-template-compiler#options
      }, options.rollupPluginVueOptions);

      let bundle = await rollup.rollup({
        input: vueFiles,
        plugins: [
          rollupPluginCssOnly({
            output: (styles, styleNodes) => {
              for(let path in styleNodes) {
                let vuePath = getLocalVueFilePath(path, workingDirectory);
                if(!vueFileToCSSMap[vuePath]) {
                  vueFileToCSSMap[vuePath] = [];
                }
                vueFileToCSSMap[vuePath].push(styleNodes[path]);
              }
            }
          }),
          rollupPluginVue(rollupVueOptions)
        ]
      });

      let { output } = await bundle.write({
        // format: "esm"
        format: "cjs",
        dir: options.cacheDirectory
      });

      // Filter out the normalizer module
      // Careful, using `normalizeComponent` and `__vue_normalize__` here may be brittle
      let normalizer = output.filter(entry => {
        return entry.exports.filter(exp => exp === "normalizeComponent" || exp === "__vue_normalize__").length;
      });
      let normalizerFilename;
      if(normalizer.length) {
        normalizerFilename = normalizer[0].fileName;
      }

      let fullCacheDir = path.join(workingDirectory, options.cacheDirectory);
      clearVueFilesFromRequireCache(fullCacheDir);

      let compiledComponents = output.filter(entry => entry.fileName !== normalizerFilename);
      for(let entry of compiledComponents) {
        if(!entry.facadeModuleId) {
          continue;
        }

        let inputPath = `.${entry.facadeModuleId.substr(workingDirectory.length)}`;
        vueFileToJavaScriptFilenameMap[inputPath] = entry.fileName;

        if(vueFileToCSSMap[inputPath]) {
          cssManager.addComponentCode(entry.fileName, vueFileToCSSMap[inputPath].join("\n"));
        }

        let isFullTemplateFile = !entry.facadeModuleId.startsWith(includesDir);
        if(isFullTemplateFile) {
          let componentPath = path.join(options.cacheDirectory, entry.fileName);
          templates[inputPath] = require(path.join(workingDirectory, componentPath));

          // If you import it, it will roll up the imported CSS in the CSS manager
          let componentImports = entry.imports.filter(entry => !normalizerFilename || entry !== normalizerFilename);
          for(let importFilename of componentImports) {
            cssManager.addComponentRelationship(entry.fileName, importFilename);
          }
        }
      }
    },
    compile: function(str, inputPath) {
      return async (data) => {
        if(!templates[data.page.inputPath]) {
          throw new Error(`"${data.page.inputPath}" is not a valid Vue template.`);
        }

        cssManager.addComponentForUrl(vueFileToJavaScriptFilenameMap[data.page.inputPath], data.page.url);

        Vue.mixin({
          methods: this.config.javascriptFunctions,
          data: function() {
            return data;
          }
        });

        const app = new Vue(templates[data.page.inputPath]);
        return renderer.renderToString(app);
      };
    }
  });
};
