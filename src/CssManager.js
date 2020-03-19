class CssManager {
  constructor() {
    this.componentsPerUrl = {};
    this.componentCssMap = {};
  }

  addComponentForUrl(componentName, url) {
    if(url) {
      if(!this.componentsPerUrl[url]) {
        this.componentsPerUrl[url] = new Set();
      }
      this.componentsPerUrl[url].add(componentName);
    }
  }

  getCssForUrl(url) {
    if(!this.componentsPerUrl[url]) {
      return;
    }

    return Array.from(this.componentsPerUrl[url]).map(componentName => {
      return this.getComponentStyle(componentName);
    }).filter(entry => !!entry).join("\n");
  }

  getComponentNameFromPath(filePath, fileExtension) {
    filePath = filePath.split("/").pop();
    return filePath.substr(0, filePath.lastIndexOf(fileExtension));
  }

  /* styleNodes comes from `rollup-plugin-css-only`->output */
  addComponentStyles(styleNodes, fileExtension) {
    let styleMap = {};
    for(let path in styleNodes) {
      let componentName = this.getComponentNameFromPath(path, fileExtension);
      if(!styleMap[componentName]) {
        styleMap[componentName] = [];
      }
      styleMap[componentName].push(styleNodes[path]);
    }
    this.componentCssMap = styleMap;
  }

  getComponentStyle(componentName) {
    if(this.componentCssMap[componentName]) {
      return `/* ${componentName} Component */
${this.componentCssMap[componentName].map(entry => entry.trim()).join("\n")}`;
    }
  }
}

module.exports = CssManager;