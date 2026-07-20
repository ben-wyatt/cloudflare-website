---
name: preserve-blog-style
description: Preserve the dense, quiet, monospace design language of Ben Wyatt's Eleventy blog and Record Club. Use when creating, editing, or reviewing Markdown content, Nunjucks templates, CSS, page layouts, controls, games, or the local design guide—especially changes involving typography, emphasis, spacing, content width, color, surfaces, responsive behavior, or visual hierarchy.
---

# Preserve Blog Style

## Start from the source of truth

- Treat the checked-out repository as authoritative. Read `styles/main.css`, the affected page stylesheet, and the relevant Nunjucks or Markdown before choosing a pattern.
- Read `src/_data/palettes.js` before changing palette behavior. Keep it as the palette authority and use the generated `/styles/palettes.css` output.
- Preserve existing user changes. Make the smallest coherent change that satisfies the request.
- Follow current user instructions and `AGENTS.md` when they intentionally revise this guide.

## Hold the north star

Make the site feel like “a personal instrument panel with the manners of a book.” Keep it direct, text-led, dense, quiet, and slightly playful.

- Lead with readable text; add structure only when it improves meaning, access, or interaction.
- Create density through a narrow measure, simple markup, compact rhythms, and low chrome. Do not create density by shrinking body text or crushing line-height.
- Let useful structure come second and optional play come third.
- Make novelty earn its place through clarity, warmth, or shared activity.
- Avoid turning a personal notebook into a generic SaaS dashboard, marketing page, or component gallery.

## Keep the typography disciplined

Use the Blog as the ceiling for normal page copy and interface text.

| Role | Established rule |
| --- | --- |
| Font | Local Inconsolata everywhere by default |
| Body and list copy | `1rem` / 16px, weight 400, line-height `1.6` |
| H1 | `clamp(2rem, 3.2vw, 2.6rem)`, line-height `1.2` |
| H2 | `clamp(1.6rem, 2.6vw, 2.1rem)`, line-height `1.2` |
| H3 | `clamp(1.3rem, 2vw, 1.6rem)`, line-height `1.2` |
| Headings | Inconsolata, weight 700, `-0.01em` letter-spacing |
| Metadata | Usually `0.95rem` or smaller and muted |

- Use `var(--font-body)`, `var(--font-heading)`, or `font: inherit`; do not introduce a new font stack or remote font dependency.
- Keep controls, labels, code, navigation, and headings in the same monospace family.
- Keep body copy at `1rem` on mobile. Allow the heading clamps to reduce hierarchy naturally.
- Reserve oversized display type for a documented exception. Do not copy the local design guide's large hero sizing into production pages.
- Keep every visible text role in Inconsolata, including Record Club games. Do not introduce an editorial serif exception.

## Preserve the reading measure and spacing

- Keep text-led pages on `--content-width` (`720px` maximum).
- Keep the body centered with `margin: auto` and `padding: 1rem`. Expect a 720px content area plus 16px padding per side on wide screens and a 16px gutter on narrow screens.
- Use `--wide-content-width` (`1120px`) only for a real multi-column workspace state, not because a desktop has spare room.
- Keep normal paragraphs at the browser's compact `1rem` vertical rhythm and normal copy at `1.6` line-height.
- Keep header and footer separation around the established `2rem` rhythm.
- Keep utility lists and tables compact: small row gaps, roughly `0.25rem` row padding, thin rules, and little decorative indentation.
- Prefer whitespace and thin borders over nested cards. Do not wrap every section in a rounded panel.
- Keep most reading content left-aligned. Center only compact navigation or an explicitly editorial/display moment.

## Use emphasis semantically

- Write Markdown italics as `*text*` for stress, titles, a changed reading of a phrase, or a small tonal aside. Let `<em>` keep its true italic form and muted `--em-color` treatment.
- Write Markdown bold as `**text**` for a name, key anchor, or genuinely important takeaway. Let `<strong>` use weight 700 and `--bold-color` / the strong primary accent.
- Use both sparingly. Do not bold whole paragraphs, decorate every noun, or use italics as generic gray metadata.
- Preserve link color when emphasis appears inside a link; do not let nested bold or italics override the internal/external link signal.
- Prefer sentence case and ordinary prose. Avoid streams of uppercase labels unless a compact instrument-panel label genuinely benefits from them.

## Keep content Markdown-first

- Prefer headings, paragraphs, lists, links, rules, inline code, and code fences over custom wrappers.
- Use short, direct sections without fragmenting every idea into its own card or oversized heading.
- Keep article hierarchy shallow. Use H2 for major sections and H3 only when a section needs real subdivision.
- Preserve post frontmatter requirements: `title`, `layout`, `date_published`, `date_updated`, and tags.
- Do not add a title H1 inside exported post Markdown; `src/_includes/post.njk` supplies it.
- Preserve wiki-link, heading-anchor, syntax-highlighting, and attachment conventions already implemented by the build.

## Use semantic color and quiet surfaces

- Consume semantic variables such as `--color-bg`, `--color-surface`, `--color-surface-soft`, `--color-surface-sunken`, `--color-text`, `--color-text-muted`, `--color-text-subtle`, `--color-border`, `--color-border-strong`, `--color-primary`, `--color-primary-strong`, `--color-secondary`, `--color-secondary-strong`, `--color-on-primary`, `--color-on-secondary`, `--color-focus`, and the status roles.
- Do not scatter raw hex values in components. Add a semantic role to the system when an existing role cannot express the requirement.
- Let one accent speak. Use primary for the main action or signal and secondary for a counterpoint, not a competing headline.
- Keep the internal/external link distinction and visible underlines. Never remove focus styling.
- Use subtle surface shifts and 1px rules before shadows, gradients, or saturated fills.
- Use modest radii: roughly 4px for inline code or small media and 8px for ordinary controls/code blocks. Reserve pills for compact badges or round controls.
- Make success, warning, danger, loading, and selection understandable through text, icons, position, or state—not color alone.
- Verify every change in both light and dark mode and across multiple palettes.
- Keep the palette cycler hidden behind the footer-year Easter egg. Do not add a visible palette picker unless explicitly requested.

## Build simple, accessible interaction

- Prefer semantic HTML and the least markup that communicates the interaction.
- Inherit the house font in inputs and buttons.
- Keep controls compact but usable; preserve clear labels, keyboard access, and visible focus rings.
- Use motion as optional feedback. Respect reduced motion and avoid adding ambient animation to reading pages.
- Prefer text links for navigation and secondary actions. Use filled buttons only for a clear primary action.
- Avoid gratuitous icon sets, floating glass panels, heavy drop shadows, gradients, and decorative charts.

## Respect the exception ledger

- Keep `src/design.njk` local-only behind `DESIGN_GUIDE=1`. Its oversized hero and showcase layout document the system; they do not redefine production defaults.
- Keep Record game typography on the same Inconsolata system as the rest of the site.
- Allow `--wide-content-width` only when multi-column work truly needs it; return reading content to the 720px measure.
- Document any new intentional exception close to its CSS and keep its scope narrow.

## Apply changes with this workflow

1. Inspect the affected page, shared layout, `styles/main.css`, and any page-specific stylesheet.
2. Identify the closest existing pattern and reuse its tokens, scale, spacing, and markup.
3. Implement the smallest complete change. Prefer semantic HTML and semantic CSS variables.
4. Review the result at a wide desktop viewport and around a 390px mobile viewport. Confirm that body copy stays 16px, mobile gutters stay near 16px, and prose never expands beyond 720px.
5. Check typography, emphasis, focus, status meaning, light/dark mode, and at least two palettes.
6. Run `npm run build` after template, style, or content changes.
7. When shared design infrastructure or the guide changes, verify `npm run serve:design`, then run a clean production build and confirm that no `/design/` page or design navigation is emitted.

## Reject drift before shipping

Confirm all of the following:

- Use Inconsolata for every visible text role, including games.
- Keep normal copy at 1rem with 1.6 line-height.
- Keep prose at or below 720px and retain 16px mobile gutters.
- Preserve density without crowding or cardifying the page.
- Use italics as muted semantic emphasis and bold as sparse strong emphasis.
- Use semantic tokens rather than raw component colors.
- Preserve internal/external link treatment and visible focus.
- Keep hierarchy readable in light and dark themes without relying on color alone.
- Preserve the local-only design-guide boundary and the narrow scope of documented exceptions.
