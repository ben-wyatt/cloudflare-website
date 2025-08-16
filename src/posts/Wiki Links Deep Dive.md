---
layout: post.njk
title: Wiki Links Deep Dive
date_published: 2025-08-12
tags: [wiki, links, obsidian]
---

This post exercises Obsidian-style wiki links, including aliases and heading anchors. It also includes edge cases like non-existent pages and empty links.

## Basics

- Link to an existing post: [[Markdown Reference]]
- Link to another post: [[Future of Stablecoins]]

## Aliases

- Alias to Markdown Reference: [[Markdown Reference|MD Ref]]
- Alias to Stablecoins essay: [[Future of Stablecoins|Stablecoins essay]]

## Heading Anchors (cross-page)

- To a specific section in Markdown Reference: [[Markdown Reference#Large Table]]
- With an alias label: [[Markdown Reference#Two-Column Table|Two Columns]]

## Self-link and Anchors

- Link to a section in this page: [[Wiki Links Deep Dive#Examples]]

## Edge Cases

- Non-existent page: [[This Page Does Not Exist]]
- Empty link should render literally: [[]]

## Examples

Content under the Examples section to verify in-page anchor behavior and cross-page anchor generation.


