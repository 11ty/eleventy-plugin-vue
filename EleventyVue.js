const path = require("path");
const fs = require("fs");
const fsp = fs.promises;
const fastglob = require("fast-glob");
const lodashMerge = require("lodash.merge");

const rollup = require("rollup");
const rollupPluginVue = require("rollup-plugin-vue");
const rollupPluginCssOnly = require("rollup-plugin-css-only");

const { createSSRApp } = require("vue");
const { renderToString } = require("@vue/server-renderer");

const debug = require("debug")("EleventyVue");
const debugDev = require("debug")("Dev:EleventyVue");

function addLeadingDotSlash(pathArg) {
  if (pathArg === "." || pathArg === "..") {
    return pathArg + path.sep;
  }

  if (
    path.isAbsolute(pathArg) ||
    pathArg.startsWith("." + path.sep) ||
    pathArg.startsWith(".." +  + path.sep)
  ) {
    return pathArg;
  }

  return "." + path.sep + pathArg;
}

class EleventyVue {
  constructor(cacheDirectory) {
    this.workingDir = path.resolve(".");
    this.ignores = new Set();

    this.vueFileToCSSMap = {};
    this.vueFileToJavaScriptFilenameMap = {};
    this.componentRelationships = [];

    this.rollupBundleOptions = {
      format: "cjs", // because we’re consuming these in node. See also "esm"
      exports: "auto",
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
    localVuePath = EleventyVue.normalizeOperatingSystemFilePath(localVuePath);

    debug("Clearing CSS styleNodes in Vue for %o", localVuePath);
    this.vueFileToCSSMap[localVuePath] = [];
  }

  setCssManager(cssManager) {
    this.cssManager = cssManager;
  }

  setRollupOptions(options) {
    this.rollupOptions = options;
  }

  getMergedRollupOptions(input, isSubsetOfFiles) {
    let options = {
      input,
      onwarn (warning, warn) {
        if(warning.code === "UNUSED_EXTERNAL_IMPORT") {
          debug("Unused external import: %O", warning);
        } else {
          warn(warning);
        }
      },
      external: [
        "vue",
        "vue/server-renderer",
        "@vue/server-renderer",
      ],
      plugins: [
        rollupPluginVue(this.getRollupPluginVueOptions()),
        rollupPluginCssOnly({
          output: async (styles, styleNodes) => {
            this.resetCSSFor(styleNodes);
            this.addRawCSS(styleNodes);

            if(!this.readOnly && !isSubsetOfFiles) {
              await this.writeRollupOutputCacheCss(styleNodes);
            }
          }
        }),
      ]
    };

    for(let key in this.rollupOptions) {
      if(key === "external" || key === "plugins") {
        // merge the Array
        options[key] = options[key].concat(this.rollupOptions[key]);
      } else {
        options[key] = this.rollupOptions[key];
      }
    }

    return options;
  }

  setRollupPluginVueOptions(rollupPluginVueOptions) {
    this.rollupPluginVueOptions = rollupPluginVueOptions;
  }

  getRollupPluginVueOptions() {
    return lodashMerge({
      target: "node",
      exposeFilename: true,
      // preprocessStyles: false, // false is default
      // compilerOptions: {} // https://github.com/vuejs/vue/tree/dev/packages/vue-template-compiler#options
    }, this.rollupPluginVueOptions);
  }

  resetIgnores(extraIgnores = []) {
    this.ignores = new Set();

    // These need to be forced to forward slashes for comparison
    let relativeIncludesDir = this.rawIncludesDir ? EleventyVue.forceForwardSlashOnFilePath(addLeadingDotSlash(path.join(this.relativeInputDir, this.rawIncludesDir))) : undefined;
    let relativeLayoutsDir = this.rawLayoutsDir ? EleventyVue.forceForwardSlashOnFilePath(addLeadingDotSlash(path.join(this.relativeInputDir, this.rawLayoutsDir))) : undefined;

    // don’t add ignores that match includes or layouts dirs
    for(let ignore of extraIgnores) {
      if(relativeIncludesDir && ignore.startsWith(relativeIncludesDir)) {
        // do nothing
        debug( "Skipping ignore from eleventy.ignores event: %o, matched includes dir", ignore);
      } else if(relativeLayoutsDir && ignore.startsWith(relativeLayoutsDir)) {
        // do nothing
        debug( "Skipping ignore from eleventy.ignores event: %o, matched layouts dir", ignore);
      } else {
        debug( "Adding ignore from eleventy.ignores event: %o %O %O", ignore, { relativeIncludesDir }, { relativeLayoutsDir } );
        this.ignores.add(ignore);
      }
    }
  }

  setInputDir(inputDir) {
    this.relativeInputDir = inputDir;
    this.inputDir = path.join(this.workingDir, inputDir);
  }

  setIncludesDir(includesDir) {
    if(includesDir) {
      // Was: path.join(this.workingDir, includesDir);
      // Which seems wrong? per https://www.11ty.dev/docs/config/#directory-for-includes
      this.rawIncludesDir = includesDir;
      this.includesDir = path.join(this.inputDir, includesDir);
    }
  }

  setLayoutsDir(layoutsDir) {
    if(layoutsDir) {
      this.rawLayoutsDir = layoutsDir;
      this.layoutsDir = path.join(this.inputDir, layoutsDir);
    }
  }

  // adds leading ./
  _createRequirePath(...paths) {
    let joined = path.join(...paths);
    if(joined.startsWith(path.sep)) {
      return joined;
    }
    return `.${path.sep}${joined}`;
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

  isIncludeFile(filepath) {
    return filepath.startsWith(this.includesDir);
  }

  // TODO pass in a filename and only clear the appropriate files
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

    if(this.includesDir) {
      if(!this.includesDir.startsWith(this.inputDir)) {
        globPaths.push(
          addLeadingDotSlash(path.join(this.relativeIncludesDir, glob))
        );
      }
    }

    if(this.layoutsDir) {
      if(!this.layoutsDir.startsWith(this.inputDir)) {
        globPaths.push(
          addLeadingDotSlash(path.join(this.relativeLayoutsDir, glob))
        );
      }
    }

    // ignores should not include layouts or includes directories, filtered out above.
    let ignores = Array.from(this.ignores).map(ignore => EleventyVue.forceForwardSlashOnFilePath(ignore));
    globPaths = globPaths.map(path => EleventyVue.forceForwardSlashOnFilePath(path));
    debug("Looking for %O and ignoring %O", globPaths, ignores);

    // MUST use forward slashes here (even in Windows), per fast-glob requirements
    return fastglob(globPaths, {
      caseSensitiveMatch: false,
      // dot: true,
      ignore: ignores,
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

    debug("Found these input files: %O", input);
    let options = this.getMergedRollupOptions(input, isSubsetOfFiles);
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
        localVuePath = EleventyVue.normalizeOperatingSystemFilePath(localVuePath);

        let css = this.getCSSForComponent(localVuePath);
        if(css) {
          let jsFilename = vueToJs[localVuePath];
          this.cssManager.addComponentCode(jsFilename, css);
        }
      }

      // Re-establish both component relationships
      for(let relation of this.componentRelationships) {
        this.cssManager.addComponentRelationship(relation.from, relation.to);
      }
    }
  }

  // output is returned from .write() or .generate()
  createVueComponents(output) {
    this.componentsWriteCount = 0;
    for(let entry of output) {
      let fullVuePath = entry.facadeModuleId;
      let inputPath = this.getLocalVueFilePath(fullVuePath);
      let jsFilename = entry.fileName;
      let intermediateComponent = false;
      let css;

      if(fullVuePath.endsWith("&lang.js")) {
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

      if(this.cssManager) {
        // If you import it, it will roll up the imported CSS in the CSS manager
        let importList = entry.imports || [];
        // debugDev("filename: %o importedBindings:", entry.fileName, Object.keys(entry.importedBindings));
        debugDev("filename: %o imports:", entry.fileName, entry.imports);
        // debugDev("modules: %O", Object.keys(entry.modules));

        for(let importFilename of importList) {
          // TODO is this necessary?
          if(importFilename.endsWith(path.join("vue-runtime-helpers/dist/normalize-component.js"))) {
            continue;
          }

          this.componentRelationships.push({ from: jsFilename, to: importFilename });
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
    let localVuePath = filePath.substr(0, filePath.lastIndexOf(extension) + extension.length);
    return EleventyVue.normalizeOperatingSystemFilePath(localVuePath);
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
    localVuePath = EleventyVue.normalizeOperatingSystemFilePath(localVuePath);

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
    localVuePath = EleventyVue.normalizeOperatingSystemFilePath(localVuePath);

    let css = (this.vueFileToCSSMap[localVuePath] || []).join("\n");
    debugDev("Getting CSS for component: %o, length: %o", localVuePath, css.length);
    return css;
  }

  /* Map from vue files to compiled JavaScript files */
  addVueToJavaScriptMapping(localVuePath, jsFilename) {
    localVuePath = EleventyVue.normalizeOperatingSystemFilePath(localVuePath);

    this.vueFileToJavaScriptFilenameMap[localVuePath] = jsFilename;
  }

  getJavaScriptComponentFile(localVuePath) {
    localVuePath = EleventyVue.normalizeOperatingSystemFilePath(localVuePath);

    return this.vueFileToJavaScriptFilenameMap[localVuePath];
  }

  // localVuePath is already normalized to local OS directory separator at this point
  getFullJavaScriptComponentFilePath(localVuePath) {
    localVuePath = EleventyVue.normalizeOperatingSystemFilePath(localVuePath);

    let jsFilename = this.getJavaScriptComponentFile(localVuePath);
    if(!jsFilename) {
      throw new Error("Could not find compiled JavaScript file for Vue component: " + localVuePath);
    }

    debugDev("Map vue path to JS component file: %o to %o", localVuePath, jsFilename);
    let fullComponentPath = path.join(this.getFullCacheDir(), jsFilename);
    return fullComponentPath;
  }

  getComponent(localVuePath) {
    let filepath = EleventyVue.normalizeOperatingSystemFilePath(localVuePath);
    let fullComponentPath = this.getFullJavaScriptComponentFilePath(filepath);
    let component = require(fullComponentPath);
    return component;
  }

  getAllJavaScriptComponentFiles(){
    return Object.keys(this.vueFileToJavaScriptFilenameMap).map(localVuePath => {
      return this.getFullJavaScriptComponentFilePath(localVuePath);
    });
  }

  getAllCompiledComponents(){
    let components = [];
    for(let file of this.getAllJavaScriptComponentFiles()){
      let component = require(file);
      components.push(component);
    }
    return components;
  }

  async renderString(str, data, mixin = {}) {
    return this.renderComponent({
      template: str
    }, data, mixin);
  }

  async renderComponent(vueComponent, pageData, mixin = {}) {
    // console.log( pageData );
    const app = createSSRApp(vueComponent);
    // Allow `page` to be accessed inside any Vue component
    // https://v3.vuejs.org/api/application-config.html#globalproperties
    app.config.globalProperties.page = pageData.page;

    // TODO hook for app modifications
    // app.config.warnHandler = function(msg, vm, trace) {
    //   console.log( "[Vue 11ty] Warning", msg, vm, trace );
    // };
    // app.config.errorHandler = function(msg, vm, info) {
    //   console.log( "[Vue 11ty] Error", msg, vm, info );
    // };


    /* register vue components to use as globally available components */

    //remove unnamed components, they are not supported yet
    const namedComponents = this.getAllCompiledComponents().filter(component => component.name);
    for(let component of namedComponents){
      app.component(component.name, component);
    }


    app.mixin(mixin);

    // Full data cascade is available to the root template component
    app.mixin({
      data: function() {
        return pageData;
      },
    });

    // returns a promise
    return renderToString(app);
  }
}

EleventyVue.normalizeOperatingSystemFilePath = function(filePath, sep = "/") {
  return filePath.split(sep).join(path.sep);
}

EleventyVue.forceForwardSlashOnFilePath = function(filePath) {
  return filePath.split(path.sep).join("/");
}

module.exports = EleventyVue;
