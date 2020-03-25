# eleventy-plugin-vue

_⚠️ Work in progress!!_

## Installation

```sh
npm install @11ty/eleventy-plugin-vue
```

* Requires Eleventy 0.11.0 Beta 2 or above (`0.11.0-beta.2`)
* Requires features not yet available on a stable public release of Eleventy, specifically: [Custom File Extension Handlers feature from Eleventy](https://github.com/11ty/eleventy/issues/117). Opt in to experimental features on Eleventy by running `ELEVENTY_EXPERIMENTAL=true npx @11ty/eleventy`.

## Usage

### Add to Configuration File

Usually `.eleventy.js`:

```js
const eleventyVue = require("@11ty/eleventy-plugin-vue");

module.exports = function(eleventyConfig) {
  // Use Defaults
  eleventyConfig.addPlugin(eleventyVue);
};
```

#### Customize with Options

```js
const eleventyVue = require("@11ty/eleventy-plugin-vue");

module.exports = function(eleventyConfig) {
  // OR, Use your own options
  eleventyConfig.addPlugin(eleventyVue, {
    // Directory to search for Vue single file components
    // (if empty, defaults to includes folder)
    componentsDirectory: "",

    // Directory to store compiled Vue single file components
    cacheDirectory: ".cache/11ty/vue/",

    // Use postcss in the single file components
    rollupPluginVueOptions: {
      style: {
        postcssPlugins: [
          require("autoprefixer"),
          require("postcss-nested")
        ]
      }
    }
  });
};
```

For a full list of `rollupPluginVueOptions`, see [`rollup-plugin-vue`’s Options](https://rollup-plugin-vue.vuejs.org/options.html#include).

## Features

* Compiles `*.vue` templates as Vue.js syntax, similar to other Eleventy template language.
* Works with Vue’s Single File Components, including with `scoped` CSS.
* All JavaScript Template Functions (see https://www.11ty.dev/docs/languages/javascript/#javascript-template-functions), Universal Filters, Universal Shortcodes, Universal Paired Shortcodes are available as Vue `methods` (global functions to use in templates). 
  * For example, you can  use the [`url` Universal Filter](https://www.11ty.dev/docs/filters/url/) like `url("/my-url/")` in your Vue templates.

### Not Yet Available

* Traditional Vue.js “Page templates” (think `<!--vue-ssr-outlet-->`) as layouts.
  * Note that `.vue` templates **do work** as Eleventy layouts, but using traditional Eleventy methods for child content a la `v-html="content"` instead of `<!--vue-ssr-outlet-->`.
* Does not yet embed any client-side JavaScript from inside single file components into the output for use on the client. Any JavaScript embedded there is used only for rendering templates in the build and does not show up in the output.
  * Note that if this is added in the future, it will likely be an opt-in feature.
* I’d like to allow any Eleventy template engine to be used as `lang` on `<template>` or `<style>` or `<script>` but this is not yet supported.

### Warnings

* Adding a `<!doctype html>` to a Vue template is not supported by Vue. For this reason it is recommended to use a different template syntax for your layout (until Vue.js Page Templates support is added per the note above).

### Advanced

#### Use with `eleventy-assets`

_Compatible with @11ty/eleventy-plugin-vue 0.0.5 and newer._

[Eleventy’s Assets plugin](https://github.com/11ty/eleventy-assets) lets you manage your own Inline CSS or JavaScript. For the first version of the Eleventy Vue plugin, you can reuse an existing CSS code manager from `eleventy-assets` add CSS from your Vue.js Single File Components too.

```js
const eleventyVue = require("@11ty/eleventy-plugin-vue");
const { InlineCodeManager } = require("@11ty/eleventy-assets");

module.exports = function(eleventyConfig) {
  let myExistingCssManager = new InlineCodeManager();

  eleventyConfig.addPlugin(eleventyVue, {
    // Re-use an existing `eleventy-assets` Manager
    assets: {
      css: myExistingCssManager
    }
  });
};
```


## Relevant Links

* https://ssr.vuejs.org/
* https://vuejs.org/v2/guide/single-file-components.html
* https://vue-loader.vuejs.org/guide/scoped-css.html
* https://rollup-plugin-vue.vuejs.org/
* https://rollupjs.org/guide/en/
<!-- https://github.com/tj/consolidate.js/ -->