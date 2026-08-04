import GithubSlugger from "github-slugger";
import { getJavascript } from "./javascript.ts";
import { Lexer } from "./lexer.ts";
import { Parser } from "./parser.ts";
import { type PantsdownConfig, type PartialPantsdownConfig } from "./types.ts";

const defaultConfig: PantsdownConfig = {
   renderer: {
      relativeImageUrlPrefix: "",
      absoluteImageUrlPrefix: undefined,
      detailsTagDefaultOpen: false,
      mermaid: {
         buttons: {
            zoom: true,
            reset: true,
            arrows: true,
            popover: true,
         },
         mouseActions: true,
      },
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
      const { mermaid, ...renderer } = config.renderer ?? {};
      this.config = {
         renderer: {
            ...this.config.renderer,
            ...renderer,
            mermaid: {
               ...this.config.renderer.mermaid,
               ...mermaid,
               buttons: {
                  ...this.config.renderer.mermaid.buttons,
                  ...mermaid?.buttons,
               },
            },
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
      this.parser.renderer.mermaidCounts = new Map();

      const tokens = this.lexer.lex(src);
      const html = this.parser.parse(tokens);
      return {
         html,
         javascript: getJavascript(this.config),
      };
   }
}
