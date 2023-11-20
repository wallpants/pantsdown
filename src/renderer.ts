import GithubSlugger from "github-slugger";
import hljs from "highlight.js";
import { type Pantsdown } from "./pantsdown.ts";
import { inline } from "./rules/inline.ts";
import { type HTMLAttrs, type SourceMap, type Tokens } from "./types.ts";
import {
    cleanUrl,
    escape,
    fixHtmlLocalImageHref,
    fixLocalImageHref,
    getHtmlElementText,
    injectHtmlAttributes,
} from "./utils.ts";

/**
 * An object containing functions to render tokens to HTML.
 */
export class Renderer {
    private pantsdown: Pantsdown;
    slugger = new GithubSlugger();

    constructor(pantsdown: Pantsdown) {
        this.pantsdown = pantsdown;
    }

    code(code: string, infostring: string | undefined, sourceMap: SourceMap): string {
        const lang = (infostring ?? "").match(/^\S*/)?.[0];
        code = code.replace(/\n$/, "") + "\n";

        const attrs: HTMLAttrs = [];

        if (lang === "mermaid") {
            attrs.push(["class", "mermaid-container mermaid"]);
        } else {
            const language = lang && hljs.getLanguage(lang) ? lang : "plaintext";
            code = hljs.highlight(code, { language }).value;
            code = `<code class="hljs language-${escape(language)}">${code}</code>`;
        }

        const result = `<pre style="position: relative;">` + code + `</pre>`;
        return injectHtmlAttributes(result, attrs, sourceMap);
    }

    alert(body: string, token: Tokens["Alert"]): string {
        const result = `<div><span>${token.icon + token.variant}</span>${body}</div>\n`;
        return injectHtmlAttributes(result, [
            ["class", `markdown-alert markdown-alert-${token.variant.toLowerCase()}`],
        ]);
    }

    blockquote(quote: string): string {
        return `<blockquote>\n${quote}</blockquote>\n`;
    }

    html(html: string, _block: boolean, sourceMap?: SourceMap | undefined): string {
        const result = fixHtmlLocalImageHref(
            html,
            this.pantsdown.config.renderer.relativeImageUrlPrefix,
        );

        const attrs: HTMLAttrs = [];

        if (this.pantsdown.config.renderer.detailsTagDefaultOpen) {
            const tag = inline.tag.exec(html);
            if (tag?.[0] === "<details>") {
                attrs.push(["open", ""]);
            }
        }

        return injectHtmlAttributes(result, attrs, sourceMap);
    }

    heading(text: string, level: number, sourceMap: SourceMap): string {
        const elementText = getHtmlElementText(text);
        const slug = this.slugger.slug(elementText);
        let result = `<h${level}>`;
        // span with negative top to add some offset when scrolling to #slug
        result += `<span style="position: absolute; top: -50px;" id="${slug}"></span>`;
        result += `${text}<a class="anchor octicon-link" href="#${slug}"></a>`;
        result += `</h${level}>\n`;
        return injectHtmlAttributes(result, [["style", "position: relative;"]], sourceMap);
    }

    hr(sourceMap: SourceMap): string {
        return injectHtmlAttributes(`<hr>\n`, [], sourceMap);
    }

    list(body: string, ordered: boolean, start: number | "", classes: string[] = []): string {
        const type = ordered ? "ol" : "ul";
        const attrs: HTMLAttrs = [["class", classes.join(" ")]];
        if (ordered && start && start !== 1) {
            attrs.push(["start", String(start)]);
        }
        const result = `<${type}>\n${body}</${type}>\n`;
        return injectHtmlAttributes(result, attrs);
    }

    listitem(text: string, task: boolean, _checked: boolean, sourceMap: SourceMap): string {
        const attrs: [string, string][] = [];
        if (task) attrs.push(["class", "task-list-item"]);
        const result = `<li>${text}</li>\n`;
        return injectHtmlAttributes(result, attrs, sourceMap);
    }

    checkbox(checked: boolean, classes: string[] = []): string {
        const result = "<input>";
        const attrs: HTMLAttrs = [
            ["disabled", ""],
            ["type", "checkbox"],
            ["class", classes.join(" ")],
        ];
        if (checked) attrs.push(["checked", ""]);
        return injectHtmlAttributes(result, attrs);
    }

    paragraph(text: string, sourceMap: SourceMap): string {
        const result = `<p>${text}</p>\n`;
        return injectHtmlAttributes(result, [], sourceMap);
    }

    table(header: string, body: string): string {
        if (body) body = `<tbody>${body}</tbody>`;
        return "<table>\n" + "<thead>\n" + header + "</thead>\n" + body + "</table>\n";
    }

    tablerow(content: string, sourceMapStart: number | undefined): string {
        const sourceMap: SourceMap = sourceMapStart ? [sourceMapStart, sourceMapStart] : undefined;
        return injectHtmlAttributes(`<tr>\n${content}</tr>\n`, [], sourceMap);
    }

    tablecell(
        content: string,
        flags: {
            header: boolean;
            align: "center" | "left" | "right" | null;
        },
    ): string {
        const type = flags.header ? "th" : "td";
        const attrs: HTMLAttrs = [];
        if (flags.align) attrs.push(["align", flags.align]);
        const result = `<${type}>` + content + `</${type}>\n`;
        return injectHtmlAttributes(result, attrs);
    }

    /**
     * span level renderer
     */
    strong(text: string): string {
        return `<strong>${text}</strong>`;
    }

    em(text: string): string {
        return `<em>${text}</em>`;
    }

    codespan(text: string): string {
        return `<code>${text}</code>`;
    }

    br(): string {
        return "<br>";
    }

    del(text: string): string {
        return `<del>${text}</del>`;
    }

    link(href: string, title: string | null | undefined, text: string): string {
        const cleanHref = cleanUrl(href);
        if (cleanHref === null) {
            return text;
        }
        const attrs: HTMLAttrs = [["href", cleanHref]];
        if (title) attrs.push(["title", title]);
        return injectHtmlAttributes(`<a>${text}</a>`, attrs);
    }

    image(href: string, title: string | null, text: string): string {
        const cleanHref = cleanUrl(href);
        if (cleanHref === null) {
            return text;
        }
        const attrs: HTMLAttrs = [
            [
                "src",
                fixLocalImageHref(cleanHref, this.pantsdown.config.renderer.relativeImageUrlPrefix),
            ],
            ["alt", text],
        ];
        if (title) attrs.push(["title", title]);
        return injectHtmlAttributes("<img>", attrs);
    }

    footnoteRef(token: Tokens["FootnoteRef"]) {
        const encodedLabel = encodeURIComponent(token.label);

        return `<sup><a id="footnote-ref-${encodedLabel}" href="#${
            "footnote-" + encodedLabel
        }" data-footnote-ref aria-describedby="footnote-label">${token.label}</a></sup>`;
    }

    footnotes(token: Tokens["Footnotes"], body: string) {
        if (!token.items.length) return "";

        let footnotesHTML = '<section class="footnotes" data-footnotes>\n';
        footnotesHTML += `<ol>\n${body}\n</ol>\n`;
        footnotesHTML += "</section>\n";

        return footnotesHTML;
    }

    text(text: string): string {
        return text;
    }
}
