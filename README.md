# eleventy-plugin-vue

⚠️ Work in progress!!

## Requirements

* Requires features not yet available on a stable public release of Eleventy, specifically: [Custom File Extension Handlers feature from Eleventy](https://github.com/11ty/eleventy/issues/117).

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


## Relevant Links

* https://ssr.vuejs.org/
* https://vuejs.org/v2/guide/single-file-components.html
* https://vue-loader.vuejs.org/guide/scoped-css.html
* https://rollup-plugin-vue.vuejs.org/
* https://rollupjs.org/guide/en/
<!-- https://github.com/tj/consolidate.js/ -->