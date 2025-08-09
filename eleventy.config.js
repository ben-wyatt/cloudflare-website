const pluginShiki = require("@11ty/eleventy-plugin-shiki");

/**
 * Eleventy configuration
 */
module.exports = function(eleventyConfig) {
  // Pass through the site-wide styles directory to the output
  eleventyConfig.addPassthroughCopy("styles");

  // IDE-quality code highlighting (light/dark themes)
  eleventyConfig.addPlugin(pluginShiki, {
    themes: {
      light: "github-light",
      dark: "github-dark"
    },
    // Keep fenced code only; leave inline `code` alone so we can style it ourselves
    skipInline: true,
  });

  return {
    dir: {
      input: "src",
      includes: "_includes",
    }
  };
};


