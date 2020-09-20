const path = require("path");
const lodashMerge = require("lodash.merge");

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

  let changedFilesOnWatch = [];

  // Only add this filter if you’re not re-using your own asset manager.
  // TODO Add warnings to readme
  // * This will probably only work in a layout template.
  // * Probably complications with components that are only used in a layout template.
  eleventyConfig.addFilter("getVueComponentCssForPage", (url) => {
    return cssManager.getCodeForUrl(url);
  });

  // `beforeWatch` is available on Eleventy 0.11.0 (beta.3) and newer
  eleventyConfig.on("beforeWatch", (changedFiles) => {
    // `changedFiles` array argument is available on Eleventy 1.0+
    changedFilesOnWatch = (changedFiles || []).filter(file => file.endsWith(".vue"));

    // Only reset what changed! (Partial builds for Vue rollup files)
    if(changedFilesOnWatch.length) {
      for(let localVuePath of changedFilesOnWatch) {
        let jsFilename = eleventyVue.getJavaScriptComponentFile(localVuePath);
        cssManager.resetComponentCodeFor(jsFilename);

        eleventyVue.resetFor(localVuePath);
      }
    } else {
      cssManager.resetComponentCode();
      eleventyVue.reset();
    }
  });

  eleventyConfig.addTemplateFormats("vue");

  eleventyConfig.addExtension("vue", {
    read: false, // We use rollup to read the files
    getData: true,
    getInstanceFromInputPath: function(inputPath) {
      return eleventyVue.getComponent(inputPath);
    },
    init: async function() {
      eleventyVue.setInputDir(this.config.inputDir);
      eleventyVue.setIncludesDir(path.join(this.config.inputDir, this.config.dir.includes));
      eleventyVue.setRollupPluginVueOptions(options.rollupPluginVueOptions);
      eleventyVue.clearRequireCache(changedFilesOnWatch);

      let files = changedFilesOnWatch;
      if(!files || !files.length) {
        files = await eleventyVue.findFiles();
      }
      let bundle = await eleventyVue.getBundle(files);
      let output = await eleventyVue.write(bundle);

      for(let entry of output) {
        let fullVuePath = entry.facadeModuleId;
        let inputPath = eleventyVue.getLocalVueFilePath(fullVuePath);
        let jsFilename = entry.fileName;
        eleventyVue.addVueToJavaScriptMapping(inputPath, jsFilename);

        let css = eleventyVue.getCSSForComponent(inputPath);
        if(css) {
          cssManager.addComponentCode(jsFilename, css);
        }

        let isFullTemplateFile = !eleventyVue.isIncludeFile(fullVuePath);
        if(isFullTemplateFile) {
          eleventyVue.addComponent(inputPath);

          // If you import it, it will roll up the imported CSS in the CSS manager
          for(let importFilename of entry.imports) {
            cssManager.addComponentRelationship(jsFilename, importFilename);
          }
        }
      }
    },
    compile: function(str, inputPath) {
      return async (data) => {
        let vueComponent = eleventyVue.getComponent(data.page.inputPath);

        let componentName = eleventyVue.getJavaScriptComponentFile(data.page.inputPath);
        cssManager.addComponentForUrl(componentName, data.page.url);

        let vueMixin = {
          methods: this.config.javascriptFunctions,
        };

        return eleventyVue.renderComponent(vueComponent, data, vueMixin);
      };
    }
  });
};

module.exports.EleventyVue = EleventyVue;