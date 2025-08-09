---
layout: layout.njk
title: Markdown Reference
date: 2025-08-09
---

# Markdown Reference

A comprehensive, practical reference to see how common Markdown features render in this site.

- [Headings](#headings)
- [Paragraphs & Line Breaks](#paragraphs--line-breaks)
- [Emphasis](#emphasis)
- [Blockquotes](#blockquotes)
- [Lists](#lists)
- [Code](#code)
- [Tables](#tables)
- [Horizontal Rules](#horizontal-rules)
- [Links](#links)
- [Images](#images)
- [Footnotes](#footnotes)
- [Definition Lists](#definition-lists)
- [Inline HTML](#inline-html)
- [Details/Collapsible](#detailscollapsible)
- [Escaping](#escaping)
- [Math (raw)](#math-raw)
- [Longform Paragraphs](#longform-paragraphs)

## Headings

# H1 Heading
## H2 Heading
### H3 Heading
#### H4 Heading
##### H5 Heading
###### H6 Heading

## Paragraphs & Line Breaks

This is a paragraph of text. It should wrap naturally based on CSS.

This is another paragraph separated by a blank line.

Line breaks can be added with two spaces at the end of a line.  
This line should appear directly below the previous one.

## Emphasis

Regular text, with variations:

- Italic with asterisks: *italic*
- Italic with underscores: _italic_
- Bold with double asterisks: **bold**
- Bold with double underscores: __bold__
- Bold and italic: ***bold italic***
- Strikethrough (GFM): ~~strikethrough~~
- Inline code: `const answer = 42;`

## Blockquotes

> This is a blockquote. It can span multiple lines to form a single block.
>
> Add blank quote lines to separate paragraphs within a quote.

Nested blockquotes:

> Parent quote
>> Child quote
>>> Grandchild quote

## Lists

Unordered list:

- Item A
- Item B
  - Nested item B.1
  - Nested item B.2
- Item C

Ordered list (numbers can be arbitrary, but render sequentially):

1. First
1. Second
1. Third
   1. Third-A
   1. Third-B

Task list (GFM):

- [ ] To do item
- [x] Completed item
- [ ] Another item

## Code

Inline code has been shown above. Fenced code blocks with language hints below.

```javascript
// JavaScript example
function greet(name) {
  const message = `Hello, ${name}!`;
  return message;
}

console.log(greet("World"));
```

```python
# Python example
from datetime import date

def greet(name: str) -> str:
    return f"Hello, {name}! Today is {date.today()}"

print(greet("World"))
```

```bash
# Bash example
echo "Hello" | tr '[:lower:]' '[:upper:]'
```

```json
{
  "name": "example",
  "version": "1.0.0",
  "private": true
}
```

```diff
diff --git a/file.txt b/file.txt
index 83db48f..f735c20 100644
--- a/file.txt
+++ b/file.txt
@@ -1,3 +1,3 @@
-old line
+new line
 unchanged line
```

## Tables

Simple table:

| Animal | Sound  |
| ------ | ------ |
| Cat    | Meow   |
| Dog    | Bark   |

Alignment (GFM):

| Left | Center | Right |
| :--- | :----: | ----: |
| a    |   b    |     c |
| long text here | centered | 12345 |

## Horizontal Rules

---

***

___

## Links

- Inline link: [Eleventy](https://www.11ty.dev/)
- Reference link: [Markdown Guide][mdg]
- Autolink: <https://example.com>
- Email: <hello@example.com>

[mdg]: https://www.markdownguide.org/

## Images

Remote image with alt text:

![Random placeholder](https://picsum.photos/300/160)

Reference-style image:

![Eleventy Logo][11ty-logo]

[11ty-logo]: https://www.11ty.dev/img/built/eleventy-logo.png

## Footnotes

Here is a statement with a footnote.[^note]

Another footnote reference goes here.[^another]

[^note]: This is the first footnote text.
[^another]: And this is another footnote. Footnotes may or may not be rendered specially depending on the Markdown engine.

## Definition Lists

Term 1
: Definition A

Term 2
: Definition B, continued

Term with multiples
: First definition
: Second definition

> Note: Definition lists are not part of core Markdown; some engines support them, others render as paragraphs.

## Inline HTML

Use HTML for things Markdown doesn’t natively support:

Text with <sup>superscript</sup> and <sub>subscript</sub>,
keyboard input like <kbd>Cmd</kbd>+<kbd>K</kbd>,
and <mark>highlighted text</mark> using HTML tags.

## Details/Collapsible

<details>
  <summary>Click to expand</summary>
  <p>This content is hidden by default and revealed on click.</p>
  <pre><code>console.log('Details example');
</code></pre>
</details>

## Escaping

Escape special characters with backslashes: \*asterisks\*, \_underscores\_, \`backticks\`.

Show a literal backslash: \\

## Math (raw)

Inline math using delimiters (rendered as plain text unless a math plugin is enabled): \( a^2 + b^2 = c^2 \).

Block math using delimiters:

\[
E = mc^2
\]


## Longform Paragraphs

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Quisque elementum, odio sit amet venenatis suscipit, leo nunc feugiat mauris, in posuere ligula urna id velit. Integer vel imperdiet ex. Morbi id suscipit lectus. Donec a elementum lorem. Vestibulum feugiat, lorem ut lacinia faucibus, risus nisl iaculis dui, in feugiat sem ipsum a mauris. Curabitur eget arcu eros. Pellentesque a quam luctus, efficitur nibh a, ultrices dui.

Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo. Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt.

At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium voluptatum deleniti atque corrupti quos dolores et quas molestias excepturi sint occaecati cupiditate non provident, similique sunt in culpa qui officia deserunt mollitia animi, id est laborum et dolorum fuga. Et harum quidem rerum facilis est et expedita distinctio.

Nam libero tempore, cum soluta nobis est eligendi optio cumque nihil impedit quo minus id quod maxime placeat facere possimus, omnis voluptas assumenda est, omnis dolor repellendus. Temporibus autem quibusdam et aut officiis debitis aut rerum necessitatibus saepe eveniet ut et voluptates repudiandae sint et molestiae non recusandae.


