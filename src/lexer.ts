import { inline } from "./rules/inline.ts";
import { other } from "./rules/other.ts";
import { Tokenizer } from "./tokenizer.ts";
import { type Links, type SourceMap, type Token, type Tokens } from "./types.ts";

export class Lexer {
   private tokenizer: Tokenizer;
   inlineQueue: { src: string; tokens: Token[] }[];
   private links: Links = {};

   tokens: Token[] = [];
   footnoteTokens: Tokens["Footnote"][] = [];
   line = 1;
   state = {
      inLink: false,
      inRawBlock: false,
      top: true,
   };

   constructor() {
      this.tokenizer = new Tokenizer(this);
      this.inlineQueue = [];
   }

   /**
    * Preprocessing
    */
   lex(src: string) {
      // reset values from previous parse
      this.tokenizer.pendingHtmlClose = [];
      this.footnoteTokens = [];
      this.tokens = [];
      this.links = {};
      this.line = 1;
      this.state = {
         inLink: false,
         inRawBlock: false,
         top: true,
      };

      src = src.replace(other.carriageReturn, "\n");

      this.blockTokens(src, this.tokens);

      for (const next of this.inlineQueue) {
         this.inlineTokens(next.src, next.tokens);
      }
      this.inlineQueue = [];

      const footnotesToken: Tokens["Footnotes"] = {
         type: "footnotes",
         raw: "",
         items: this.footnoteTokens,
      };

      this.tokens.push(footnotesToken);

      return this.tokens;
   }

   getSourceMap(rawToken: string): SourceMap | undefined {
      if (!this.state.top) return;
      const tokenLines = rawToken.split("\n");
      const sourceMap: SourceMap = [this.line, (this.line += tokenLines.length - 1)];

      while (tokenLines[tokenLines.length - 1] === "") {
         // token.raw sometimes includes newline chars at the end of the string
         // which we don't want to include in the sourceMap
         tokenLines.pop();
         sourceMap[1]--;
      }

      return sourceMap;
   }

   /**
    * Lexing
    */
   blockTokens(src: string, tokens: Token[], lastParagraphClipped = false): Token[] {
      let token: Token | undefined;
      let lastToken: Token | undefined;
      let cutSrc;

      let srcLength = Infinity;
      while (src) {
         if (src.length < srcLength) {
            srcLength = src.length;
         } else {
            this.infiniteLoopError(src.charCodeAt(0));
         }

         // newline
         if ((token = this.tokenizer.space(src))) {
            src = src.substring(token.raw.length);
            if (token.raw.length === 1 && tokens.length > 0) {
               // if there's a single \n as a spacer, it's terminating the last line,
               // so move it there so that we don't get unecessary paragraph tags
               const last = tokens[tokens.length - 1];
               if (last) last.raw += "\n";
            } else {
               tokens.push(token);
            }
            continue;
         }

         // code
         if ((token = this.tokenizer.code(src))) {
            src = src.substring(token.raw.length);
            lastToken = tokens[tokens.length - 1];
            // An indented code block cannot interrupt a paragraph.
            if (lastToken && (lastToken.type === "paragraph" || lastToken.type === "text")) {
               lastToken.raw += (lastToken.raw.endsWith("\n") ? "" : "\n") + token.raw;
               lastToken.text += "\n" + token.text;
               const lastInline = this.inlineQueue[this.inlineQueue.length - 1];
               if (lastInline) lastInline.src = lastToken.text;
            } else {
               tokens.push(token);
            }
            continue;
         }

         // latexBlock
         if ((token = this.tokenizer.latexBlock(src))) {
            src = src.substring(token.raw.length);
            tokens.push(token);
            continue;
         }

         // fences
         if ((token = this.tokenizer.fences(src))) {
            src = src.substring(token.raw.length);
            tokens.push(token);
            continue;
         }

         // footnote
         if ((token = this.tokenizer.footnote(src))) {
            src = src.substring(token.raw.length);
            this.footnoteTokens.push(token);
            continue;
         }

         // heading
         if ((token = this.tokenizer.heading(src))) {
            src = src.substring(token.raw.length);
            tokens.push(token);
            continue;
         }

         // hr
         if ((token = this.tokenizer.hr(src))) {
            src = src.substring(token.raw.length);
            tokens.push(token);
            continue;
         }

         // blockquote
         if ((token = this.tokenizer.blockquote(src))) {
            src = src.substring(token.raw.length);
            tokens.push(token);
            continue;
         }

         // list
         if ((token = this.tokenizer.list(src))) {
            src = src.substring(token.raw.length);
            tokens.push(token);
            continue;
         }

         // html
         if ((token = this.tokenizer.html(src))) {
            src = src.substring(token.raw.length);
            tokens.push(token);
            continue;
         }

         // def
         if ((token = this.tokenizer.def(src))) {
            src = src.substring(token.raw.length);
            lastToken = tokens[tokens.length - 1];
            if (lastToken && (lastToken.type === "paragraph" || lastToken.type === "text")) {
               lastToken.raw += (lastToken.raw.endsWith("\n") ? "" : "\n") + token.raw;
               lastToken.text += "\n" + token.raw;
               const lastInline = this.inlineQueue[this.inlineQueue.length - 1];
               if (lastInline) lastInline.src = lastToken.text;
            } else {
               this.links[token.tag] ??= {
                  href: token.href,
                  title: token.title,
               };
            }
            continue;
         }

         // table (gfm)
         if ((token = this.tokenizer.table(src))) {
            src = src.substring(token.raw.length);
            tokens.push(token);
            continue;
         }

         // lheading
         if ((token = this.tokenizer.lheading(src))) {
            src = src.substring(token.raw.length);
            tokens.push(token);
            continue;
         }

         // top-level paragraph
         // prevent paragraph consuming extensions by clipping 'src' to extension start
         cutSrc = src;
         if (this.state.top && (token = this.tokenizer.paragraph(cutSrc))) {
            lastToken = tokens[tokens.length - 1];
            if (lastParagraphClipped && lastToken?.type === "paragraph") {
               lastToken.raw += (lastToken.raw.endsWith("\n") ? "" : "\n") + token.raw;
               lastToken.text += "\n" + token.text;
               this.inlineQueue.pop();
               const lastInline = this.inlineQueue[this.inlineQueue.length - 1];
               if (lastInline) lastInline.src = lastToken.text;
            } else {
               tokens.push(token);
            }
            lastParagraphClipped = cutSrc.length !== src.length;
            src = src.substring(token.raw.length);
            continue;
         }

         // text
         if ((token = this.tokenizer.text(src))) {
            src = src.substring(token.raw.length);
            lastToken = tokens[tokens.length - 1];
            if (lastToken?.type === "text") {
               lastToken.raw += (lastToken.raw.endsWith("\n") ? "" : "\n") + token.raw;
               lastToken.text += "\n" + token.text;
               this.inlineQueue.pop();
               const lastInline = this.inlineQueue[this.inlineQueue.length - 1];
               if (lastInline) lastInline.src = lastToken.text;
            } else {
               tokens.push(token);
            }
            continue;
         }

         if (src) {
            this.infiniteLoopError(src.charCodeAt(0));
         }
      }

      this.state.top = true;
      return tokens;
   }

   inline(src: string, tokens: Token[] = []) {
      this.inlineQueue.push({ src, tokens });
      return tokens;
   }

   /**
    * Lexing/Compiling
    */
   inlineTokens(src: string, tokens: Token[] = []): Token[] {
      let token, lastToken, cutSrc;

      // String with links masked to avoid interference with em and strong
      let maskedSrc = src;
      let keepPrevChar, prevChar;

      // Mask out reflinks
      const links = Object.keys(this.links);
      if (links.length > 0) {
         maskedSrc = maskedSrc.replace(inline.reflinkSearch, (match0) =>
            links.includes(match0.slice(match0.lastIndexOf("[") + 1, -1))
               ? "[" + "a".repeat(match0.length - 2) + "]"
               : match0,
         );
      }
      // Mask out escaped characters
      maskedSrc = maskedSrc.replace(inline.anyPunctuation, "++");

      // Mask out other blocks
      maskedSrc = maskedSrc.replace(
         inline.blockSkip,
         (match0) => "[" + "a".repeat(match0.length - 2) + "]",
      );

      let srcLength = Infinity;
      while (src) {
         if (src.length < srcLength) {
            srcLength = src.length;
         } else {
            this.infiniteLoopError(src.charCodeAt(0));
         }

         if (!keepPrevChar) {
            prevChar = "";
         }
         keepPrevChar = false;

         // latexInline (before escape to handle \(...\) syntax)
         if ((token = this.tokenizer.latexInline(src))) {
            src = src.substring(token.raw.length);
            tokens.push(token);
            continue;
         }

         // escape
         if ((token = this.tokenizer.escape(src))) {
            src = src.substring(token.raw.length);
            tokens.push(token);
            continue;
         }

         // tag
         if ((token = this.tokenizer.tag(src))) {
            src = src.substring(token.raw.length);
            tokens.push(token);
            continue;
         }

         // footnoteRef
         if ((token = this.tokenizer.footnoteRef(src))) {
            src = src.substring(token.raw.length);
            tokens.push(token);
            continue;
         }

         // link
         if ((token = this.tokenizer.link(src))) {
            src = src.substring(token.raw.length);
            tokens.push(token);
            continue;
         }

         // reflink, nolink
         if ((token = this.tokenizer.reflink(src, this.links))) {
            src = src.substring(token.raw.length);
            lastToken = tokens[tokens.length - 1];
            if (lastToken && token.type === "text" && lastToken.type === "text") {
               lastToken.raw += token.raw;
               lastToken.text += token.text;
            } else {
               tokens.push(token);
            }
            continue;
         }

         // em & strong
         if ((token = this.tokenizer.emStrong(src, maskedSrc, prevChar))) {
            src = src.substring(token.raw.length);
            tokens.push(token);
            continue;
         }

         // code
         if ((token = this.tokenizer.codespan(src))) {
            src = src.substring(token.raw.length);
            tokens.push(token);
            continue;
         }

         // br
         if ((token = this.tokenizer.br(src))) {
            src = src.substring(token.raw.length);
            tokens.push(token);
            continue;
         }

         // del (gfm)
         if ((token = this.tokenizer.del(src, maskedSrc, prevChar))) {
            src = src.substring(token.raw.length);
            tokens.push(token);
            continue;
         }

         // autolink
         if ((token = this.tokenizer.autolink(src))) {
            src = src.substring(token.raw.length);
            tokens.push(token);
            continue;
         }

         // url (gfm)
         if (!this.state.inLink && (token = this.tokenizer.url(src))) {
            src = src.substring(token.raw.length);
            tokens.push(token);
            continue;
         }

         // text
         // prevent inlineText consuming extensions by clipping 'src' to extension start
         cutSrc = src;
         if ((token = this.tokenizer.inlineText(cutSrc))) {
            src = src.substring(token.raw.length);
            if (!token.raw.endsWith("_")) {
               // Track prevChar before string of ____ started
               prevChar = token.raw.slice(-1);
            }
            keepPrevChar = true;
            lastToken = tokens[tokens.length - 1];
            if (lastToken?.type === "text") {
               lastToken.raw += token.raw;
               lastToken.text += token.text;
            } else {
               tokens.push(token);
            }
            continue;
         }

         if (src) {
            this.infiniteLoopError(src.charCodeAt(0));
         }
      }

      return tokens;
   }

   private infiniteLoopError(byte: number): never {
      throw new Error("Infinite loop on byte: " + String(byte));
   }
}
