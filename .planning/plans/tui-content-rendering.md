# Uniview TUI Renderer: Markdown / Code / Diff / Syntax Highlight Implementation Plan

## 1. Goal

为 Uniview TUI renderer 实现完整内容渲染能力。

目标：

支持：

* Markdown rendering
* Fenced code blocks
* Syntax highlighting
* File preview
* Diff viewer
* Streaming AI output
* Theme system
* Terminal-friendly layout

参考：

* Ink ecosystem
* OpenTUI
* OpenCode TUI architecture

但是不直接复制，而是实现适合 Uniview 的 TUI rendering layer。

---

# 2. Architecture Principle

不要采用：

```
source
  |
  v
ANSI string
  |
  v
terminal
```

例如：

```
\x1b[32mconst\x1b[0m x
```

原因：

* layout 不知道 token 信息
* selection 困难
* streaming 更新困难
* diff 支持困难

推荐：

```
Content
   |
   v
Parser
   |
   v
Styled Text Model
   |
   v
OpenTUI Renderer
   |
   v
Terminal Buffer
```

---

# 3. Reference: Ink Approach

## 3.1 Ink model

Ink 是 React for Terminal。

结构：

```
React Component Tree
        |
        v
Ink Renderer
        |
        v
ANSI Output
```

基本组件：

```tsx
<Text color="green">
 hello
</Text>
```

最终：

```
ANSI escape sequence
```

---

## 3.2 Ink Syntax Highlight

Ink 本身没有内置 syntax highlighting。

通常：

```
Code
 |
 v
highlight.js / cli-highlight
 |
 v
ANSI string
 |
 v
<Text>
```

例如：

```tsx
<Text>
  {highlight(code)}
</Text>
```

优点：

* 简单
* React 生态
* 适合 CLI

缺点：

* highlight 和 renderer 分离
* token 信息丢失
* 不适合复杂 editor-like UI

---

# 4. Reference: OpenTUI/OpenCode Approach

OpenTUI 采用 structured rendering。

核心：

```
Code
 |
 v
Tree-sitter
 |
 v
Highlight ranges
 |
 v
Text chunks
 |
 v
Terminal cells
```

不会生成 ANSI string。

---

# 5. Markdown Rendering Design

## 5.1 Requirements

支持：

* heading
* paragraph
* list
* quote
* table
* link
* inline code
* fenced code block

输入：

````md
# Hello

```ts
const x = 1
````

```

解析：

```

Markdown
|
v
AST
|
v
Renderable tree

````

---

## 5.2 Recommended Component API

设计：

```tsx
<Markdown
  content={message}
/>
````

内部：

```
MarkdownRenderable

    |
    + Heading
    |
    + Text
    |
    + CodeRenderable
    |
    + DiffRenderable
```

---

# 6. Code Highlight Design

## 6.1 Code Component

设计：

```tsx
<Code
  language="typescript"
  content={source}
/>
```

---

## 6.2 Syntax Pipeline

推荐：

Tree-sitter:

```
Source Code

    |
    v

Tree-sitter Parser

    |
    v

Highlight Query

    |
    v

Syntax Token

    |
    v

Styled Text
```

---

## 6.3 Token Model

不要直接输出 ANSI。

设计：

```ts
interface StyledToken {

  text: string

  scope:
    | "keyword"
    | "string"
    | "comment"
    | "function"
    | "type"
    | "variable"
    | "number"

}
```

例如：

```ts
[
 {
   text:"const",
   scope:"keyword"
 },
 {
   text:"name",
   scope:"variable"
 }
]
```

---

# 7. Theme System

不要：

```
keyword = red
```

应该：

```
semantic color
```

例如：

```ts
interface SyntaxTheme {

 keyword: Color

 string: Color

 comment: Color

 function: Color

 type: Color

 variable: Color

 number: Color

}
```

类似 OpenCode：

```
syntaxKeyword
syntaxString
syntaxFunction
syntaxType
```

优势：

* theme 可以切换
* Dracula
* Tokyo Night
* Catppuccin
* 自定义主题

---

# 8. Diff Viewer Design

目标：

支持：

* unified diff
* added lines
* removed lines
* syntax highlight
* line number

API：

```tsx
<Diff
  language="typescript"
  diff={patch}
/>
```

结构：

```
DiffRenderable

    |
    + LineNumber
    |
    + Added/Removed Style
    |
    + Code Highlight
```

---

# 9. Streaming Support

AI TUI 最大需求：

LLM 输出不断增加。

不要：

```
append token

parse everything

highlight everything
```

应该：

```
Stable content

+

Streaming tail
```

类似 OpenTUI：

```
completed blocks
       +
unstable markdown block
```

---

# 10. File Preview

支持：

```
cat file
```

类似：

```tsx
<Code
 filetype="rust"
 content={file}
/>
```

需要：

filetype detection:

```
.ts
.tsx
.rs
.py
.go
.json
.yaml
.md
```

---

# 11. Implementation Plan

## Phase 0: Research

完成：

* OpenTUI CodeRenderable
* MarkdownRenderable
* DiffRenderable

确认：

* render lifecycle
* streaming behavior
* text measurement

---

# Phase 1: Basic Text Model

实现：

```
StyledText
TextChunk
Theme
```

测试：

```
token
 |
 v
rendered terminal output
```

---

# Phase 2: Code Renderer

实现：

```
<Code>
```

支持：

第一批语言：

* typescript
* javascript
* json
* rust
* python

集成：

Tree-sitter

测试：

输入：

```ts
const x = "hello"
```

验证：

```
const -> keyword

x -> variable

hello -> string
```

---

# Phase 3: Markdown Renderer

实现：

```
<Markdown>
```

支持：

* headings
* paragraphs
* lists
* code block

code block 调用：

```
CodeRenderer
```

---

# Phase 4: Theme

实现：

```
ThemeProvider

SyntaxStyle

Color resolver
```

支持：

* dark
* light
* custom theme

---

# Phase 5: Diff Renderer

实现：

```
<Diff>
```

支持：

* line number
* additions
* removals
* syntax highlight

---

# Phase 6: Streaming

优化：

* incremental markdown parsing
* partial code highlight
* stable block reuse

---

# Phase 7: Testing

## Unit Tests

测试：

```
markdown parser

syntax tokenizer

diff parser
```

---

## Snapshot Tests

输入：

````md
# Test

```ts
const x=1
````

```

保存：

```

expected tree

```

---

## Terminal Visual Tests

测试：

- alignment
- colors
- wrapping
- unicode width
- scrolling

生成：

```

golden terminal screenshot

```

---

# 12. Final TUI Architecture

目标：

```

```
          Uniview TUI

               |
      Semantic Content

               |
    ---------------------

    Markdown
    Code
    Diff

               |

    Styled Text Model

               |

        OpenTUI Renderer

               |

          Terminal
```

```

最终 Uniview TUI 应该达到：

- 接近 OpenCode 的 AI terminal UX
- 比 Ink 更强的 structured rendering
- 支持复杂 Markdown / Code / Diff 场景
- 为未来 editor-like interaction 保留空间
```
