import hljs from "highlight.js";
import { type RendererProps } from "./types.ts";
import { cleanUrl, escape, fixHtmlLocalImageHref, fixLocalImageHref } from "./utils.ts";

/**
 * An object containing functions to render tokens to HTML.
 */
export class Renderer {
    private props: RendererProps;

    constructor(props: RendererProps) {
        this.props = props;
    }

    code(code: string, infostring: string | undefined): string {
        const lang = (infostring ?? "").match(/^\S*/)?.[0];

        code = code.replace(/\n$/, "") + "\n";

        const language = lang && hljs.getLanguage(lang) ? lang : "plaintext";
        const highlightedCode = hljs.highlight(code, { language }).value;

        return (
            '<pre><code class="hljs language-' +
            escape(language) +
            '">' +
            highlightedCode +
            "</code></pre>\n"
        );
    }

    blockquote(quote: string): string {
        return `<blockquote>\n${quote}</blockquote>\n`;
    }

    html(html: string, _block?: boolean): string {
        return fixHtmlLocalImageHref(html, this.props.localImageUrlPrefix);
    }

    heading(text: string, level: number): string {
        // ignore IDs
        return `<h${level}>${text}</h${level}>\n`;
    }

    hr(): string {
        return "<hr>\n";
    }

    list(body: string, ordered: boolean, start: number | ""): string {
        const type = ordered ? "ol" : "ul";
        const startatt = ordered && start !== 1 ? ' start="' + start + '"' : "";
        return "<" + type + startatt + ">\n" + body + "</" + type + ">\n";
    }

    listitem(text: string, _task: boolean, _checked: boolean): string {
        return `<li>${text}</li>\n`;
    }

    checkbox(checked: boolean): string {
        return "<input " + (checked ? 'checked="" ' : "") + 'disabled="" type="checkbox">';
    }

    paragraph(text: string): string {
        return `<p>${text}</p>\n`;
    }

    table(header: string, body: string): string {
        if (body) body = `<tbody>${body}</tbody>`;

        return "<table>\n" + "<thead>\n" + header + "</thead>\n" + body + "</table>\n";
    }

    tablerow(content: string): string {
        return `<tr>\n${content}</tr>\n`;
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
