---
layout: post.njk
title: Code Blocks Language Badges Test
date_published: 2025-08-12
tags: [code, badges, highlighting]
---

This post exercises the language detection and copy-to-clipboard button on code blocks.

```ts
export function greet(name: string): string {
  return `Hello, ${name}`;
}
```

```tsx
type Props = { label: string };
export const Button = ({ label }: Props) => <button>{label}</button>;
```

```jsx
function App() { return <div>Hi</div>; }
```

```go
package main
import "fmt"
func main(){ fmt.Println("hello") }
```

```rust
fn main(){ println!("hello"); }
```

```kotlin
fun main(){ println("hello") }
```

```swift
print("hello")
```

```dockerfile
FROM node:20-alpine
WORKDIR /app
```

```yaml
name: test
on: [push]
```

```toml
title = "Example"
```

```ini
[section]
key=value
```

```xml
<note><to>World</to></note>
```

```sql
SELECT 1 as one;
```

```regex
^[a-z]+\d*$
```

```plaintext
Plain text should render with a simple "Copy" label.
```

```zsh
echo "hello from zsh"
```


