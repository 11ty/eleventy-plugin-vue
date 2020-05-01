const path = require("path");
const fastglob = require("fast-glob");

class EleventyVue {
  constructor(cacheDirectory) {
    this.workingDir = path.resolve(".");
    this.cacheDir = cacheDirectory;

    this.vueFileToCSSMap = {};
    this.vueFileToJavaScriptFilenameMap = {};
    this.components = {};
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

  getCSSForVueComponent(localVuePath) {
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