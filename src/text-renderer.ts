import type { Parser } from "./parser.ts";
import { type Tokens } from "./types.ts";

/**
 * TextRenderer
 * returns only the textual part of the token
 */
export class TextRenderer {
   parser!: Parser;
   // no need for block level renderers
   strong({ tokens }: Tokens["Strong"]): string {
      return this.parser.parseInline(tokens, this);
   }

   em({ tokens }: Tokens["Em"]): string {
      return this.parser.parseInline(tokens, this);
   }

   codespan({ text }: Tokens["Codespan"]): string {
      return text;
   }

   del({ tokens }: Tokens["Del"]): string {
      return this.parser.parseInline(tokens, this);
   }

   html({ text }: Tokens["HTML"] | Tokens["Tag"]): string {
      return text;
   }

   text({ text }: Tokens["Text"] | Tokens["Escape"] | Tokens["Tag"]): string {
      return text;
   }

   link({ tokens }: Tokens["Link"]): string {
      return this.parser.parseInline(tokens, this);
   }

   image({ tokens }: Tokens["Image"]): string {
      return this.parser.parseInline(tokens, this);
   }

   br(_token: Tokens["Br"]): string {
      return "\n";
   }

   checkbox({ raw }: Tokens["Checkbox"]): string {
      return raw;
   }

   // Pantsdown extras (no upstream counterpart)
   footnoteRef({ label }: Tokens["FootnoteRef"]): string {
      return label;
   }

   latexInline({ text }: Tokens["LatexInline"]): string {
      return text;
   }
}
