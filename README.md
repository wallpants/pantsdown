# Pantsdown

<img src="https://raw.githubusercontent.com/wallpants/pantsdown/main/docs/github.svg" height="60px" align="right" />
<img src="https://raw.githubusercontent.com/wallpants/pantsdown/main/docs/markdown.svg" height="60px" align="right" />

Pantsdown is a **Markdown** to **HTML** converter. It attempts to render markdown similar to how GitHub does it plus
some features developed specifically for [github-preview.nvim](https://github.com/wallpants/github-preview.nvim).

## [▶️ Demo](https://wallpants.github.io/pantsdown/)

## 📦 Installation

This package is distributed only as a TypeScript module.
This means you'll need a bundler to handle transpilation.
See below for usage examples.

```sh
# bun
bun install pantsdown
# npm
npm install pantsdown
```

## 💻 Usage

🚨 Pantsdown does not sanitize the output HTML. If you are processing potentially unsafe strings,
it's recommended you use a sanitization library like [DOMPurify](https://github.com/cure53/DOMPurify).

### Styles

For styles to be properly applied, either the element containing the generated html or one of its parents
must have the classes `class="pantsdown light"` or `class="pantsdown dark"` added. You can also add
the class `"high-contrast"` to enable high-contrast themes `class="pantsdown dark high-contrast"` or
`class="pantsdown light high-contrast"`.

### [Bun](https://bun.sh/)

Take a look at [how Pantsdown's demo is built](https://github.com/wallpants/pantsdown/blob/main/docs/build.ts)
for a very simple usage example with Bun.

### [Vite](https://vitejs.dev/guide/#scaffolding-your-first-vite-project)

Create a Vite Project & install dependencies:

```sh
bun create vite my-app --template react-swc-ts
cd my-app
bun install pantsdown
```

Remove CSS from `my-app/src/main.tsx`:

```diff
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
- import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

Replace content in `my-app/src/App.tsx`:

```tsx
import { Pantsdown } from "pantsdown";
import "pantsdown/styles.css";
import { useEffect } from "react";

const pantsdown = new Pantsdown();

function App() {
  useEffect(() => {
    const container = document.getElementById("markdown-container");
    if (!container) return;

    const markdown = "# Hello world\n- [ ] Task 1\n- [x] Task 2";
    const { html, javascript } = pantsdown.parse(markdown);
    container.innerHTML = html;

    const newScript = document.createElement("script");
    newScript.text = javascript;
    container.appendChild(newScript);
  }, []);

  // ⚠️ for styles to be applied, a parent element must have
  // the classes "pantsdown light" or "pantsdown dark" added
  return <div id="markdown-container" className="pantsdown light" />;
}

export default App;
```

## ⚙️ Configuration

The Pantsdown constructor accepts an optional configuration object.
If you

```typescript
import { Pantsdown, type PartialPantsdownConfig } from "pantsdown";

// This is the default config object. If you provide
// a config object, it will be deeply merged into this.
const config: PartialPantsdownConfig = {
  renderer: {
    /**
     * Prefix to be added to relative image sources.
     * Must start and end with "/"
     *
     * @example
     * relativeImageUrlPrefix: "/__localimage__/"
     *
     * ![image](./wallpants-512.png)
     * relative src is updated and results in:
     * <img src="/__localimage__/wallpants-512.png" />
     *
     * ![image](https://avatars.githubusercontent.com/wallpants)
     * absolute src remains unchanged:
     * <img src="https://avatars.githubusercontent.com/wallpants" />
     */
    relativeImageUrlPrefix: "",

    /**
     * Whether to render <details> html tags with attribute open=""
     *
     * @default
     * false
     */
    detailsTagDefaultOpen: false,
  },
};

const pantsdown = new Pantsdown(config);
const html = pantsdown.parse(markdown);

console.log(html);
```

## 🤝 Acknowledgements

<a href="https://marked.js.org">
  <img width="60px" height="60px" src="https://marked.js.org/img/logo-black.svg" align="right" />
</a>

Pantsdown is based on [Marked](https://github.com/markedjs/marked). Without their hard work,
Pantsdown would not exist.
