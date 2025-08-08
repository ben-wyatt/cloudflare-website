---
title: Obsidian Formatting Showcase
author:
  - Ben
  - o3
created: 2025-05-18
aliases:
  - Formatting Demo
  - Markdown Kitchen Sink
  - Obsidian Formatting
tags:
  - Obsidian
---

# Obsidian Formatting Showcase  

In this note I show examples of the most common formatting that I personally use.

## Text formatting

### Inline

_Italics_ can either be done with *asterisks* or with _underscores_.

**Bold**, which works with **double asterisks** or __double underscores__.

You can highlight with ==double equals==.

And write inline code with `backticks`.

And do footnote references with brackets and carrots: `[^1]`[^1]


### Multiline

> You can use greater than's (>) to do blockquotes.
> Which can be multi line.

- lists can be created using `- ` (notice the space)
	- and can be nested by tabbing: `	- `
1. And can be ordered using numbers `1. `

- [ ] TODOs can be created by doing `- [ ]` 
- [>] Can be in progress `- [>]`
- [-] Cancelled `- [-]`
- [x] Or Done `- [x]`


> [!tip] Callouts
> You can turn a blockquote into a Callout by  adding  `[!tip]` to the beginning.
> 

> [!info] Title Only Callout using `[!info]`

> [!warning]- Collapsing Callouts
> Add a minus sign to make the callout collapse.
> ```
> > [!warning]- Collapsing Callouts
> > Add a minus sign to make the callout collapse.
> ```

A few others colors.

> [!note]

> [!success]

> [!failure]

> [!example]

> [!warning]

> [!quote]


Code blocks are started with triple backticks \`\`\` and can be customized to a specific language.

```python
from datetime import date
print(f'hello world! Today is {date}')
```

```bash
echo "Hello World" | grep 'h'
```

Tables are also standard markdown.

```markdown
| First name | Last name |
| ---------- | --------- |
| Max        | Planck    |
| Marie      | Curie     |
```

becomes

| First name | Last name |
| ---------- | --------- |
| Max        | Planck    |
| Marie      | Curie     |

Well actually you can simplify this down to:

```markdown
First name | Last name 
-- | -- 
Max | Planck 
Marie | Curie
```

First name | Last name 
-- | -- 
Max | Planck 
Marie | Curie



## Links & Embeds

### Notes

The most interesting feature of Obsidian is how it links notes.

You can link vault notes by using double brackets `[[Another Note]]` to make [[Another Note]].

You can point to a specific header by including hashes `[[AnotherNote#Header 1]]` to make [[Another Note#Header 1]].


You can use [[Another Note|an alias]] to the same note using pipes `[[Another Note|an alias]]`.


To embed your note add an exclamation point `![[Another Note]]`.

![[Another Note]]


### Internal Media

Images can be embedded by storing the file in the note vault. Make sure to include the file extension. You can set it based on pixel count using a pipe. `![[Obsidian Logo.png|100x100]]`


![[Obsidian Logo.png|100x100]]


A bunch of other type of media work to:
- audio files
- PDFs: `![[Document.pdf#page=3,height=400]]`
- 

### Hyperlinks

You can use the standard markdown format for web URL links `[Obsidian Home Page](https://obsidian.md/)`[Obsidian Home Page](https://obsidian.md/).

And embed images from the web automatically. 

`![Lorem Picksum](https://picsum.photos/200/300)`

![Lorem Picsum](https://picsum.photos/200/300)

### Blocknames

You can assign a blockname  to pieces of text using `#^` two lines down next line. Then reference it elsewhere.


- this
- is
- a
- list

^samplelist

`![[Note Formatting Example#^samplelist]]`
![[Note Formatting Example#^samplelist]]



## Metadata

### [Properties](https://help.obsidian.md/properties)

You can add a frontmatter to a note to store metadata. It uses YAML formatting.

```markdown
---
title: Obsidian Formatting Showcase #text
author:              #list
  - Ben
  - o3
created: 2025-05-18  #date
note: true           #boolean
pi: 3.14159          #numbers
link: "[[Another Note]]" #links by surrounding in quotes
aliases:
  - Formatting Demo
  - Markdown Kitchen Sink
tags:
  - Obsidian
---
```

There are a few [special properties](https://help.obsidian.md/properties#Default+properties) that have extra meaning, like `tags`, `aliases`, and `cssclassses`.

### [Tags](https://help.obsidian.md/tags)

Tags help with note search.

You can create tags inline by using a hash `#formatting` #formatting.
