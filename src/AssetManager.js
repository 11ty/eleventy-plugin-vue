class AssetManager {
  constructor() {
    this.init();
  }

  init() {
    this.components = {};
    this.css = {};
  }

  addComponentForUrl(componentName, url) {
    if(url) {
      if(!this.components[url]) {
        this.components[url] = new Set();
      }
      this.components[url].add(componentName);
    }
  }

  _getComponentNameFromPath(filePath, fileExtension) {
    filePath = filePath.split("/").pop();
    return filePath.substr(0, filePath.lastIndexOf(fileExtension));
  }

  /* styleNodes come from `rollup-plugin-css-only`->output */
  addRollupComponentNodes(styleNodes, fileExtension) {
    for(let path in styleNodes) {
      let componentName = this._getComponentNameFromPath(path, fileExtension);
      this.addComponentCode(componentName, styleNodes[path]);
    }
  }

  addComponentCode(componentName, code) {
    if(!this.css[componentName]) {
      this.css[componentName] = [];
    }
    this.css[componentName].push(code);
  }

  getComponentCode(componentName) {
    if(this.css[componentName]) {
      return `/* ${componentName} Component */
${this.css[componentName].map(entry => entry.trim()).join("\n")}`;
    }
  }

  // TODO add priority level for components and only inline the ones that are above a priority level
  // Maybe high priority corresponds with how high on the page the component is used
  getCodeForUrl(url) {
    if(!this.components[url]) {
      return;
    }

    return Array.from(this.components[url]).map(componentName => {
      return this.getComponentCode(componentName);
    }).filter(entry => !!entry).join("\n");
  }

}

module.exports = AssetManager;