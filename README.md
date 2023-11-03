<!-- Up to marked@9.1.3 -->

# Pantsdown

<img src="https://raw.githubusercontent.com/wallpants/pantsdown/main/docs/github.svg" height="60px" align="right" />
<img src="https://raw.githubusercontent.com/wallpants/pantsdown/main/docs/markdown.svg" height="60px" align="right" />

Pantsdown is a **Markdown** to **HTML** converter. It attempts to render markdown similar to how GitHub does it plus
some features developed specifically for [github-preview.nvim](https://github.com/wallpants/github-preview.nvim).

If you need a feature that's supported by GitHub and is not already listed in the [Roadmap](#roadmap),
feel free to open an issue.

### ▶️ [Demo](https://wallpants.github.io/pantsdown/)

## 📦 Installation

🚨 Pantsdown is distributed only as a TypeScript module. This means you'll need a bundler to handle transpilation.
See below for usage examples.

```sh
# bun
bun install pantsdown
# npm
npm install pantsdown
```

## 💻 Usage

### Styles

For styles to be properly applied, either the element containing the generated html or one of its parents
must have the classes `class="pantsdown light"` or `class="pantsdown dark"` added.

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
        const markdown = "# Hello world\n- [ ] Task 1\n- [x] Task 2";
        const html = pantsdown.parse(markdown);
        const container = document.getElementById("markdown-container");
        if (container) container.innerHTML = html;
    }, []);

    // ⚠️ for styles to be applied, a parent element must have
    // the classes "pantsdown light" or "pantsdown dark" added
    return <div id="markdown-container" className="pantsdown light" />;
}

export default App;
```

## ⚙️ Configuration

The Pantsdown constructor accepts an optional configuration object:

```typescript
import { Pantsdown, PantsdownConfig } from "pantsdown";

const config: PantsdownConfig = {
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
        relativeImageUrlPrefix: "/__localimage__/",

        /**
         * Whether to render <details> html tags with attribute open=""
         *
         * @default
         * false
         */
        detailsTagDefaultOpen: true,
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

Pantsdown is based on [Marked](https://github.com/markedjs/marked).
Without their hard work, Pantsdown would not exist.

## 🚀 Roadmap

-   [ ] fix footnotes regex, docs/features.md not rendered properly
-   [ ] check if copy code button works with current vite docs
-   [ ] showcase more in demo | list features
-   [ ] [Alerts](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax#alerts)
-   [ ] [Mermaid](https://mermaid.js.org/) usage docs.
