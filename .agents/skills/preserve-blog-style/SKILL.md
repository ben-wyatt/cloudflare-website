---
name: preserve-blog-style
description: Preserve the dense, quiet, monospace design language of Ben Wyatt's Eleventy blog and Record Club. Use when creating, editing, or reviewing Markdown content, Nunjucks templates, CSS, page layouts, controls, games, or the local design guide—especially changes involving typography, emphasis, spacing, content width, color, surfaces, responsive behavior, or visual hierarchy.
---

# Preserve Blog Style

## Read before styling

- Inspect `styles/main.css`, the affected stylesheet, and relevant Nunjucks or Markdown; the checkout is authoritative, so reuse its closest pattern.
- Before palette work, read `src/_data/palettes.js`; `/styles/palettes.css` is generated from it.

## Keep the north star

Make the site “a personal instrument panel with the manners of a book”: direct, dense, quiet, and slightly playful. Put text first, useful structure second, and play only where it adds clarity, warmth, or shared activity. If it resembles a generic SaaS shell, marketing template, or component gallery, subtract.

## Preserve type and content

Use local Inconsolata for all copy, headings, navigation, controls, code, and games via the existing font variables or `font: inherit`; add no remote font or serif exception.

| Role | Rule |
| --- | --- |
| Body/list copy | `1rem` / 16px, weight 400, line-height `1.6`, including mobile |
| H1 | `clamp(2rem, 3.2vw, 2.6rem)`, line-height `1.2` |
| H2 | `clamp(1.6rem, 2.6vw, 2.1rem)`, line-height `1.2` |
| H3 | `clamp(1.3rem, 2vw, 1.6rem)`, line-height `1.2` |
| Headings | Weight 700, `-0.01em` letter-spacing |
| Small UI | Usually `0.95rem` or smaller; may reach `0.72rem`, but body copy may not |
| Display exception | Only the Record game masthead, up to `5.4rem` |

- Keep content Markdown-first with shallow H2/H3 hierarchy and native elements before wrappers. Posts require `title`, `layout`, `date_published`, `date_updated`, and tags; omit the title H1 supplied by `post.njk`. Preserve wiki links, heading anchors, highlighting, and attachments.
- Use `*italics*` sparingly for stress, titles, or asides, retaining true italic and muted `--em-color`; use `**bold**` for key anchors, retaining weight 700 and `--bold-color`. Neither may override link color. Prefer sentence case.

## Keep UI quiet

- Center the `--content-width` (`720px`) column with `margin: auto` and 16px gutters. Use `--wide-content-width` (`1120px`) only for a real multi-column workspace; keep prose left-aligned and return it to 720px.
- Create density with simple markup and compact rhythm, never tiny body text or crushed line-height. Keep paragraph rhythm near `1rem`, header/footer separation near `2rem`, and utility rows near `0.25rem` padding.
- Prefer prose, lists, whitespace, thin 1px rules, underlined text links, and underline inputs. Use panels only for real grouping, filled buttons only for the primary action, and modest radii (about 4px inline, 8px for controls/code blocks).
- Keep controls compact and visibly focused. Prefer text links for navigation and secondary actions. Motion is optional feedback and must respect reduced motion.
- Avoid nested cards, gratuitous pills or icons, gradients, glass, heavy shadows, oversized production heroes, decorative charts, ambient animation, and centering ordinary reading content.

## Use color semantically

- Use indigo, forest, amber, rose, teal, or purple through semantic `--color-*` roles; never add component hex. Add a role only when none fits.
- Let one accent speak: primary is the main action/internal link; secondary is the counterpoint/external link. Preserve their underlined distinction and nested-emphasis color.
- Use subtle surface shifts before decoration. Communicate focus, success, warning, danger, loading, and selection with text, icons, position, or state as well as color.
- Keep the palette cycler hidden behind the footer-year Easter egg. Add no visible picker unless explicitly requested.

## Verify

1. Check wide desktop and about 390px mobile: 16px copy/gutters, prose at most 720px, compact hierarchy, focus, and reduced motion.
2. Check light and dark mode with at least two palettes; confirm status and hierarchy do not rely on color alone.
3. Run `npm run build` after content, template, or style changes.
4. For shared design infrastructure or guide changes, also verify `npm run serve:design`; then run a clean production build and confirm `/design/` and its navigation remain absent. Keep `src/design.njk` gated by `DESIGN_GUIDE=1`; its showcase hero is not a production precedent.
5. Scope and document any new intentional exception beside its CSS.
