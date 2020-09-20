const path = require("path");
const fastglob = require("fast-glob");
const lodashMerge = require("lodash.merge");

const rollup = require("rollup");
const rollupPluginVue = require("rollup-plugin-vue");
const rollupPluginCssOnly = require("rollup-plugin-css-only");

const Vue = require("vue");
const vueServerRenderer = require("vue-server-renderer");
const renderer = vueServerRenderer.createRenderer();

class EleventyVue {
  constructor(cacheDirectory) {
    this.workingDir = path.resolve(".");
    this.cacheDir = cacheDirectory;

    this.vueFileToCSSMap = {};
    this.vueFileToJavaScriptFilenameMap = {};
    this.components = {};

    this.rollupBundleOptions = {
      format: "cjs", // because we’re consuming these in node. See also "esm"
      exports: "default",
      // dir: this.cacheDir
    };
  }

  reset() {
    this.vueFileToCSSMap = {};
  }
  
  resetFor(localVuePath) {
    this.vueFileToCSSMap[localVuePath] = [];
  }

  setRollupPluginVueOptions(rollupPluginVueOptions) {
    this.rollupPluginVueOptions = lodashMerge({
      css: false,
      template: {
        optimizeSSR: true
      }
      // compilerOptions: {} // https://github.com/vuejs/vue/tree/dev/packages/vue-template-compiler#options
    }, rollupPluginVueOptions);
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

    let hasWatchFiles = !!localVuePaths.length;
    let fullJsFilePathMap = {};
    for(let file of localVuePaths) {
      if(file.endsWith(".vue")) {
        fullJsFilePathMap[this.getFullJavaScriptComponentFilePath(file)] = true;
      }
    }

    let deleteCount = 0;
    for(let fullPath in require.cache) {
      if(!hasWatchFiles && fullPath.startsWith(fullCacheDir) ||
        hasWatchFiles && fullJsFilePathMap[fullPath]) {
        deleteCount++;
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
      plugins: [
        rollupPluginCssOnly({
          output: (styles, styleNodes) => {
            for(let fullVuePath in styleNodes) {
              this.addCSS(fullVuePath, styleNodes[fullVuePath]);
            }
          }
        }),
        rollupPluginVue(this.rollupPluginVueOptions)
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

  /* Component Cache */
  addComponent(localVuePath) {
    let fullComponentPath = this.getFullJavaScriptComponentFilePath(localVuePath);
    this.components[localVuePath] = require(fullComponentPath);
  }

  getComponent(localVuePath) {
    this.ensureComponent(localVuePath);
    return this.components[localVuePath];
  }

  ensureComponent(localVuePath) {
    if(!(localVuePath in this.components)) {
      throw new Error(`"${localVuePath}" is not a valid Vue template.`);
    }
  }


  async renderComponent(vueComponent, data, mixin = {}) {
    Vue.mixin(mixin);

    // We don’t use a local mixin for this because it’s global to all components
    // We don’t use a global mixin for this because modifies the Vue object and
    // leaks into other templates (reports wrong page.url!)
    if(!("page" in Vue.prototype)) {
      Object.defineProperty(Vue.prototype, "page", {
        get () {
          // https://vuejs.org/v2/api/#vm-root
          return this.$root.$options.data().page;
        }
      });
    }

    // Full data cascade is available to the root template component
    if(!vueComponent.mixins) {
      vueComponent.mixins = [];
    }
    vueComponent.mixins.push({
      data: function() {
        return data;
      },
    });

    const app = new Vue(vueComponent);

    // returns a promise
    return renderer.renderToString(app);
  }
}

module.exports = EleventyVue;