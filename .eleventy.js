const path = require("path");
const lodashMerge = require("lodash.merge");

const Vue = require("vue");
const vueServerRenderer = require("vue-server-renderer");
const renderer = vueServerRenderer.createRenderer();

const rollup = require("rollup");
const rollupPluginVue = require("rollup-plugin-vue");
const rollupPluginCssOnly = require("rollup-plugin-css-only");

const { InlineCodeManager } = require("@11ty/eleventy-assets");

const EleventyVue = require("./EleventyVue");

const globalOptions = {
  cacheDirectory: ".cache/vue/",
  // See https://rollup-plugin-vue.vuejs.org/options.html
  rollupPluginVueOptions: {},
  assets: {
    css: null
  } // optional `eleventy-assets` instances
};

module.exports = function(eleventyConfig, configGlobalOptions = {}) {
  let options = lodashMerge({}, globalOptions, configGlobalOptions);

  let eleventyVue = new EleventyVue();
  eleventyVue.setCacheDir(options.cacheDirectory);

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
    getInstanceFromInputPath: function(inputPath) {
      return eleventyVue.getComponent(inputPath);
    },
    init: async function() {
      eleventyVue.setInputDir(this.config.inputDir, this.config.dir.includes);
      eleventyVue.clearRequireCache();

      let rollupVueOptions = lodashMerge({
        css: false,
        template: {
          optimizeSSR: true
        }
        // compilerOptions: {} // https://github.com/vuejs/vue/tree/dev/packages/vue-template-compiler#options
      }, options.rollupPluginVueOptions);

      let bundle = await rollup.rollup({
        input: await eleventyVue.findFiles(),
        plugins: [
          rollupPluginCssOnly({
            output: (styles, styleNodes) => {
              for(let fullVuePath in styleNodes) {
                eleventyVue.addCSS(fullVuePath, styleNodes[fullVuePath]);
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

      let compiledComponents = output.filter(entry => entry.fileName !== normalizerFilename);
      for(let entry of compiledComponents) {
        if(!entry.facadeModuleId) {
          continue;
        }

        let inputPath = eleventyVue.getLocalVueFilePath(entry.facadeModuleId);
        eleventyVue.addVueToJavaScriptMapping(inputPath, entry.fileName);

        let css = eleventyVue.getCSSForVueComponent(inputPath);
        if(css) {
          cssManager.addComponentCode(entry.fileName, css);
        }

        let isFullTemplateFile = !eleventyVue.isIncludeFile(entry.facadeModuleId);
        if(isFullTemplateFile) {
          eleventyVue.addComponent(inputPath);

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
        let vueComponent = eleventyVue.getComponent(data.page.inputPath);

        let componentName = eleventyVue.getJavaScriptComponentFile(data.page.inputPath);
        cssManager.addComponentForUrl(componentName, data.page.url);

        Vue.mixin({
          methods: this.config.javascriptFunctions,
          data: function() {
            return data;
          }
        });

        const app = new Vue(vueComponent);
        return renderer.renderToString(app);
      };
    }
  });
};

module.exports.EleventyVue = EleventyVue;