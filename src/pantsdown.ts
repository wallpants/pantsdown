import GithubSlugger from "github-slugger";
import { javascript } from "./javascript.ts";
import { Lexer } from "./lexer.ts";
import { Parser } from "./parser.ts";
import { type PantsdownConfig, type PartialPantsdownConfig } from "./types.ts";

const defaultConfig: PantsdownConfig = {
    renderer: {
        relativeImageUrlPrefix: "",
        detailsTagDefaultOpen: false,
    },
};

export class Pantsdown {
    private lexer: Lexer;
    private parser: Parser;
    config: PantsdownConfig = defaultConfig;

    constructor(config?: PartialPantsdownConfig) {
        if (config) this.setConfig(config);
        this.lexer = new Lexer();
        this.parser = new Parser(this);
    }

    /**
     * Update config
     * The object you provide will be deeply merged into current config.
     */
    setConfig(config: PartialPantsdownConfig) {
        this.config = {
            renderer: {
                ...this.config.renderer,
                ...config.renderer,
            },
        };
    }

    /**
     * Parse markdown string
     */
    parse(src: string): { html: string; javascript: string } {
        // re-init slugger to avoid slug count from incorrectly incrementing
        // from previosly slugged headings
        this.parser.renderer.slugger = new GithubSlugger();

        const tokens = this.lexer.lex(src);
        const html = this.parser.parse(tokens);
        return {
            html,
            javascript,
        };
    }
}
