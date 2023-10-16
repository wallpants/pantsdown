import GithubSlugger from "github-slugger";
import { Lexer } from "./lexer.ts";
import { Parser } from "./parser.ts";
import { type PantsdownConfig } from "./types.ts";

export class Pantsdown {
    private lexer: Lexer;
    private parser: Parser;

    constructor(config?: PantsdownConfig) {
        this.lexer = new Lexer();
        this.parser = new Parser(config);
    }

    parse(src: string): string {
        // re-init slugger to avoid slug count from incorrectly incrementing
        // from previosly slugged headings
        this.parser.renderer.slugger = new GithubSlugger();

        const tokens = this.lexer.lex(src);
        const html = this.parser.parse(tokens);
        return html;
    }
}
