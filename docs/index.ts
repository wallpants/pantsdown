import { Pantsdown } from "../src/pantsdown";

const pantsdown = new Pantsdown();
const element = document.getElementById("markdown-container");

async function main() {
    const res = await fetch("https://raw.githubusercontent.com/wallpants/pantsdown/main/README.md");
    const markdown = await res.text();
    if (element) element.innerHTML = pantsdown.parse(markdown);
}

// eslint-disable-next-line
main().catch(() => {});
