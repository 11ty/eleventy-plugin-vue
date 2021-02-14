const lodashMerge = require("lodash.merge");
const debug = require("debug")("EleventyVue");

const { InlineCodeManager } = require("@11ty/eleventy-assets");

const EleventyVue = require("./EleventyVue");

const pkg = require("./package.json");

const globalOptions = {
  input: [], // point to a specific list of Vue files (defaults to **/*.vue)

  // Because Vue components live in the _includes directory alongside Eleventy layout files, it’s
  // faster to use a _layouts dir instead of _includes dir for Eleventy layouts.
  // Enable this feature to use Eleventy layouts inside of _includes too (it’s slower)
  searchIncludesDirectoryForLayouts: false,
  searchLayoutsDirectoryForLayouts: true,

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
  eleventyVue.setCssManager(cssManager);

  let changedVueFilesOnWatch = [];
  let skipVueBuild = false;

  // Only add this filter if you’re not re-using your own asset manager.
  // TODO Add warnings to readme
  // * This will probably only work in a layout template.
  // * Probably complications with components that are only used in a layout template.
  eleventyConfig.addFilter("getVueComponentCssForPage", (url) => {
    let components = cssManager.getComponentListForUrl(url);
    let css = cssManager.getCodeForUrl(url);
    debug("Component CSS for %o component count: %o, CSS size: %o: %O", url, components.length, css.length, components);
    return css;
  });

  // TODO check if verbose mode for console.log
  eleventyConfig.on("afterBuild", () => {
    let count = eleventyVue.componentsWriteCount;
    if(count > 0) {
      console.log( `Built ${count} component${count !== 1 ? "s" : ""} (eleventy-plugin-vue v${pkg.version})` );
    }
  });

  // `beforeWatch` is available on Eleventy 0.11.0 and newer
  eleventyConfig.on("beforeWatch", (changedFiles) => {
    let hasChangedFiles = changedFiles && changedFiles.length > 0;

    // `changedFiles` array argument is available on Eleventy 0.11.1+
    changedVueFilesOnWatch = (changedFiles || []).filter(file => file.endsWith(".vue"));

    // Only reset what changed! (Partial builds for Vue rollup files)
    if(changedVueFilesOnWatch.length > 0) {
      skipVueBuild = false;
      for(let localVuePath of changedVueFilesOnWatch) {
        let jsFilename = eleventyVue.getJavaScriptComponentFile(localVuePath);
        cssManager.resetComponentCodeFor(jsFilename);

        eleventyVue.resetFor(localVuePath);
      }
    } else {
      if(hasChangedFiles) {
        skipVueBuild = true;
      }
      // TODO reset all if incremental not enabled
      // cssManager.resetComponentCode();
      // eleventyVue.reset();
    }
    eleventyVue.clearRequireCache();
  });

  eleventyConfig.addTemplateFormats("vue");

  eleventyConfig.addExtension("vue", {
    read: false, // We use rollup to read the files
    getData: true,
    getInstanceFromInputPath: function(inputPath) {
      return eleventyVue.getComponent(inputPath);
    },
    init: async function() {
      eleventyVue.resetIgnores();
      eleventyVue.setInputDir(this.config.inputDir);
      eleventyVue.setIncludesDir(this.config.dir.includes, !options.searchIncludesDirectoryForLayouts);
      eleventyVue.setLayoutsDir(this.config.dir.layouts, !options.searchLayoutsDirectoryForLayouts);

      eleventyVue.setRollupPluginVueOptions(options.rollupPluginVueOptions);

      if(skipVueBuild) {
        // we only call this to set the write count for the build
        eleventyVue.createVueComponents([]);
      } else {
        let files = changedVueFilesOnWatch;
        if(!files || !files.length) {
          // input passed in via config
          if(options.input && options.input.length) {
            files = options.input;
          } else {
            files = await eleventyVue.findFiles();
          }
        }
        let bundle = await eleventyVue.getBundle(files);
        let output = await eleventyVue.write(bundle);
  
        eleventyVue.createVueComponents(output);
      }
    },
    compile: function(str, inputPath) {
      // TODO this runs twice per template
      return async (data) => {
        // since `read: false` is set 11ty doesn't read file contents
        // so if str has a value, it's a permalink (which can be a string or a function)
        // currently Vue template syntax in permalink string is not supported.
        if (str) {
          if(typeof str === "function") {
            return await str(data);
          }
          return str;
        }

        let vueComponent = eleventyVue.getComponent(data.page.inputPath);

        let componentName = eleventyVue.getJavaScriptComponentFile(data.page.inputPath);
        debug("Vue CSS: Adding component %o to %o", componentName, data.page.url);
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
