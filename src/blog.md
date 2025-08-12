---
layout: layout.njk
title: Blog
---

# Blog

Welcome to my blog.  
I write about things I find interesting, from short notes to longer essays.

---

<ul class="post-list">
{% for post in collections.post %}
  <li>{{ post.date | date("yyyy-MM-dd") }} | <a href="{{ post.url }}">{{ post.data.title }}</a></li>
{% endfor %}
</ul>

---