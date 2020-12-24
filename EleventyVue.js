const path = require("path");
const fastglob = require("fast-glob");
const lodashMerge = require("lodash.merge");

const rollup = require("rollup");
const rollupPluginVue = require("rollup-plugin-vue");
const rollupPluginCssOnly = require("rollup-plugin-css-only");

const { createSSRApp } = require('vue')
const { renderToString } = require('@vue/server-renderer');

class EleventyVue {
  constructor(cacheDirectory) {
    this.workingDir = path.resolve(".");
    this.cacheDir = cacheDirectory;

    this.vueFileToCSSMap = {};
    this.vueFileToJavaScriptFilenameMap = {};

    this.rollupBundleOptions = {
      format: "cjs", // because we’re consuming these in node. See also "esm"
      exports: "default",
      // dir: this.cacheDir
    };

    this.componentsWriteCount = 0;
  }

  reset() {
    this.vueFileToCSSMap = {};
  }
  
  resetFor(localVuePath) {
    this.vueFileToCSSMap[localVuePath] = [];
  }

  setCssManager(cssManager) {
    this.cssManager = cssManager;
  }

  setRollupPluginVueOptions(rollupPluginVueOptions) {
    this.rollupPluginVueOptions = rollupPluginVueOptions;
  }

  getRollupPluginVueOptions() {
    return lodashMerge({
      target: "node",
      css: false,
      template: {
        optimizeSSR: true
      }
      // compilerOptions: {} // https://github.com/vuejs/vue/tree/dev/packages/vue-template-compiler#options
    }, this.rollupPluginVueOptions);
  }

  setInputDir(inputDir) {
    this.inputDir = path.join(this.workingDir, inputDir);
  }
  
  setIncludesDir(includesDir) {
    this.includesDir = path.join(this.workingDir, includesDir);
  }

  setCacheDir(cacheDir) {
    this.cacheDir = cacheDir;
    this.rollupBundleOptions.dir = cacheDir;
  }

  isIncludeFile(filepath) {
    return filepath.startsWith(this.includesDir);
  }

  clearRequireCache(localVuePaths = []) {
    let fullCacheDir = path.join(this.workingDir, this.cacheDir);

    let deleteCount = 0;
    for(let fullPath in require.cache) {
      if(fullPath.startsWith(fullCacheDir)) {
        deleteCount++;
        // console.log( "Deleting from cache", fullPath );
        delete require.cache[fullPath];
      }
    }
    // console.log( `Deleted ${deleteCount} vue components from require.cache.` );
  }

  async findFiles(glob = "**/*.vue") {
    let globPath = path.join(this.inputDir, glob);
    return fastglob(globPath, {
      caseSensitiveMatch: false
    });
  }

  // Glob is optional
  async getBundle(input) {
    if(!input) {
      input = await this.findFiles();
    }

    let bundle = await rollup.rollup({
      input: input,
      external: ["vue", "@vue/server-renderer"],
      plugins: [
        rollupPluginCssOnly({
          output: (styles, styleNodes) => {
            for(let fullVuePath in styleNodes) {
              this.addCSS(fullVuePath, styleNodes[fullVuePath]);
            }
          }
        }),
        rollupPluginVue(this.getRollupPluginVueOptions())
      ]
    });

    return bundle;
  }

  // async generateFromBundle(bundle) {
  //   let { output } = await bundle.generate(this.rollupBundleOptions);

  //   return output;
  // }

  async write(bundle) {
    if(!bundle) {
      throw new Error("Eleventy Vue Plugin: write(bundle) needs a bundle argument.");
    }

    let { output } = await bundle.write(this.rollupBundleOptions);

    output = output.filter(entry => !!entry.facadeModuleId);

    return output;
  }

  // output is returned from .write()
  createVueComponents(output) {
    this.componentsWriteCount = 0;
    for(let entry of output) {
      let fullVuePath = entry.facadeModuleId;
      let inputPath = this.getLocalVueFilePath(fullVuePath);
      let jsFilename = entry.fileName;
      this.addVueToJavaScriptMapping(inputPath, jsFilename);
      let css = this.getCSSForComponent(inputPath);
      if(css && this.cssManager) {
        this.cssManager.addComponentCode(jsFilename, css);
      }

      let isFullTemplateFile = !this.isIncludeFile(fullVuePath);
      if(isFullTemplateFile) {
        if(this.cssManager) {
          // If you import it, it will roll up the imported CSS in the CSS manager

          for(let importFilename of entry.imports) {
            this.cssManager.addComponentRelationship(jsFilename, importFilename);
          }
        }
      }
      this.componentsWriteCount++;
    }
  }

  getLocalVueFilePath(fullPath) {
    let filePath = fullPath;
    if(fullPath.startsWith(this.workingDir)) {
      filePath = `.${fullPath.substr(this.workingDir.length)}`;
    }
    let extension = ".vue";
    return filePath.substr(0, filePath.lastIndexOf(extension) + extension.length);
  }

  /* CSS */
  addCSS(fullVuePath, cssText) {
    let localVuePath = this.getLocalVueFilePath(fullVuePath);
    if(!this.vueFileToCSSMap[localVuePath]) {
      this.vueFileToCSSMap[localVuePath] = [];
    }

    this.vueFileToCSSMap[localVuePath].push(cssText.trim());
  }

  getCSSForComponent(localVuePath) {
    return (this.vueFileToCSSMap[localVuePath] || []).join("\n");
  }

  /* Map from vue files to compiled JavaScript files */
  addVueToJavaScriptMapping(localVuePath, jsFilename) {
    this.vueFileToJavaScriptFilenameMap[localVuePath] = jsFilename;
  }

  getJavaScriptComponentFile(localVuePath) {
    return this.vueFileToJavaScriptFilenameMap[localVuePath];
  }

  getFullJavaScriptComponentFilePath(localVuePath) {
    let jsFilename = this.getJavaScriptComponentFile(localVuePath);
    let fullComponentPath = path.join(this.workingDir, this.cacheDir, jsFilename);
    return fullComponentPath;
  }

  getComponent(localVuePath) {
    let fullComponentPath = this.getFullJavaScriptComponentFilePath(localVuePath);
    return require(fullComponentPath);
  }

  async renderComponent(vueComponent, data, mixin = {}) {
    // Full data cascade is available to the root template component
    if(!vueComponent.mixins) {
      vueComponent.mixins = [];
    }
    vueComponent.mixins.push({
      data: function() {
        return data;
      },
    });

    const app = createSSRApp(vueComponent);
    
    // Add page data:
    if(!mixin.computed) {
      mixin.computed = {};
    }
    mixin.computed.page = function() {
      return data.page;
    };

    app.mixin(mixin);

    // returns a promise
    return renderToString(app);
  }
}

module.exports = EleventyVue;