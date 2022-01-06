const lodashMerge = require("lodash.merge");
const debug = require("debug")("EleventyVue");

const { InlineCodeManager } = require("@11ty/eleventy-assets");
const { DepGraph } = require('dependency-graph');

const EleventyVue = require("./EleventyVue");

const pkg = require("./package.json");

const globalOptions = {
  input: [], // point to a specific list of Vue files (defaults to **/*.vue)

  // Because Vue components live in the _includes directory alongside Eleventy layout files, it’s
  // faster to use a _layouts dir instead of _includes dir for Eleventy layouts.
  // Enable this feature to use Eleventy layouts inside of _includes too (it’s slower)
  searchIncludesDirectoryForLayouts: false,
  searchLayoutsDirectoryForLayouts: false,

  readOnly: false,

  cacheDirectory: ".cache/vue/",

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

  let componentGraph = new DepGraph();
  eleventyVue.setComponentGraph(componentGraph);

  let changedVueFilesOnWatch = [];
  let skipVueBuild = false;

  function isFileRelevantToIncrementalBuild(fullTemplateInputPath, changedFiles = []) {
    if(changedFiles.length === 0) {
      return true;
    }

    let lookingForJsFile = eleventyVue.getRelativeJsPathFromVuePath(fullTemplateInputPath);
    for(let file of changedFiles) {
      if(file === fullTemplateInputPath) {
        return true;
      }

      if(eleventyVue.isIncludeFile(file)) {
        let components = eleventyVue.getAllComponentsUsedBy(file);
        if(components.indexOf(lookingForJsFile) > -1) {
          debug( "Matched %o to %o, was relevant to %o components" , fullTemplateInputPath, file, components.length );
          return true;
        }
      }
    }

    return false;
  }

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

  eleventyConfig.on("beforeBuild", () => {
    // TODO delete nodes from this graph that have changed, see `changedVueFilesOnWatch`
    eleventyVue.setComponentGraph(componentGraph);
  });

  // TODO check if verbose mode for console.log
  eleventyConfig.on("afterBuild", () => {
    let count = eleventyVue.componentsWriteCount;
    if(count > 0) {
      console.log( `Built ${count} component${count !== 1 ? "s" : ""} (eleventy-plugin-vue v${pkg.version})` );
    }
  });

  // `beforeWatch` is available on Eleventy 0.11.0 and newer
  eleventyConfig.on("beforeWatch", changedFiles => {
    if(!Array.isArray(changedFiles)) {
      changedFiles = [];
    }

    // `changedFiles` array argument is available on Eleventy 0.11.1+
    changedVueFilesOnWatch = changedFiles.filter(file => file.endsWith(".vue"));

    // Only reset what changed! (Partial builds for Vue rollup files)
    if(changedVueFilesOnWatch.length > 0) {
      skipVueBuild = false;
    } else if(changedFiles.length > 0) { // files changed but not Vue ones
      skipVueBuild = true;
    } else {
      skipVueBuild = false;
    }

    // TODO make this more granular and only run if the Vue build if !skipVueBuild
    eleventyVue.clearRequireCache();
  });

  eleventyConfig.addTemplateFormats("vue");

  eleventyConfig.addExtension("vue", {
    read: false, // We use rollup to read the files
    getInstanceFromInputPath: function(inputPath) {
      return eleventyVue.getComponent(inputPath);
    },
    getData: [
      // don’t include serverPrefetch by default—a lot of async data fetching happens here!
      "data",
    ],
    init: async function() {
      eleventyVue.setInputDir(this.config.inputDir);
      eleventyVue.setIncludesDir(this.config.dir.includes, !options.searchIncludesDirectoryForLayouts);
      eleventyVue.setLayoutsDir(this.config.dir.layouts, !options.searchLayoutsDirectoryForLayouts);
      eleventyVue.resetIgnores(eleventyIgnores);

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

        let bundle = await eleventyVue.getBundle(files, isSubset);
        let output = await eleventyVue.write(bundle);

        eleventyVue.createVueComponents(output);

        if(!options.readOnly && !isSubset) { // implied eleventyVue.hasRollupOutputCache() was false
          await eleventyVue.writeRollupOutputCache();
        }
      }
    },

    // Caching
    compileOptions: {
      permalink: contents => contents,

      // Skipping function compilation cache (for now) to simplify incremental builds (incremental builds are *worth it*)
      cache: false,
    },

    isIncrementalMatch: function(changedFile) {
      let relevant = isFileRelevantToIncrementalBuild(this.inputPath, [changedFile]);
      // debug( "isIncrementalMatch", this.inputPath, changedFile, { relevant } );
      return relevant;
    },

    compile: function(str, inputPath) {
      // since `read: false` is set 11ty doesn't read file contents
      let vueMixin = {
        methods: this.config.javascriptFunctions,
      };

      // Since `read: false`, str should only have a value for permalink compilation
      if (str) {
        return (data) => {
          if(typeof str === "string" && str.trim().charAt("0") === "<") {
            return eleventyVue.renderString(str, data, vueMixin);
          }
          return str;
        };
      }

      if(!isFileRelevantToIncrementalBuild(inputPath, changedVueFilesOnWatch)) {
        return;
      }

      let vueComponent = eleventyVue.getComponent(inputPath);
      let componentName = eleventyVue.getJavaScriptComponentFile(inputPath);

      return async (data) => {
        // if user attempts to render a Vue template in `serverPrefetch` or `data` to add to the data cascade
        // this will fail because data.page does not exist yet!
        if(data.page) {
          debug("Vue CSS: Adding component %o to %o", componentName, data.page.url);
          cssManager.addComponentForUrl(componentName, data.page.url);
        }

        return eleventyVue.renderComponent(vueComponent, data, vueMixin);
      };
    }
  });
};

module.exports.EleventyVue = EleventyVue;
