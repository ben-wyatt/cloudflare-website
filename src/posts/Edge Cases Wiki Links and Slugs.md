---
layout: post.njk
title: Edge Cases — Wiki Links and Slugs
date_published: 2025-08-12
tags: [edge-cases, slugs, links]
---

Testing slug generation for headings with punctuation and multiple spaces, plus empty wiki links.

- Empty wiki link literal: [[]]
- Self-link to a complex heading: [[Edge Cases — Wiki Links and Slugs#A & B / C?]]
- Cross-link to complex heading on another page: [[Anchors and TOC#A & B / C?|Special heading on TOC]]

## A & B / C?

The expected anchor slug is `a--b--c`.

##   Spaces   and   Tabs

Multiple spaces should reduce to single hyphens in the slug.


