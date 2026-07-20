# Design style

A personal instrument panel with the manners of a book: text first, structure second, play only when it earns space.

- **Type:** Local Inconsolata everywhere: copy, headings, navigation, controls, code, and games. Body is `1rem`/16px at `1.6` line-height. H1 is `2–2.6rem`, H2 `1.6–2.1rem`, H3 `1.3–1.6rem`; small UI may reach `0.72rem`, never body copy. The Record game masthead is the only display-size exception and may reach `5.4rem`.
- **Measure:** Center text in `720px` with `1rem` gutters. Go wide only for a real multi-column workspace. Create density with simple markup and compact rhythm, not tiny copy.
- **Color:** Choose indigo, forest, amber, rose, teal, or purple from `src/_data/palettes.js`; each supplies light and dark values. Use semantic `--color-*` tokens, never component hex. Primary is the main action/internal link; secondary is the counterpoint/external link. Let one accent speak.
- **UI:** Remove everything nonessential. Prefer prose, lists, whitespace, thin rules, underlined text links, and underline inputs. Reserve filled buttons for the primary action and panels for real grouping. Keep focus visible; never use color alone.
- **Never:** generic app shells, nested cards, gratuitous pills/icons, gradients, glass, heavy shadows, oversized hero text, ambient animation, or a visible palette picker. If it looks like a template, subtract.
