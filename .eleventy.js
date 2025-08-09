const { DateTime } = require("luxon");
const markdownIt = require("markdown-it");
const markdownItAnchor = require("markdown-it-anchor");
let pluginShiki = null;
try {
  // Optional: prefer server-side highlighting when dependency is available
  pluginShiki = require("@11ty/eleventy-plugin-shiki");
} catch (e) {
  // Fallback to client-side Prism when not installed
}

module.exports = function(eleventyConfig) {
  // Add a global `now` variable
  eleventyConfig.addGlobalData("now", new Date());

  // Add a custom date filter
  eleventyConfig.addFilter("date", (dateObj, format) => {
    return DateTime.fromJSDate(dateObj).toFormat(format);
  });

  // Copy `styles` folder to output
  eleventyConfig.addPassthroughCopy("styles");
  
  // Copy static assets like icons if needed
  eleventyConfig.addPassthroughCopy("assets");

  // IDE-quality code highlighting with Shiki (light/dark themes), if available
  if (pluginShiki) {
    eleventyConfig.addPlugin(pluginShiki, {
      themes: {
        light: "github-light",
        dark: "github-dark",
      },
      skipInline: true,
    });
  }

  // Add posts collection sorted by date (newest first)
  eleventyConfig.addCollection("post", collectionApi => {
    return collectionApi.getFilteredByGlob("src/posts/*.md").sort((a, b) => b.date - a.date);
  });

  eleventyConfig.addShortcode("theme", function() {
    return `<script>
      (function() {
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        const theme = prefersDark ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', theme);
      })();
    </script>`;
  });

  // Configure Markdown with heading anchors so in-page links work
  // Slugify to mimic GitHub-style slugs (e.g., "A & B" => "a--b")
  const md = markdownIt({
    html: true,
    linkify: true,
    typographer: true
  }).use(markdownItAnchor, {
    slugify: s => s
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\w-]/g, ''),
  });

  eleventyConfig.setLibrary("md", md);

  return {
    dir: {
      input: "src",
      output: "_site"
    },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk"
  };
};
