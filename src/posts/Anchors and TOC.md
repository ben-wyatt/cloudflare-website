---
layout: post.njk
title: Anchors and TOC
date_published: 2025-08-12
tags: [anchors, toc, navigation]
---

Quick table of contents testing in-page anchors and cross-page anchor links.

- [Section A](#section-a)
- [Section B](#section-b)
- [A & B / C?](#a--b--c)

Additionally, a cross-page anchor link to this page via wiki link: [[Anchors and TOC#Section B|Cross-page to Section B]].

## Section A

This section validates in-page anchor navigation. Try the link above to jump here.

Inline link to the next section: [Go to Section B](#section-b).

## Section B

Anchor behavior should be instant (no smooth scroll) per the site script. Try returning to [Section A](#section-a).

## A & B / C?

This heading intentionally includes special characters. The slug should normalize to `a--b--c`.


