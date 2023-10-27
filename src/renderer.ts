import GithubSlugger from "github-slugger";
import hljs from "highlight.js";
import { inline } from "./rules/inline.ts";
import { type HTMLAttrs, type PantsdownConfig, type SourceMap } from "./types.ts";
import {
    cleanUrl,
    escape,
    fixHtmlLocalImageHref,
    fixLocalImageHref,
    getHtmlElementText,
    injectHtmlAttributes,
} from "./utils.ts";

const defaultConfig: NonNullable<PantsdownConfig["renderer"]> = {
    relativeImageUrlPrefix: "",
    detailsTagDefaultOpen: false,
};

/**
 * An object containing functions to render tokens to HTML.
 */
export class Renderer {
    private rendererConfig: NonNullable<PantsdownConfig["renderer"]>;
    slugger = new GithubSlugger();

    constructor(config: PantsdownConfig | undefined) {
        const rendererConfig = Object.assign(defaultConfig, config?.renderer ?? {});
        this.rendererConfig = rendererConfig;
    }

    code(code: string, infostring: string | undefined, sourceMap: SourceMap): string {
        const lang = (infostring ?? "").match(/^\S*/)?.[0];
        code = code.replace(/\n$/, "") + "\n";

        if (lang === "mermaid") {
            return injectHtmlAttributes(
                `<section><div class="mermaid">${code}</div></section>`,
                [["class", "mermaid-container"]],
                sourceMap,
            );
        }

        const language = lang && hljs.getLanguage(lang) ? lang : "plaintext";
        const highlightedCode = hljs.highlight(code, { language }).value;

        const result =
            `<pre><code class="hljs language-` +
            escape(language) +
            '">' +
            highlightedCode +
            "</code></pre>\n";

        return injectHtmlAttributes(result, [], sourceMap);
    }

    blockquote(quote: string): string {
        return `<blockquote>\n${quote}</blockquote>\n`;
    }

    html(html: string, _block: boolean, sourceMap?: SourceMap | undefined): string {
        const result = fixHtmlLocalImageHref(html, this.rendererConfig.relativeImageUrlPrefix);

        const attrs: HTMLAttrs = [];

        if (this.rendererConfig.detailsTagDefaultOpen) {
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
            ["src", fixLocalImageHref(cleanHref, this.rendererConfig.relativeImageUrlPrefix)],
            ["alt", text],
        ];
        if (title) attrs.push(["title", title]);
        return injectHtmlAttributes("<img>", attrs);
    }

    text(text: string): string {
        return text;
    }
}
