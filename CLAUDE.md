# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Pantsdown is a Markdown to HTML converter that renders markdown similar to GitHub's styling. It was built specifically for [github-preview.nvim](https://github.com/wallpants/github-preview.nvim). Based on [Marked](https://github.com/markedjs/marked).

## Commands

```bash
# Type checking
bun run typecheck

# Linting
bun run lint

# Both typecheck and lint
bun run check

# Run tests (uses bun:test with happy-dom)
bun test

# Run a single test file
bun test tests/parse.test.ts

# Update test snapshots
bun test --update-snapshots

# Format code
bun run format

# Build docs
bun run docs:build
```

## Architecture

The parsing pipeline follows a classic compiler pattern:

1. **Lexer** (`src/lexer.ts`) - Tokenizes markdown source into an array of tokens
   - Uses `Tokenizer` for the actual token creation
   - Processes block-level tokens first, then inline tokens
   - Tracks source maps for line number references
   - Collects footnotes separately

2. **Tokenizer** (`src/tokenizer.ts`) - Creates tokens from markdown patterns
   - Uses regex rules from `src/rules/block.ts` and `src/rules/inline.ts`

3. **Parser** (`src/parser.ts`) - Converts tokens to HTML by dispatching to the Renderer
   - Recursively processes nested tokens

4. **Renderer** (`src/renderer.ts`) - Produces HTML output for each token type
   - Uses highlight.js for syntax highlighting
   - Uses github-slugger for heading anchors
   - Handles special cases like mermaid diagrams and alerts

Entry point: `Pantsdown` class in `src/pantsdown.ts` coordinates the pipeline.

## Key Types

All token types are defined in `src/types.ts`. The `Token` union type covers all possible markdown elements (headings, code blocks, lists, tables, footnotes, alerts, etc.).

## Output

`pantsdown.parse(markdown)` returns `{ html, javascript }`:
- `html`: The rendered HTML string
- `javascript`: A script for interactive features (task list checkboxes, copy buttons)

## Styling

CSS is in `src/css/styles.css`. Requires a parent element with classes `pantsdown light` or `pantsdown dark` (optionally with `high-contrast`).
