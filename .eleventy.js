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

  // Only add this filter if you’re not re-using your own asset manager.
  // TODO Add warnings to readme
  // * This will probably only work in a layout template.
  // * Probably complications with components that are only used in a layout template.
  eleventyConfig.addFilter("getVueComponentCssForPage", (url) => {
    return cssManager.getCodeForUrl(url);
  });

  // `beforeWatch` is supported on Eleventy 0.11.0-beta.3 and newer
  eleventyConfig.on("beforeWatch", () => {
    cssManager.resetComponentCode();
    eleventyVue.reset();
  });

  eleventyConfig.addTemplateFormats("vue");

  eleventyConfig.addExtension("vue", {
    read: false, // We use rollup to read the files
    getData: true,
    getInstanceFromInputPath: function(inputPath) {
      return eleventyVue.getComponent(inputPath);
    },
    init: async function() {
      eleventyVue.setInputDir(this.config.inputDir, this.config.dir.includes);
      eleventyVue.setRollupPluginVueOptions(options.rollupPluginVueOptions);
      eleventyVue.clearRequireCache();

      let output = await eleventyVue.write();

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