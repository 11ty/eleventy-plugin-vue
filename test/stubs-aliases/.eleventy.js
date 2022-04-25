const EleventyVue = require("../../");
const alias = require('@rollup/plugin-alias')

module.exports = function(eleventyConfig) {
  eleventyConfig.addPlugin(EleventyVue, {
    cacheDirectory: ".cache/vue-aliases/",

    rollupOptions: {
      plugins: [
        alias({
          entries: [
            {
              find: /^\~components\/(.*)/,
              replacement: './test/stubs-aliases/_includes/$1',
            },
          ],
        }),
      ],
    },
  });
};