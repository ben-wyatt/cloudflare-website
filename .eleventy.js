const { DateTime } = require("luxon");

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

  return {
    dir: {
      input: "src",
      output: "_site"
    },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk"
  };
};
