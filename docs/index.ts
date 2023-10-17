import { Pantsdown } from "../src/pantsdown";

const pantsdown = new Pantsdown();
const element = document.getElementById("markdown-container");

async function main() {
    // css cannot be loaded in an html script, because raw.githubusercontent.com
    // returns a mimetype of text/plain and the browser cries
    const cssRes = await fetch(
        "https://raw.githubusercontent.com/wallpants/pantsdown/main/src/css/styles.css",
    );
    const css = await cssRes.text();
    const styleElement = document.createElement("style");
    styleElement.textContent = css;
    document.head.appendChild(styleElement);

    const markdownRes = await fetch(
        "https://raw.githubusercontent.com/wallpants/pantsdown/main/README.md",
    );
    const markdown = await markdownRes.text();
    if (element) element.innerHTML = pantsdown.parse(markdown);
}

// eslint-disable-next-line
main().catch(() => {});
