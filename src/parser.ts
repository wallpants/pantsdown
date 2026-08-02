import { type Pantsdown } from "./pantsdown.ts";
import { Renderer } from "./renderer.ts";
import { TextRenderer } from "./text-renderer.ts";
import { type Token, type Tokens } from "./types.ts";

/**
 * Parsing & Compiling
 */
export class Parser {
   renderer: Renderer;
   textRenderer: TextRenderer;

   constructor(pantsdown: Pantsdown) {
      this.renderer = new Renderer(pantsdown);
      this.renderer.parser = this;
      this.textRenderer = new TextRenderer();
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
               out += this.renderer.space(token);
               continue;
            }
            case "hr": {
               out += this.renderer.hr(token);
               continue;
            }
            case "heading": {
               out += this.renderer.heading(token);
               continue;
            }
            case "code": {
               out += this.renderer.code(token);
               continue;
            }
            case "table": {
               out += this.renderer.table(token);
               continue;
            }
            case "alert": {
               out += this.renderer.alert(token);
               continue;
            }
            case "blockquote": {
               out += this.renderer.blockquote(token);
               continue;
            }
            case "list": {
               out += this.renderer.list(token);
               continue;
            }
            case "checkbox": {
               out += this.renderer.checkbox(token);
               continue;
            }
            case "html": {
               out += this.renderer.html(token);
               continue;
            }
            case "footnotes": {
               out += this.renderer.footnotes(token);
               continue;
            }
            case "paragraph": {
               out += this.renderer.paragraph(token);
               continue;
            }
            case "text": {
               let textToken: Tokens["Text"] = token;
               let body = this.renderer.text(textToken);
               while (i + 1 < tokens.length && tokens[i + 1]?.type === "text") {
                  textToken = tokens[++i] as Tokens["Text"];
                  body += "\n" + this.renderer.text(textToken);
               }
               if (top) {
                  out += this.renderer.paragraph({
                     type: "paragraph",
                     raw: body,
                     text: body,
                     tokens: [{ type: "text", raw: body, text: body, escaped: true }],
                     sourceMap: textToken.sourceMap,
                  });
               } else {
                  out += body;
               }
               continue;
            }
            case "latexBlock": {
               out += this.renderer.latexBlock(token);
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
   parseInline(tokens: Token[], renderer: Renderer | TextRenderer = this.renderer): string {
      let out = "";

      for (let i = 0, len = tokens.length; i < len; i++) {
         const token = tokens[i]!;

         switch (token.type) {
            case "escape": {
               out += renderer.text(token);
               break;
            }
            case "html": {
               out += renderer.html(token);
               break;
            }
            case "link": {
               out += renderer.link(token);
               break;
            }
            case "image": {
               out += renderer.image(token);
               break;
            }
            case "checkbox": {
               out += renderer.checkbox(token);
               break;
            }
            case "strong": {
               out += renderer.strong(token);
               break;
            }
            case "em": {
               out += renderer.em(token);
               break;
            }
            case "footnoteRef": {
               out += renderer.footnoteRef(token);
               break;
            }
            case "codespan": {
               out += renderer.codespan(token);
               break;
            }
            case "br": {
               out += renderer.br(token);
               break;
            }
            case "del": {
               out += renderer.del(token);
               break;
            }
            case "text": {
               out += renderer.text(token);
               break;
            }
            case "latexInline": {
               out += renderer.latexInline(token);
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
