const path = require("path");
const fastglob = require("fast-glob");
const lodashMerge = require("lodash.merge");

const rollup = require("rollup");
const rollupPluginVue = require("rollup-plugin-vue");
const rollupPluginCssOnly = require("rollup-plugin-css-only");

const Vue = require("vue");
const vueServerRenderer = require("vue-server-renderer");
const renderer = vueServerRenderer.createRenderer();

const debug = require("debug")("EleventyVue");

class EleventyVue {
  constructor(cacheDirectory) {
    this.workingDir = path.resolve(".");

    this.vueFileToCSSMap = {};
    this.vueFileToJavaScriptFilenameMap = {};

    this.rollupBundleOptions = {
      format: "cjs", // because we’re consuming these in node. See also "esm"
      exports: "default",
      preserveModules: true, // keeps separate files on the file system
      // dir: this.cacheDir // set via setCacheDir
      entryFileNames: (chunkInfo) => {
        debug("Rollup chunk %o", chunkInfo.facadeModuleId);
        return "[name].js";
      }
    };
    
    this.setCacheDir(cacheDirectory);

    this.componentsWriteCount = 0;
  }
  
  getEntryFileName(localpath) {
    if(localpath.endsWith(".vue")) {
      localpath = localpath.substr(0, localpath.length - 4) + ".js";
    }
    if(localpath.startsWith(this.workingDir)) {
      localpath = localpath.substr(this.workingDir.length);
    }
    let split = localpath.split(path.sep);
    if(!split[0]) {
      split.shift();
    }
    return split.join("__");
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

  getFullCacheDir() {
    if(this.cacheDir.startsWith("/")) {
      return this.cacheDir;
    }
    return path.join(this.workingDir, this.cacheDir);
  }

  isIncludeFile(filepath) {
    return filepath.startsWith(this.includesDir);
  }

  clearRequireCache() {
    let fullCacheDir = this.getFullCacheDir();
    let deleteCount = 0;
    for(let fullPath in require.cache) {
      if(fullPath.startsWith(fullCacheDir)) {
        deleteCount++;
        debug( "Deleting from require cache: %o", fullPath );
        delete require.cache[fullPath];
      }
    }
    debug( "Deleted %o vue components from require.cache.", deleteCount );
  }

  async findFiles(glob = "**/*.vue") {
    let globPath = path.join(this.inputDir, glob);

    return fastglob(globPath, {
      caseSensitiveMatch: false,
      // rollup handles the includes for us.
      ignore: [`${this.includesDir}/**`],
    });
  }

  // Glob is optional
  async getBundle(input) {
    if(!input) {
      input = await this.findFiles();
    }

    debug("Passed %o Vue files to getBundle", input.length);

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
    debug("Created %o Vue components", output.length);
    this.componentsWriteCount = 0;
    for(let entry of output) {
      let fullVuePath = entry.facadeModuleId;
      // if(entry.fileName.endsWith("rollup-plugin-vue=script.js") || 
      if(fullVuePath.endsWith("vue-runtime-helpers/dist/normalize-component.mjs")) {
        continue;
      }

      let inputPath = this.getLocalVueFilePath(fullVuePath);
      let jsFilename = entry.fileName;
      let intermediateComponent = false;
      let css;

      if(fullVuePath.endsWith("?rollup-plugin-vue=script.js")) {
        intermediateComponent = true;
        css = false;
      } else {
        debug("Adding Vue file to JS component file name mapping: %o to %o (via %o)", inputPath, entry.fileName, fullVuePath);
        this.addVueToJavaScriptMapping(inputPath, jsFilename);

        css = this.getCSSForComponent(inputPath);
        if(css && this.cssManager) {
          this.cssManager.addComponentCode(jsFilename, css);
        }
      }

      if(this.cssManager) {
        // If you import it, it will roll up the imported CSS in the CSS manager
        let importList = entry.imports || [];
        // debug("filename: %o importedBindings:", entry.fileName, Object.keys(entry.importedBindings));
        debug("filename: %o imports:", entry.fileName, entry.imports);
        // debug("modules: %O", Object.keys(entry.modules));

        for(let importFilename of importList) {
          if(importFilename.endsWith("vue-runtime-helpers/dist/normalize-component.js")) {
            continue;
          }
          this.cssManager.addComponentRelationship(jsFilename, importFilename);
        }
      }

      debug("Created %o from %o" + (css ? " w/ CSS" : " without CSS") + (intermediateComponent ? " (intermediate/connector component)" : ""), jsFilename, inputPath);
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
    let css = cssText.trim();
    debug("Adding CSS to %o, length: %o", localVuePath, css.length);

    this.vueFileToCSSMap[localVuePath].push(css);
  }

  getCSSForComponent(localVuePath) {
    let css = (this.vueFileToCSSMap[localVuePath] || []).join("\n");
    debug("Getting CSS for component: %o, length: %o", localVuePath, css.length);
    return css;
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
    debug("Map vue path to JS component file: %o to %o", localVuePath, jsFilename);
    let fullComponentPath = path.join(this.getFullCacheDir(), jsFilename);
    return fullComponentPath;
  }

  getComponent(localVuePath) {
    let fullComponentPath = this.getFullJavaScriptComponentFilePath(localVuePath);
    let component = require(fullComponentPath);
    return component;
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