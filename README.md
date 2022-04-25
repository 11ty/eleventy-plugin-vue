<p align="center"><img src="https://www.11ty.dev/img/logo-github.png" alt="eleventy Logo"></p>

# eleventy-plugin-vue for Vue 2 🕚⚡️🎈🐀

Zero bundle size server-rendered components for Vue.js.

Read more about the goals of this plugin (and a full tutorial!) at [Eleventy and Vue, a match made to power Netlify.com](https://www.netlify.com/blog/2020/09/18/eleventy-and-vue-a-match-made-to-power-netlify.com/)

## Installation

```sh
npm install @11ty/eleventy-plugin-vue
```

* `0.7.x` is encouraged to use Eleventy `1.0.0` (and Node 12+)
* `0.2.x` is encouraged to use Eleventy `0.11.1` or newer (for incremental Vue component builds)
* `0.1.x` requires Eleventy `0.11.0` or newer
* `0.0.x` requires Eleventy 0.11.0 Beta 2 or above (`0.11.0-beta.2`)

* Requires experimental features in Eleventy, specifically: [Custom File Extension Handlers feature from Eleventy](https://github.com/11ty/eleventy/issues/117). Opt in to experimental features on Eleventy by running `ELEVENTY_EXPERIMENTAL=true npx @11ty/eleventy`.

### Changelog

* `0.3.0` ([Milestone](https://github.com/11ty/eleventy-plugin-vue/milestone/3?closed=1)) More consistent incremental builds. Performance improvements.
* `0.2.1` ([Milestone](https://github.com/11ty/eleventy-plugin-vue/milestone/2?closed=1)) adds incremental builds for Eleventy Vue components to avoid unnecessary repeat work. Fixes bug with `permalink` strings returned from Vue Single File Component data.
* `0.1.x` converted to use a Single File Components for everything (templates, components, etc), instead of `0.0.x`’s string templates with front matter.

## Features

* Builds `*.vue`’s Single File Components, both in the input directory and in Eleventy’s includes directory. `.vue` files in the includes directory are available for import but only those outside of the includes directory result in output files.
* Works with Vue’s Single File Components, including with `scoped` CSS.
* Data from single file components feeds into the data cascade (similar to front matter)
* All JavaScript Template Functions (see https://www.11ty.dev/docs/languages/javascript/#javascript-template-functions), Universal Filters, Universal Shortcodes, Universal Paired Shortcodes are available as Vue `methods` (global functions to use in templates and child components). 
  * For example, you can  use the [`url` Universal Filter](https://www.11ty.dev/docs/filters/url/) like `url("/my-url/")` in your Vue templates.
* `page` Eleventy supplied data is also available globally in all components.

### Not Yet Available

* Traditional Vue.js “Page templates” (think `<!--vue-ssr-outlet-->`) as layouts.
  * Using `.vue` templates as Eleventy layouts is not yet supported. Subscribe to this issue at [#26](https://github.com/11ty/eleventy-plugin-vue/issues/26).
* Does not yet embed any client-side JavaScript from inside single file components into the output for use on the client. Any JavaScript embedded there is used only for rendering templates in the build and does not show up in the output.
  * Note that if this is added in the future, it will likely be an opt-in feature.
* `lang` on `<template>`, `<style>`, or `<script>` is not yet supported.
* Windows support

### Warnings

* Adding a `<!doctype html>` to a Vue template is not supported by Vue. For this reason it is recommended to use a different template syntax for your layout (until Vue.js Page Templates support is added per the note above).

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
    // Directory to store compiled Vue single file components
    cacheDirectory: ".cache/vue/",

    // Pass in a file or multiple .vue files to limit compilation
    // If this is empty, the plugin will search for all *.vue files
    input: [],

    // Use postcss in the single file components
    rollupPluginVueOptions: {
      style: {
        postcssPlugins: [
          require("autoprefixer"),
          require("postcss-nested")
        ]
      }
    }

    // Passed to rollup.rollup
    rollupOptions: {
      // Declare your own external dependencies
      external: [],

      // Use your own Rollup plugins
      plugins: [],
    },
  });
};
```

For a full list of `rollupPluginVueOptions`, see [`rollup-plugin-vue`’s Options](https://rollup-plugin-vue.vuejs.org/options.html#include).

#### Advanced: Use with `eleventy-assets`

_Compatible with @11ty/eleventy-plugin-vue 0.0.5 and newer._

[Eleventy’s Assets plugin](https://github.com/11ty/eleventy-assets) lets you manage your own Inline CSS or JavaScript. For the first version of the Eleventy Vue plugin, you can reuse an existing CSS code manager from `eleventy-assets` add CSS from your Vue.js Single File Components too.

```js
const eleventyVue = require("@11ty/eleventy-plugin-vue");
const { InlineCodeManager } = require("@11ty/eleventy-assets");

module.exports = function(eleventyConfig) {
  let myCssManager = new InlineCodeManager();

  eleventyConfig.addPlugin(eleventyVue, {
    // Re-use an existing `eleventy-assets` Manager
    assets: {
      css: myCssManager
    }
  });
};
```

#### Advanced: Run async things before component render

_Available with Eleventy 1.0+ and Eleventy Vue Plugin 0.6+_

Use [`serverPrefetch`](https://ssr.vuejs.org/guide/data.html) to tell the component to do a few async things before it renders the component.

Below is an example of a Vue template that uses [the Eleventy Render Plugin](https://11ty.dev/docs/plugins/render/) to render Markdown (either in an external file or a string).

```html
<template>
  <header v-html="content"/>
</template>
<script>
export default {
  async serverPrefetch() {
    // let content = await this.renderFile("./_includes/blogpost.md", "md");
    this.content = await this.renderTemplate("# Title", "md");
  }
}
</script>
```

## Relevant Links

* https://ssr.vuejs.org/
* https://vuejs.org/v2/guide/single-file-components.html
* https://vue-loader.vuejs.org/guide/scoped-css.html
* https://rollup-plugin-vue.vuejs.org/
* https://rollupjs.org/guide/en/
<!-- https://github.com/tj/consolidate.js/ -->

## TODO

* Custom Directives?
* How to render Vue templates inside of other template files, including Markdown?