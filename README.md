<!-- Up to marked@9.1.2 -->

# Pantsdown

Pantsdown is a **Markdown** to **"GitHub HTML"** converter based on [Marked](https://github.com/markedjs/marked).
Basically this is a non customizable version of Marked, optimized to render markdown similar to how GitHub does it plus
some features developed specifically for [github-preview.nvim](https://github.com/wallpants/github-preview.nvim).

Applicable fixes/updates released by Marked will eventually be applied to Pantsdown.

If you need a feature that's supported by GitHub and is not already listed in Pantsdown's [Roadmap](#roadmap),
feel free to open an issue. If you need anything else, use Marked or another library.

## Installation

🚨 Pantsdown is distributed only as a TypeScript module. This means you'll need a bundler to handle transpilation.
See below for usage examples.

```sh
bun install pantsdown
```

## Usage

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
        const markdown = "# Hello world\n- [ ] item 1\n- [ ] item 2";
        const html = pantsdown.parse(markdown);
        const container = document.getElementById("markdown-container");
        if (container) container.innerHTML = html;
    }, []);

    // 🚨 for styles to be applied, a parent element must contain
    // the classes "pantsdown light" or "pantsdown dark"
    return <div id="markdown-container" className="pantsdown light" />;
}

export default App;
```

## Configuration

The Pantsdown constructor accepts an optional configuration object:

```typescript
import { PantsdownConfig } from "pantsdown";

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
    },
};

const pantsdown = new Pantsdown(config);
pantsdown.parse(markdown);
```

## Roadmap

-   [x] Add id & anchors to headings
-   [ ] Add button to copy code in fences
-   [ ] [Mermaid](https://mermaid.js.org/) support
-   [ ] [Footnote](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax#footnotes) support [Base](https://github.com/bent10/marked-extensions/tree/main/packages/footnote)
