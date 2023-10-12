import hljs from "highlight.js";
import { type RendererProps, type SourceMap } from "./types.ts";
import {
    cleanUrl,
    escape,
    fixHtmlLocalImageHref,
    fixLocalImageHref,
    injectHtmlAttributes,
    renderSourceMap,
} from "./utils.ts";

/**
 * An object containing functions to render tokens to HTML.
 */
export class Renderer {
    private props: RendererProps;

    constructor(props: RendererProps) {
        this.props = props;
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
        let result = fixHtmlLocalImageHref(html, this.props.localImageUrlPrefix);
        if (sourceMap) {
            result = injectHtmlAttributes(result, [
                ["line-start", sourceMap[0]],
                ["line-end", sourceMap[1]],
            ]);
        }
        return result;
    }

    heading(text: string, level: number, sourceMap: SourceMap): string {
        // ignore IDs
        return `<h${level}${renderSourceMap(sourceMap)}>${text}</h${level}>\n`;
    }

    hr(sourceMap: SourceMap): string {
        return `<hr${renderSourceMap(sourceMap)}>\n`;
    }

    list(body: string, ordered: boolean, start: number | "", sourceMap: SourceMap): string {
        const type = ordered ? "ol" : "ul";
        const startatt = ordered && start !== 1 ? ' start="' + start + '"' : "";
        return (
            "<" + type + startatt + `${renderSourceMap(sourceMap)}>\n` + body + "</" + type + ">\n"
        );
    }

    listitem(text: string, _task: boolean, _checked: boolean): string {
        return `<li>${text}</li>\n`;
    }

    checkbox(checked: boolean): string {
        return "<input " + (checked ? 'checked="" ' : "") + 'disabled="" type="checkbox">';
    }

    paragraph(text: string, sourceMap: SourceMap): string {
        return `<p${renderSourceMap(sourceMap)}>${text}</p>\n`;
    }

    table(header: string, body: string, sourceMap: SourceMap): string {
        if (body) body = `<tbody>${body}</tbody>`;

        return (
            `<table${renderSourceMap(sourceMap)}>\n` +
            "<thead>\n" +
            header +
            "</thead>\n" +
            body +
            "</table>\n"
        );
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
        href = fixLocalImageHref(cleanHref, this.props.localImageUrlPrefix);

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
