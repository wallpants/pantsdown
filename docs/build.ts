// "Pantsdown Demo" build script called by github action:
// https://github.com/wallpants/pantsdown/blob/main/.github/workflows/github-page.yaml

import { Pantsdown } from "../src";

const readmePath = import.meta.dir + "/../README.md";
const readme = await Bun.file(readmePath).text();

const cssPath = import.meta.dir + "/../src/css/styles.css";
const css = await Bun.file(cssPath).text();

const pantsdown = new Pantsdown();
const html = pantsdown.parse(readme);

const index = `<!doctype html>
<html lang="en" class="pantsdown dark">
    <head>
        <meta charset="utf-8" />
        <link href="wallpants-128.png" rel="icon" type="image/png" />
        <style>${css}</style>
        <title>Pantsdown</title>
    </head>
    <body>
        <div style="padding: 40px 40px 100px; width: 80%; min-width: 500px; max-width: 900px; margin: 0 auto;">
            <p style="background: #e3c0a6; color: #4d2609; padding: 20px; border-radius: 4px">
                This page was generated from
                <a
                    href="https://github.com/wallpants/pantsdown/blob/main/README.md"
                    target="_blank"
                    rel="noreferrer noopener"
                    >README.md</a
                >
                using Pantsdown.
                <br />
                <a
                    href="https://github.com/wallpants/pantsdown/blob/main/docs/build.ts"
                    target="_blank"
                    rel="noreferrer noopener"
                    >View source</a
                >
            </p>
            <div>${html}</div>
        </div>
    </body>
</html>`;

const indexPath = import.meta.dir + "/index.html";
await Bun.write(indexPath, index);
