class AssetManager {
  constructor() {
    this.init();
  }

  init() {
    this.components = {};
    this.componentRelationships = {};
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

  addComponentRelationship(parentComponentFile, childComponentFile, fileExtension) {
    let parentName = AssetManager.getComponentNameFromPath(parentComponentFile, fileExtension);
    let childName = AssetManager.getComponentNameFromPath(childComponentFile, fileExtension);

    if(!this.componentRelationships[parentName]) {
      this.componentRelationships[parentName] = new Set();
    }
    this.componentRelationships[parentName].add(childName);
  }

  static getComponentNameFromPath(filePath, fileExtension) {
    filePath = filePath.split("/").pop();
    return fileExtension ? filePath.substr(0, filePath.lastIndexOf(fileExtension)) : filePath;
  }

  /* styleNodes come from `rollup-plugin-css-only`->output */
  addRollupComponentNodes(styleNodes, fileExtension) {
    for(let path in styleNodes) {
      let componentName = AssetManager.getComponentNameFromPath(path, fileExtension);
      this.addComponentCode(componentName, styleNodes[path]);
    }
  }

  addComponentCode(componentName, code) {
    if(!this.css[componentName]) {
      this.css[componentName] = new Set();
    }
    this.css[componentName].add(code);
  }

  getComponentCode(componentName) {
    if(this.css[componentName]) {
      return `/* ${componentName} Component */
${Array.from(this.css[componentName]).map(entry => entry.trim()).join("\n")}`;
    }
  }

  getComponentListForUrl(url) {
    if(!this.components[url]) {
      return [];
    }

    let components = new Set();
    for(let componentName of this.components[url]) {
      components.add(componentName);

      for(let importName of (this.componentRelationships[componentName] || [])) {
        components.add(importName);
      }
    }

    return Array.from(components);
  }

  // TODO add priority level for components and only inline the ones that are above a priority level
  // Maybe high priority corresponds with how high on the page the component is used
  getCodeForUrl(url) {
    return this.getComponentListForUrl(url).map(componentName => {
      return this.getComponentCode(componentName);
    }).filter(entry => !!entry).join("\n");
  }

}

module.exports = AssetManager;