const path = require("path");
const fastglob = require("fast-glob");
const lodashMerge = require("lodash.merge");

const rollup = require("rollup");
const rollupPluginVue = require("rollup-plugin-vue");
const rollupPluginCssOnly = require("rollup-plugin-css-only");

class EleventyVue {
  constructor(cacheDirectory) {
    this.workingDir = path.resolve(".");
    this.cacheDir = cacheDirectory;

    this.vueFileToCSSMap = {};
    this.vueFileToJavaScriptFilenameMap = {};
    this.components = {};
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

  setInputDir(inputDir, includesDir) {
    this.inputDir = path.join(this.workingDir, inputDir);
    this.includesDir = path.join(this.inputDir, includesDir);
  }

  setCacheDir(cacheDir) {
    this.cacheDir = cacheDir;
  }

  isIncludeFile(filepath) {
    return filepath.startsWith(this.includesDir);
  }

  clearRequireCache() {
    let fullCacheDir = path.join(this.workingDir, this.cacheDir);
    let deleteCount = 0;
    for(let fullPath in require.cache) {
      if(fullPath.startsWith(fullCacheDir)) {
        deleteCount++;
        delete require.cache[fullPath];
      }
    }
    // console.log( `Deleted ${deleteCount} vue components from require.cache.` );
  }

  async findFiles() {
    let searchGlob = path.join(this.inputDir, "**/*.vue");
    return fastglob(searchGlob, {
      caseSensitiveMatch: false
    });
  }

  async write() {
    let bundle = await rollup.rollup({
      input: await this.findFiles(),
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

    let { output } = await bundle.write({
      // format: "esm"
      format: "cjs",
      dir: this.cacheDir
    });

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

    this.vueFileToCSSMap[localVuePath].push(cssText);
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

  /* Component Cache */
  addComponent(localVuePath) {
    let jsFilename = this.getJavaScriptComponentFile(localVuePath);
    let fullComponentPath = path.join(this.workingDir, this.cacheDir, jsFilename);
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
}

module.exports = EleventyVue;