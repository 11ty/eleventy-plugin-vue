const path = require("path");
const fs = require("fs");
const fsp = fs.promises;
const fastglob = require("fast-glob");
const lodashMerge = require("lodash.merge");
const { DepGraph } = require("dependency-graph");

const rollup = require("rollup");
const rollupPluginVue = require("rollup-plugin-vue");
const rollupPluginCssOnly = require("rollup-plugin-css-only");

const Vue = require("vue");
const vueServerRenderer = require("vue-server-renderer");
const renderer = vueServerRenderer.createRenderer();

const debug = require("debug")("EleventyVue");
const debugDev = require("debug")("Dev:EleventyVue");

function addLeadingDotSlash(pathArg) {
  if(pathArg === "." || pathArg === "..") {
    return pathArg + "/";
  }

  if (
    path.isAbsolute(pathArg) ||
    pathArg.startsWith("./") ||
    pathArg.startsWith("../")
  ) {
    return pathArg;
  }

  return "./" + pathArg;
};

class EleventyVue {
  constructor(cacheDirectory) {
    this.workingDir = path.resolve(".");
    this.ignores = new Set();

    this.vueFileToCSSMap = {};
    this.vueFileToJavaScriptFilenameMap = {};
    this.componentRelationships = [];
    this.componentGraph = new DepGraph();

    this.defaultRollupOptions = {
      onwarn(warning, warn) {
        if(warning.code === "UNUSED_EXTERNAL_IMPORT") {
          debug("Unused external import: %O", warning);
        } else {
          warn(warning);
        }
      },
      external: ["vue", "@vue/server-renderer"]
    };

    this.rollupBundleOptions = {
      format: "cjs", // because we’re consuming these in node. See also "esm"
      exports: "default",
      preserveModules: true, // keeps separate files on the file system
      // dir: this.cacheDir // set via setCacheDir
      entryFileNames: (chunkInfo) => {
        debugDev("Rollup chunk %o", chunkInfo.facadeModuleId);
        return "[name].js";
      }
    };

    this.setCacheDir(cacheDirectory);

    this.componentsWriteCount = 0;
    this.readOnly = false;
  }

  setComponentGraph(graph) {
    this.componentGraph = graph;
  }

  setReadOnly(readOnly) {
    this.readOnly = !!readOnly;
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
    this.componentRelationships = [];
  }

  // Deprecated, use resetCSSFor above
  resetFor(localVuePath) {
    debug("Clearing CSS styleNodes in Vue for %o", localVuePath);
    this.vueFileToCSSMap[localVuePath] = [];
  }

  setCssManager(cssManager) {
    this.cssManager = cssManager;
  }

  setRollupOptions(options) {
    this.rollupOptions = options;
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

  resetIgnores(extraIgnores = []) {
    this.ignores = new Set();

    let relativeIncludesDir = this.rawIncludesDir ? addLeadingDotSlash(path.join(this.relativeInputDir, this.rawIncludesDir)) : undefined;
    let relativeLayoutsDir = this.rawLayoutsDir ? addLeadingDotSlash(path.join(this.relativeInputDir, this.rawLayoutsDir)) : undefined;

    for(let ignore of extraIgnores) {
      if(relativeIncludesDir && ignore.startsWith(relativeIncludesDir)) {
        // do nothing
      } else if(relativeLayoutsDir && ignore.startsWith(relativeLayoutsDir)) {
        // do nothing
      } else {
        this.ignores.add(ignore);
      }
    }
  }

  setInputDir(inputDir) {
    this.relativeInputDir = inputDir;
    this.inputDir = path.join(this.workingDir, inputDir);
  }

  setIncludesDir(includesDir, useInFileSearch = false) {
    if(includesDir) {
      // Was: path.join(this.workingDir, includesDir);
      // Which seems wrong? per https://www.11ty.dev/docs/config/#directory-for-includes
      this.rawIncludesDir = includesDir;
      this.includesDir = path.join(this.inputDir, includesDir);

      if(!useInFileSearch) {
        this.ignores.add(path.join(this.includesDir, "**"));
      }
    }
  }

  setLayoutsDir(layoutsDir, useInFileSearch = true) {
    if(layoutsDir) {
      this.rawLayoutsDir = layoutsDir;
      this.layoutsDir = path.join(this.inputDir, layoutsDir);

      if(!useInFileSearch) {
        this.ignores.add(path.join(this.layoutsDir, "**"));
      }
    }
  }

  // adds leading ./
  _createRequirePath(...paths) {
    let joined = path.join(...paths);
    if(joined.startsWith("/")) {
      return joined;
    }
    return `./${joined}`;
  }

  setCacheDir(cacheDir) {
    this.cacheDir = cacheDir;
    this.rollupBundleOptions.dir = cacheDir;

    this.bypassRollupCacheCssFile = this._createRequirePath(this.cacheDir || "", "eleventy-vue-rollup-css.json");
    this.bypassRollupCacheFile = this._createRequirePath(this.cacheDir || "", "eleventy-vue-rollup.json");
  }

  getFullCacheDir() {
    if(this.cacheDir.startsWith("/")) {
      return this.cacheDir;
    }
    return path.join(this.workingDir, this.cacheDir);
  }

  getRelativeJsPathFromVuePath(vuePath) {
    let jsFilename = this.getFullJavaScriptComponentFilePath(vuePath);
    if(jsFilename) {
      let rel = path.relative(this.getFullCacheDir(), jsFilename);
      return rel;
    }
  }

  // works with relative paths or absolute paths
  isIncludeFile(filepath) {
    let absoluteFile = path.resolve(filepath);
    let absoluteIncludesDir = path.resolve(this.includesDir);

    return absoluteFile.startsWith(absoluteIncludesDir);
  }

  clearRequireCache() {
    let fullCacheDir = this.getFullCacheDir();
    let deleteCount = 0;
    for(let fullPath in require.cache) {
      if(fullPath.startsWith(fullCacheDir)) {
        deleteCount++;
        debugDev( "Deleting from require cache: %o", fullPath );
        delete require.cache[fullPath];
      }
    }
    debug( "Deleted %o vue components from require.cache.", deleteCount );
  }

  async findFiles(glob = "**/*.vue") {
    let globPaths = [
      addLeadingDotSlash(path.join(this.relativeInputDir, glob))
    ];

    if(this.includesDir && !this.includesDir.startsWith(this.inputDir)) {
      globPaths.push(
        addLeadingDotSlash(path.join(this.includesDir, glob))
      );
    }

    if(this.layoutsDir && !this.layoutsDir.startsWith(this.inputDir)) {
      globPaths.push(
        addLeadingDotSlash(path.join(this.layoutsDir, glob))
      );
    }

    return fastglob(globPaths, {
      caseSensitiveMatch: false,
      // dot: true,
      ignore: Array.from(this.ignores),
    });
  }

  // Glob is optional
  async getBundle(input, isSubsetOfFiles = false) {
    if(!input) {
      input = await this.findFiles();
    }

    debug("Processing %o Vue files", input.length);

    if(!this.readOnly) {
      await fsp.mkdir(this.cacheDir, {
        recursive: true
      });
    }

    let options = lodashMerge(
      {},
      this.defaultRollupOptions,
      this.rollupOptions
    );

    options.input = input;
    options.plugins = options.plugins || [];

    options.plugins.unshift(rollupPluginVue(this.getRollupPluginVueOptions()));
    options.plugins.unshift(
      rollupPluginCssOnly({
        output: async (styles, styleNodes) => {
          this.resetCSSFor(styleNodes);
          this.addRawCSS(styleNodes);

          if(!this.readOnly && !isSubsetOfFiles) {
            await this.writeRollupOutputCacheCss(styleNodes);
          }
        }
      })
    );

    let bundle = await rollup.rollup(options);

    return bundle;
  }

  async _operateOnBundle(bundle, rollupMethod = "write") {
    if(!bundle) {
      throw new Error("Eleventy Vue Plugin: write(bundle) needs a bundle argument.");
    }

    let { output } = await bundle[rollupMethod](this.rollupBundleOptions);

    output = output.filter(entry => !!entry.facadeModuleId);

    return output;
  }

  async write(bundle) {
    return this._operateOnBundle(bundle, "write");
  }

  async generate(bundle) {
    return this._operateOnBundle(bundle, "generate");
  }

  hasRollupOutputCache() {
    return fs.existsSync(this.bypassRollupCacheFile) && fs.existsSync(this.bypassRollupCacheCssFile);
  }

  async writeRollupOutputCache() {
    if(this.readOnly) {
      return;
    }

    debug("Writing rollup cache to file system %o", this.bypassRollupCacheFile);
    return fsp.writeFile(this.bypassRollupCacheFile, JSON.stringify({
      vueToJs: this.vueFileToJavaScriptFilenameMap,
      relationships: this.componentRelationships
    }, null, 2));
  }

  async writeRollupOutputCacheCss(styleNodes) {
    if(this.readOnly) {
      return;
    }
    // convert to local paths
    let localPathStyleNodes = {};
    for(let fullVuePath in styleNodes) {
      let localVuePath = this.getLocalVueFilePath(fullVuePath);
      // one file can have multiple CSS blocks
      if(!localPathStyleNodes[localVuePath]) {
        localPathStyleNodes[localVuePath] = [];
      }
      localPathStyleNodes[localVuePath].push(styleNodes[fullVuePath]);
    }
    debug("Writing rollup cache CSS to file system %o", this.bypassRollupCacheCssFile);
    return fsp.writeFile(this.bypassRollupCacheCssFile, JSON.stringify(localPathStyleNodes, null, 2));
  }

  async loadRollupOutputCache() {
    debugDev("Using rollup file system cache to bypass rollup.");
    let styleNodes = JSON.parse(await fsp.readFile(this.bypassRollupCacheCssFile, "utf8"));
    for(let localVuePath in styleNodes) {
      for(let css of styleNodes[localVuePath]) {
        this.addCSSViaLocalPath(localVuePath, css);
      }
    }

    let { vueToJs, relationships } = JSON.parse(await fsp.readFile(this.bypassRollupCacheFile, "utf8"));
    this.vueFileToJavaScriptFilenameMap = vueToJs;
    this.componentRelationships = relationships;

    if(this.cssManager) {
      // Re-insert CSS code in the CSS manager
      for(let localVuePath in vueToJs) {
        let css = this.getCSSForComponent(localVuePath);
        if(css) {
          let jsFilename = vueToJs[localVuePath];
          this.cssManager.addComponentCode(jsFilename, css);
        }
      }
    }

    // Re-establish both component relationships
    for(let relation of this.componentRelationships) {
      this.initComponentRelationship(relation.from, relation.to);

      if(this.cssManager) {
        this.cssManager.addComponentRelationship(relation.from, relation.to);
      }
    }
  }

  initComponentRelationship(from, to) {
    if(from && to) {
      if(!this.componentGraph.hasNode(from)) {
        this.componentGraph.addNode(from);
      }
      if(!this.componentGraph.hasNode(to)) {
        this.componentGraph.addNode(to);
      }
      this.componentGraph.addDependency(from, to);
    }
  }

  getAllComponentsUsedBy(vuePath) {
    let jsFilename = this.getRelativeJsPathFromVuePath(vuePath);
    if(!jsFilename || !this.componentGraph.hasNode(jsFilename)) {
      return [];
    }
    let deps = this.componentGraph.dependantsOf(jsFilename);
    return deps;
  }

  // output is returned from .write() or .generate()
  createVueComponents(output) {
    this.componentsWriteCount = 0;
    for(let entry of output) {
      let fullVuePath = entry.facadeModuleId;
      // if(entry.fileName.endsWith("rollup-plugin-vue=script.js") ||
      if(fullVuePath.endsWith(path.join("vue-runtime-helpers/dist/normalize-component.mjs"))) {
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
        debugDev("Adding Vue file to JS component file name mapping: %o to %o (via %o)", inputPath, entry.fileName, fullVuePath);
        this.addVueToJavaScriptMapping(inputPath, jsFilename);
        this.componentsWriteCount++;

        css = this.getCSSForComponent(inputPath);
        if(css && this.cssManager) {
          this.cssManager.addComponentCode(jsFilename, css);
        }
      }

      let importList = entry.imports || [];
      // debugDev("filename: %o importedBindings:", entry.fileName, Object.keys(entry.importedBindings));
      debugDev("filename: %o imports:", entry.fileName, entry.imports);
      // debugDev("modules: %O", Object.keys(entry.modules));

      for(let importFilename of importList) {
        if(importFilename.endsWith(path.join("vue-runtime-helpers/dist/normalize-component.js"))) {
          continue;
        }

        this.componentRelationships.push({ from: jsFilename, to: importFilename });
        this.initComponentRelationship(jsFilename, importFilename);

        // If you import it, it will roll up the imported CSS in the CSS manager (it doesn’t need to be _used_)
        if(this.cssManager) {
          this.cssManager.addComponentRelationship(jsFilename, importFilename);
        }
      }

      debugDev("Created %o from %o" + (css ? " w/ CSS" : " without CSS") + (intermediateComponent ? " (intermediate/connector component)" : ""), jsFilename, inputPath);
    }

    debug("Created %o Vue components", this.componentsWriteCount);
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
  resetCSSFor(styleNodes) {
    for(let fullVuePath in styleNodes) {
      let localVuePath = this.getLocalVueFilePath(fullVuePath);
      delete this.vueFileToCSSMap[localVuePath];

      if(this.cssManager) {
        let jsFilename = this.getJavaScriptComponentFile(localVuePath);
        this.cssManager.resetComponentCodeFor(jsFilename);
      }
    }
  }

  addRawCSS(styleNodes) {
    for(let fullVuePath in styleNodes) {
      this.addCSS(fullVuePath, styleNodes[fullVuePath]);
    }
  }

  addCSS(fullVuePath, cssText) {
    let localVuePath = this.getLocalVueFilePath(fullVuePath);
    this.addCSSViaLocalPath(localVuePath, cssText);
  }

  addCSSViaLocalPath(localVuePath, cssText) {
    if(!this.vueFileToCSSMap[localVuePath]) {
      this.vueFileToCSSMap[localVuePath] = [];
    }
    let css = cssText.trim();
    if(css) {
      debugDev("Adding CSS to %o, length: %o", localVuePath, css.length);

      this.vueFileToCSSMap[localVuePath].push(css);
    }
  }

  getCSSForComponent(localVuePath) {
    let css = (this.vueFileToCSSMap[localVuePath] || []).join("\n");
    debugDev("Getting CSS for component: %o, length: %o", localVuePath, css.length);
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
    if(!jsFilename) {
      return;
    }
    debugDev("Map vue path to JS component file: %o to %o", localVuePath, jsFilename);
    let fullComponentPath = path.join(this.getFullCacheDir(), jsFilename);
    return fullComponentPath;
  }

  getComponent(localVuePath) {
    let fullComponentPath = this.getFullJavaScriptComponentFilePath(localVuePath);
    let component = require(fullComponentPath);
    return component;
  }

  async renderString(str, data, mixin = {}) {
    return this.renderComponent({
      template: str
    }, data, mixin);
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

    if(!vueComponent.mixins) {
      vueComponent.mixins = [];
    }

    // Full data cascade is available to the root template component
    let dataMixin = {
      data: function eleventyFullDataCascade() {
        return data;
      },
    };

    // remove any existing eleventyFullDataCascade mixins
    vueComponent.mixins = vueComponent.mixins.filter(entry => {
      if(entry &&
        entry.data &&
        typeof entry.data === "function" &&
        entry.data.toString() === dataMixin.data.toString()) {
        return false;
      }
      return true;
    });

    vueComponent.mixins.push(dataMixin);

    const app = new Vue(vueComponent);

    // returns a promise
    return renderer.renderToString(app);
  }
}

module.exports = EleventyVue;
