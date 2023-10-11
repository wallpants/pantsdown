import { Lexer } from "./lexer.ts";
import { Parser } from "./parser.ts";
import { type RendererProps } from "./types.ts";

export class Pantsdown {
    private lexer: Lexer;
    private parser: Parser;

    constructor({ renderer }: { renderer: RendererProps }) {
        this.lexer = new Lexer();
        this.parser = new Parser({ renderer });
    }

    parse(src: string): string {
        const tokens = this.lexer.lex(src);
        const html = this.parser.parse(tokens);
        return html;
    }
}
