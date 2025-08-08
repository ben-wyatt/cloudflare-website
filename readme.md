# Personal Website MVP

A lightweight, high‑performance personal website built with [Eleventy](https://www.11ty.dev/).  
Features a simple page structure, responsive design, light/dark theme toggle, and Markdown‑powered blog ready for easy publishing from Obsidian.

## Structure
- **Home (`/`)**
- **About (`/about/`)**
- **Blog (`/blog/`)** with listing of posts in `src/posts/`
- **Individual blog pages** generated from Markdown

## Theme Modification
You can adjust colors, fonts, and spacing in `styles/main.css`:
- **Colors:** Update CSS variables at the top of the file (e.g. `--bg-color-light`, `--text-color-light`).
- **Fonts:** Change the Google Fonts import in `src/_includes/layout.njk` and update `font-family` in CSS.
- **Layout:** Modify body `max-width`, margins, and line-height.
- **Icons/Links:** Extend CSS to style specific outbound links with icons.

After making changes, run:
```
npx @11ty/eleventy --serve
```
to preview locally.

## Next Steps
1. **Content** — Add real `src/posts/*.md` files by exporting from Obsidian.
2. **Design Polish** — Fine‑tune typography, spacing, and colors to match your vision.
3. **Icon Styling** — Add site‑specific icons for outbound links.
4. **Deploy** — Commit and push changes to GitHub to auto‑deploy to Vercel.

To deploy your site to Vercel:

1. **Set Up Vercel**
   - Log in to [Vercel](https://vercel.com/) and create a new project.
   - Connect your GitHub repository to Vercel.

2. **Configure Build Settings**
   - In the Vercel dashboard, set the following build settings:
     - **Framework Preset:** Select "Eleventy".
     - **Build Command:** `npx @11ty/eleventy`
     - **Output Directory:** `_site`

3. **Push Changes**
   - Commit and push your changes to the `main` branch (or the branch you configured in Vercel).

4. **Verify Deployment**
   - Vercel will automatically build and deploy your site. Check the live URL provided by Vercel to ensure everything is working correctly.

5. **Custom Domain (Optional)**
   - If you have a custom domain, add it in the Vercel dashboard and update your DNS settings to point to Vercel's servers.

5. **Enhancements** — Consider adding search, tagging, or other features in future iterations.


# Adding new Blog posts

## Adding new Blog posts

To publish a new markdown file as a blog post:

1. **Create a New Markdown File**
   - Place the new markdown file in the `src/posts/` directory. This is where your existing blog posts are stored (e.g., `first-post.md` and `Note Formatting Example.md`).

2. **Add Frontmatter**
   - Your markdown file should include frontmatter at the top (usually in YAML format) to define metadata like the title, date, and layout. For example:
     ```markdown
     ---
     title: "My New Blog Post"
     date: "2023-10-01"
     layout: "post"
     ---
     ```

3. **Build the Site**
   - Run the build command to generate the HTML files from the markdown source. This is typically done with:
     ```bash
     npx @11ty/eleventy
     ```

4. **Verify the Output**
   - After building, the new blog post should appear in the `_site/posts/` directory as an HTML file. For example:
     ```
     _site/posts/my-new-blog-post/index.html
     ```

5. **Link the Post**
   - Ensure the new post is linked from the `src/blog.md` file (or wherever your blog index is defined). This file likely generates the `_site/blog/index.html` page.

6. **Deploy**

## Deploying to Vercel

To deploy your site to Vercel:

1. **Set Up Vercel**
   - Log in to [Vercel](https://vercel.com/) and create a new project.
   - Connect your GitHub repository to Vercel.

2. **Configure Build Settings**
   - In the Vercel dashboard, set the following build settings:
     - **Framework Preset:** Select "Eleventy".
     - **Build Command:** `npx @11ty/eleventy`
     - **Output Directory:** `_site`

3. **Push Changes**
   - Commit and push your changes to the `main` branch (or the branch you configured in Vercel).

4. **Verify Deployment**
   - Vercel will automatically build and deploy your site. Check the live URL provided by Vercel to ensure everything is working correctly.

5. **Custom Domain (Optional)**
   - If you have a custom domain, add it in the Vercel dashboard and update your DNS settings to point to Vercel's servers.
