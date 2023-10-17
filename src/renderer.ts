import GithubSlugger from "github-slugger";
import hljs from "highlight.js";
import { type PantsdownConfig, type SourceMap } from "./types.ts";
import {
    cleanUrl,
    escape,
    fixHtmlLocalImageHref,
    fixLocalImageHref,
    getHtmlElementText,
    injectHtmlAttributes,
    renderHtmlClasses,
    renderSourceMap,
} from "./utils.ts";

const defaultConfig: NonNullable<PantsdownConfig["renderer"]> = {
    relativeImageUrlPrefix: "",
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

        const language = lang && hljs.getLanguage(lang) ? lang : "plaintext";
        const highlightedCode = hljs.highlight(code, { language }).value;

        return (
            `<pre${renderSourceMap(sourceMap)}><code class="hljs language-` +
            escape(language) +
            '">' +
            highlightedCode +
            "</code></pre>\n"
        );
    }

    blockquote(quote: string, sourceMap: SourceMap): string {
        return `<blockquote${renderSourceMap(sourceMap)}>\n${quote}</blockquote>\n`;
    }

    html(html: string, _block: boolean, sourceMap?: SourceMap | undefined): string {
        let result = fixHtmlLocalImageHref(html, this.rendererConfig.relativeImageUrlPrefix);
        if (sourceMap) {
            result = injectHtmlAttributes(result, [
                ["line-start", sourceMap[0]],
                ["line-end", sourceMap[1]],
            ]);
        }
        return result;
    }

    heading(text: string, level: number, sourceMap: SourceMap): string {
        const elementText = getHtmlElementText(text);
        const slug = this.slugger.slug(elementText);
        let result = `<h${level}${renderSourceMap(sourceMap)} style="position: relative;">`;
        // span with negative top to add some offset when scrolling to #slug
        result += `<span style="position: absolute; top: -50px;" id="${slug}"></span>`;
        result += `${text}<a class="anchor octicon-link" href="#${slug}"></a>`;
        result += `</h${level}>\n`;
        return result;
    }

    hr(sourceMap: SourceMap): string {
        return `<hr${renderSourceMap(sourceMap)}>\n`;
    }

    list(
        body: string,
        ordered: boolean,
        start: number | "",
        sourceMap: SourceMap,
        classes: string[] = [],
    ): string {
        const type = ordered ? "ol" : "ul";
        const startatt = ordered && start !== 1 ? ' start="' + start + '"' : "";
        return (
            "<" +
            type +
            startatt +
            `${renderSourceMap(sourceMap)}${renderHtmlClasses(classes)}>\n` +
            body +
            "</" +
            type +
            ">\n"
        );
    }

    listitem(text: string, task: boolean, _checked: boolean): string {
        const classes: string[] = [];
        if (task) classes.push("task-list-item");
        return `<li${renderHtmlClasses(classes)}>${text}</li>\n`;
    }

    checkbox(checked: boolean, classes: string[] = []): string {
        return (
            "<input " +
            (checked ? 'checked="" ' : "") +
            `disabled="" type="checkbox"${renderHtmlClasses(classes)}>`
        );
    }

    paragraph(text: string, sourceMap: SourceMap): string {
        return `<p${renderSourceMap(sourceMap)}>${text}</p>\n`;
    }

    table(header: string, body: string): string {
        if (body) body = `<tbody>${body}</tbody>`;
        return "<table>\n" + "<thead>\n" + header + "</thead>\n" + body + "</table>\n";
    }

    tablerow(content: string, sourceMapStart: number | undefined): string {
        return `<tr${renderSourceMap(
            sourceMapStart ? [sourceMapStart, sourceMapStart] : undefined,
        )}>\n${content}</tr>\n`;
    }

    tablecell(
        content: string,
        flags: {
            header: boolean;
            align: "center" | "left" | "right" | null;
        },
    ): string {
        const type = flags.header ? "th" : "td";
        const tag = flags.align ? `<${type} align="${flags.align}">` : `<${type}>`;
        return tag + content + `</${type}>\n`;
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
        href = cleanHref;
        let out = '<a href="' + href + '"';
        if (title) {
            out += ' title="' + title + '"';
        }
        out += ">" + text + "</a>";
        return out;
    }

    image(href: string, title: string | null, text: string): string {
        const cleanHref = cleanUrl(href);
        if (cleanHref === null) {
            return text;
        }
        href = fixLocalImageHref(cleanHref, this.rendererConfig.relativeImageUrlPrefix);

        let out = `<img src="${href}" alt="${text}"`;

        if (title) {
            out += ` title="${title}"`;
        }
        out += ">";
        return out;
    }

    text(text: string): string {
        return text;
    }
}
