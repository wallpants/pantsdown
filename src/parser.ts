import { Renderer } from "./renderer.ts";
import { type RendererProps, type Token, type Tokens } from "./types.ts";

/**
 * Parsing & Compiling
 */
export class Parser {
    private renderer: Renderer;

    constructor({ renderer }: { renderer: RendererProps }) {
        this.renderer = new Renderer(renderer);
    }

    /**
     * Parse Loop
     */
    parse(tokens: Token[], top = true): string {
        let out = "";

        for (let i = 0, len = tokens.length; i < len; i++) {
            const token = tokens[i]!;

            switch (token.type) {
                case "space": {
                    continue;
                }
                case "hr": {
                    out += this.renderer.hr();
                    continue;
                }
                case "heading": {
                    out += this.renderer.heading(this.parseInline(token.tokens), token.depth);
                    continue;
                }
                case "code": {
                    out += this.renderer.code(token.text, token.lang);
                    continue;
                }
                case "table": {
                    let header = "";

                    // header
                    let cell = "";
                    for (let j = 0, len = token.header.length; j < len; j++) {
                        cell += this.renderer.tablecell(this.parseInline(token.header[j]!.tokens), {
                            header: true,
                            align: token.align[j]!,
                        });
                    }
                    header += this.renderer.tablerow(cell);

                    let body = "";
                    for (let j = 0, rowsLen = token.rows.length; j < rowsLen; j++) {
                        const row = token.rows[j]!;

                        cell = "";
                        for (let k = 0, rowLen = row.length; k < rowLen; k++) {
                            cell += this.renderer.tablecell(this.parseInline(row[k]!.tokens), {
                                header: false,
                                align: token.align[k]!,
                            });
                        }

                        body += this.renderer.tablerow(cell);
                    }
                    out += this.renderer.table(header, body);
                    continue;
                }
                case "blockquote": {
                    const body = this.parse(token.tokens);
                    out += this.renderer.blockquote(body);
                    continue;
                }
                case "list": {
                    const ordered = token.ordered;
                    const start = token.start;
                    const loose = token.loose;

                    let body = "";
                    for (let j = 0, itemsLen = token.items.length; j < itemsLen; j++) {
                        const item = token.items[j]!;
                        const checked = item.checked;
                        const task = item.task;

                        let itemBody = "";
                        if (item.task) {
                            const checkbox = this.renderer.checkbox(!!checked);
                            if (loose) {
                                if (
                                    item.tokens.length > 0 &&
                                    item.tokens[0]!.type === "paragraph"
                                ) {
                                    item.tokens[0]!.text = checkbox + " " + item.tokens[0]!.text;
                                    if (
                                        item.tokens[0]!.tokens.length > 0 &&
                                        item.tokens[0]!.tokens[0]!.type === "text"
                                    ) {
                                        item.tokens[0]!.tokens[0]!.text =
                                            checkbox + " " + item.tokens[0]!.tokens[0]!.text;
                                    }
                                } else {
                                    item.tokens.unshift({
                                        type: "text",
                                        text: checkbox + " ",
                                    } as Tokens["Text"]);
                                }
                            } else {
                                itemBody += checkbox + " ";
                            }
                        }

                        itemBody += this.parse(item.tokens, loose);
                        body += this.renderer.listitem(itemBody, task, !!checked);
                    }

                    out += this.renderer.list(body, ordered, start);
                    continue;
                }
                case "html": {
                    out += this.renderer.html(token.text, token.block);
                    continue;
                }
                case "paragraph": {
                    out += this.renderer.paragraph(this.parseInline(token.tokens));
                    continue;
                }
                case "text": {
                    let textToken = token as Tokens["Text"];
                    let body = textToken.tokens
                        ? this.parseInline(textToken.tokens)
                        : textToken.text;
                    while (i + 1 < tokens.length && tokens[i + 1]?.type === "text") {
                        textToken = tokens[++i] as Tokens["Text"];
                        body +=
                            "\n" +
                            (textToken.tokens
                                ? this.parseInline(textToken.tokens)
                                : textToken.text);
                    }
                    out += top ? this.renderer.paragraph(body) : body;
                    continue;
                }

                default: {
                    const errMsg = 'Token with "' + token.type + '" type was not found.';
                    throw new Error(errMsg);
                }
            }
        }

        return out;
    }

    /**
     * Parse Inline Tokens
     */
    parseInline(tokens: Token[]): string {
        let out = "";

        for (let i = 0, len = tokens.length; i < len; i++) {
            const token = tokens[i]!;

            switch (token.type) {
                case "escape": {
                    out += this.renderer.text(token.text);
                    break;
                }
                case "html": {
                    out += this.renderer.html(token.text);
                    break;
                }
                case "link": {
                    out += this.renderer.link(
                        token.href,
                        token.title,
                        this.parseInline(token.tokens),
                    );
                    break;
                }
                case "image": {
                    out += this.renderer.image(token.href, token.title, token.text);
                    break;
                }
                case "strong": {
                    out += this.renderer.strong(this.parseInline(token.tokens));
                    break;
                }
                case "em": {
                    out += this.renderer.em(this.parseInline(token.tokens));
                    break;
                }
                case "codespan": {
                    out += this.renderer.codespan(token.text);
                    break;
                }
                case "br": {
                    out += this.renderer.br();
                    break;
                }
                case "del": {
                    out += this.renderer.del(this.parseInline(token.tokens));
                    break;
                }
                case "text": {
                    out += this.renderer.text(token.text);
                    break;
                }
                default: {
                    const errMsg = 'Token with "' + token.type + '" type was not found.';
                    throw new Error(errMsg);
                }
            }
        }
        return out;
    }
}
