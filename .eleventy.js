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

  // Pretty date: "Friday August 8th 2025" (no time). Accepts Date or ISO string
  eleventyConfig.addFilter("prettyDate", (value) => {
    if (!value) return "";
    let dt;
    if (value instanceof Date) {
      dt = DateTime.fromJSDate(value);
    } else if (typeof value === "string") {
      // Support bare YYYY-MM-DD from YAML (js-yaml may already convert to Date, but handle string too)
      dt = DateTime.fromISO(value, { zone: "utc" });
      if (!dt.isValid) {
        // Fallback: try JS Date parse
        const asDate = new Date(value);
        if (!isNaN(asDate.getTime())) dt = DateTime.fromJSDate(asDate);
      }
    } else {
      try {
        dt = DateTime.fromJSDate(new Date(value));
      } catch (e) {}
    }
    if (!dt || !dt.isValid) return String(value);

    const day = dt.day;
    const suffix = (d => {
      const v = d % 100;
      if (v >= 11 && v <= 13) return "th";
      switch (d % 10) {
        case 1: return "st";
        case 2: return "nd";
        case 3: return "rd";
        default: return "th";
      }
    })(day);

    const weekday = dt.toFormat("cccc");   // Friday
    const month = dt.toFormat("LLLL");     // August
    const year = dt.toFormat("yyyy");      // 2025
    return `${weekday} ${month} ${day}${suffix} ${year}`;
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
    return collectionApi.getFilteredByGlob("src/posts/*.md")
      .map(post => {
        // Use date_published from frontmatter if available, otherwise use file date
        if (post.data.date_published) {
          const publishedDate = typeof post.data.date_published === 'string' 
            ? new Date(post.data.date_published) 
            : post.data.date_published;
          post.date = publishedDate;
        }
        return post;
      })
      .sort((a, b) => b.date - a.date);
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

  // Obsidian-style wiki links [[Page Name]] → /posts/page-name/
  // Supports aliases [[Page Name|Alias]] and heading anchors [[Page Name#Section]]
  function slugifyForPost(input) {
    return String(input || '')
      .trim()
      .toLowerCase()
      .replace(/[^\w]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  function slugifyForHeading(input) {
    return String(input || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\w-]/g, '');
  }

  function wikiLinkPlugin(md) {
    function isOpen(state, pos) {
      return state.src.charCodeAt(pos) === 0x5B /* [ */ &&
             state.src.charCodeAt(pos + 1) === 0x5B /* [ */;
    }

    function wikilink(state, silent) {
      const start = state.pos;
      if (!isOpen(state, start)) return false;

      const src = state.src;
      const max = state.posMax;
      let pos = start + 2;
      let found = false;

      while (pos + 1 < max) {
        if (src.charCodeAt(pos) === 0x5D /* ] */ && src.charCodeAt(pos + 1) === 0x5D /* ] */) {
          found = true;
          break;
        }
        pos++;
      }

      if (!found) return false;

      if (!silent) {
        const innerRaw = src.slice(start + 2, pos).trim();
        if (innerRaw.length === 0) {
          // Leave as-is if empty
          const textToken = state.push('text', '', 0);
          textToken.content = src.slice(start, pos + 2);
          state.pos = pos + 2;
          return true;
        }

        let pagePart = innerRaw;
        let alias = '';
        const pipeIndex = innerRaw.indexOf('|');
        if (pipeIndex !== -1) {
          pagePart = innerRaw.slice(0, pipeIndex).trim();
          alias = innerRaw.slice(pipeIndex + 1).trim();
        }

        let hash = '';
        const hashIndex = pagePart.indexOf('#');
        if (hashIndex !== -1) {
          hash = pagePart.slice(hashIndex + 1).trim();
          pagePart = pagePart.slice(0, hashIndex).trim();
        }

        const postSlug = slugifyForPost(pagePart);
        if (!postSlug) {
          const textToken = state.push('text', '', 0);
          textToken.content = src.slice(start, pos + 2);
          state.pos = pos + 2;
          return true;
        }

        const anchorSlug = hash ? slugifyForHeading(hash) : '';
        const href = `/posts/${postSlug}/${anchorSlug ? '#' + anchorSlug : ''}`;
        const linkText = alias || pagePart;

        const tokenOpen = state.push('link_open', 'a', 1);
        tokenOpen.attrs = [['href', href]];
        const textToken = state.push('text', '', 0);
        textToken.content = linkText;
        state.push('link_close', 'a', -1);
      }

      state.pos = pos + 2;
      return true;
    }

    md.inline.ruler.before('link', 'wikilink', wikilink);
  }

  md.use(wikiLinkPlugin);

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
