const lodashMerge = require("lodash.merge");
const debug = require("debug")("EleventyVue");

const { InlineCodeManager } = require("@11ty/eleventy-assets");

const EleventyVue = require("./EleventyVue");

const pkg = require("./package.json");

const globalOptions = {
  input: [], // point to a specific list of Vue files (defaults to **/*.vue)

  readOnly: false,

  cacheDirectory: ".cache/vue/",

  // See https://www.rollupjs.org/guide/en/#big-list-of-options
  rollupOptions: {},

  // See https://rollup-plugin-vue.vuejs.org/options.html
  rollupPluginVueOptions: {},

  assets: {
    css: null
  } // optional `eleventy-assets` instances
};

module.exports = function(eleventyConfig, configGlobalOptions = {}) {
  try {
    eleventyConfig.versionCheck(pkg["11ty"].compatibility);
  } catch(e) {
    console.log( `WARN: Eleventy Plugin (${pkg.name}) Compatibility: ${e.message}` );
  }

  let options = lodashMerge({}, globalOptions, configGlobalOptions);

  let eleventyVue = new EleventyVue();
  eleventyVue.setCacheDir(options.cacheDirectory);
  eleventyVue.setReadOnly(options.readOnly);

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

  let eleventyIgnores;
  eleventyConfig.on("eleventy.ignores", ignores => {
    eleventyIgnores = ignores;
  });

  // Default output
  let isVerboseMode = true;
  eleventyConfig.on("eleventy.config", config => {
    // Available in 1.0.0-beta.6+
    if(config.verbose !== undefined) {
      isVerboseMode = config.verbose;
    }
  });

  eleventyConfig.on("afterBuild", () => {
    let count = eleventyVue.componentsWriteCount;
    if(isVerboseMode && count > 0) {
      console.log( `Built ${count} component${count !== 1 ? "s" : ""} (eleventy-plugin-vue v${pkg.version}${version ? ` with Vue ${version}` : ""})` );
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
    } else {
      if(hasChangedFiles) {
        skipVueBuild = true;
      }
    }
    eleventyVue.clearRequireCache();
  });

  eleventyConfig.addTemplateFormats("vue");

  eleventyConfig.addExtension("vue", {
    read: false, // We use rollup to read the files
    getData: [ // get data from both the data function and serverPrefetch
      "data",
      "serverPrefetch"
    ],
    getInstanceFromInputPath: function(inputPath) {
      return eleventyVue.getComponent(inputPath);
    },
    init: async function() {
      eleventyVue.setInputDir(this.config.inputDir);
      eleventyVue.setIncludesDir(this.config.dir.includes);
      eleventyVue.setLayoutsDir(this.config.dir.layouts);
      eleventyVue.resetIgnores(eleventyIgnores);

      eleventyVue.setRollupOptions(options.rollupOptions);
      eleventyVue.setRollupPluginVueOptions(options.rollupPluginVueOptions);

      if(skipVueBuild) {
        // we only call this to set the write count for the build
        eleventyVue.createVueComponents([]);
      } else if(options.readOnly && eleventyVue.hasRollupOutputCache()) {
        await eleventyVue.loadRollupOutputCache();
      } else {
        let files = changedVueFilesOnWatch;
        let isSubset = false;

        if(files && files.length) {
          isSubset = true;
        } else {
          // input passed in via config
          if(options.input && options.input.length) {
            files = options.input;
            isSubset = true;
          } else {
            files = await eleventyVue.findFiles();
          }
        }

        // quit early
        if(!files || !files.length) {
          return;
        }

        try {
          let bundle = await eleventyVue.getBundle(files, isSubset);
          let output = await eleventyVue.write(bundle);
  
          eleventyVue.createVueComponents(output);
        } catch(e) {
          if(e.loc) {
            e.message = `Error in Vue file ${e.loc.file} on Line ${e.loc.line} Column ${e.loc.column}: ${e.message}`
          }
          throw e;
        }

        if(!options.readOnly && !isSubset) { // implied eleventyVue.hasRollupOutputCache() was false
          await eleventyVue.writeRollupOutputCache();
        }
      }
    },
    compile: function(str, inputPath) {
      // TODO this runs twice per template
      return async (data) => {
        // since `read: false` is set 11ty doesn't read file contents
        // so if str has a value, it's a permalink (which can be a string or a function)
        // currently Vue template syntax in permalink string is not supported.
        let vueMixin = {
          methods: this.config.javascriptFunctions,
        };

        if (str) {
          if(typeof str === "function") {
            return str(data);
          }
          if(typeof str === "string" && str.trim().charAt("0") === "<") {
            return eleventyVue.renderString(str, data, vueMixin);
          }
          return str;
        }

        let vueComponent = eleventyVue.getComponent(inputPath);
        let componentName = eleventyVue.getJavaScriptComponentFile(inputPath);
        debug("Vue CSS: Adding component %o to %o", componentName, data.page.url);
        cssManager.addComponentForUrl(componentName, data.page.url);

        return eleventyVue.renderComponent(vueComponent, data, vueMixin);
      };
    }
  });
};

module.exports.EleventyVue = EleventyVue;
