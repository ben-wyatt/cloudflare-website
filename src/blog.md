---
layout: layout.njk
title: Blog
---

# Blog

Welcome to my blog.  
I write about things I find interesting, from short notes to longer essays.

<form id="blog-search" class="blog-search" role="search">
  <label for="blog-search-query">Search the blog</label>
  <div class="blog-search-controls">
    <input id="blog-search-query" name="q" type="search" autocomplete="off" maxlength="200" placeholder="a topic, name, or question" required>
    <button type="submit">Search</button>
  </div>
  <p class="blog-search-help">Searches run on the server; no model download is needed.</p>
</form>
<section id="blog-search-results" class="blog-search-results" aria-label="Search results" hidden>
  <p id="blog-search-status" role="status" aria-live="polite"></p>
  <ul id="blog-search-list" class="blog-search-list"></ul>
</section>
<script type="module" src="/assets/js/blog-search.js"></script>

---

<ul class="post-list">
{% for post in collections.post %}
  <li>{{ post.date | date("yyyy-MM-dd") }} | <a href="{{ post.url }}">{{ post.data.title }}</a></li>
{% endfor %}
</ul>

---
