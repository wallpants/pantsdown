import type { Lexer } from "./lexer.ts";
import { block } from "./rules/block.ts";
import { inline } from "./rules/inline.ts";
import { other } from "./rules/other.ts";
import { type Links, type Token, type Tokens } from "./types.ts";
import {
   ALERTS,
   expandTabs,
   findClosingBracket,
   indentCodeCompensation,
   outputLink,
   rtrim,
   splitCells,
   trimTrailingBlankLines,
} from "./utils.ts";

/**
 * The tokenizer defines how to turn markdown text into tokens.
 */
export class Tokenizer {
   private lexer: Lexer;
   pendingHtmlClose: [tag: string, index: number][] = [];

   constructor(lexer: Lexer) {
      this.lexer = lexer;
   }

   space(src: string): Tokens["Space"] | undefined {
      const cap = block.newline.exec(src);
      if (cap && cap[0].length > 0) {
         // call getSourceMap to increment "this.lexer.line"
         this.lexer.getSourceMap(cap[0]);
         return {
            type: "space",
            raw: cap[0],
         };
      }
      return;
   }

   code(src: string): Tokens["Code"] | undefined {
      const cap = block.code.exec(src);
      if (!cap) return undefined;

      const raw = trimTrailingBlankLines(cap[0]);
      const text = raw.replace(other.codeRemoveIndent, "");
      return {
         type: "code",
         raw,
         codeBlockStyle: "indented",
         text,
         sourceMap: this.lexer.getSourceMap(raw),
      };
   }

   fences(src: string): Tokens["Code"] | undefined {
      const cap = block.fences.exec(src);
      if (!cap) return undefined;

      const raw = cap[0];
      const text = indentCodeCompensation(raw, cap[3] ?? "");

      return {
         type: "code",
         raw,
         lang: cap[2] ? cap[2].trim().replace(inline.anyPunctuation, "$1") : cap[2],
         text,
         sourceMap: this.lexer.getSourceMap(raw),
      };
   }

   heading(src: string): Tokens["Heading"] | undefined {
      const cap = block.heading.exec(src);
      if (!cap) return undefined;
      let text = cap[2]!.trim();

      // remove trailing #s
      if (text.endsWith("#")) {
         const trimmed = rtrim(text, "#");
         if (!trimmed || trimmed.endsWith(" ")) {
            // CommonMark requires space before trailing #s
            text = trimmed.trim();
         }
      }

      const raw = rtrim(cap[0], "\n");
      return {
         type: "heading",
         raw,
         depth: cap[1]!.length,
         text,
         tokens: this.lexer.inline(text),
         sourceMap: this.lexer.getSourceMap(raw),
      };
   }

   hr(src: string): Tokens["Hr"] | undefined {
      const cap = block.hr.exec(src);
      if (!cap) return undefined;

      const raw = rtrim(cap[0], "\n");
      return {
         type: "hr",
         raw,
         sourceMap: this.lexer.getSourceMap(raw),
      };
   }

   blockquote(src: string): Tokens["Blockquote"] | Tokens["Alert"] | undefined {
      const cap = block.blockquote.exec(src);
      if (!cap) return undefined;

      let lines = rtrim(cap[0], "\n").split("\n");
      let raw = "";
      let text = "";
      const tokens: Token[] = [];
      // the accumulated `raw` can end up with garbled *content* at continuation-merge
      // boundaries (upstream does the same), but its length and newline count always
      // match the consumed source — which is all the lexer and sourcemaps rely on
      const startLine = this.lexer.line;

      while (lines.length > 0) {
         let inBlockquote = false;
         const currentLines = [];

         let i;
         for (i = 0; i < lines.length; i++) {
            // get lines up to a continuation
            if (other.blockquoteStart.test(lines[i]!)) {
               currentLines.push(lines[i]!);
               inBlockquote = true;
            } else if (!inBlockquote) {
               currentLines.push(lines[i]!);
            } else {
               break;
            }
         }
         lines = lines.slice(i);

         const currentRaw = currentLines.join("\n");
         const currentText = currentRaw
            // precede setext continuation with 4 spaces so it isn't a setext
            .replace(other.blockquoteSetextReplace, "\n    $1")
            .replace(other.blockquoteSetextReplace2, "");
         // this round starts right after the lines already accumulated in `raw`
         this.lexer.line = startLine + (raw ? raw.split("\n").length : 0);
         raw = raw ? `${raw}\n${currentRaw}` : currentRaw;
         text = text ? `${text}\n${currentText}` : currentText;

         // parse blockquote lines as top level tokens
         // merge paragraphs if this is a continuation
         const top = this.lexer.state.top;
         this.lexer.state.top = true;
         this.lexer.blockTokens(currentText, tokens, true);
         this.lexer.state.top = top;

         // if there is no continuation then we are done
         if (lines.length === 0) {
            break;
         }

         const lastToken = tokens[tokens.length - 1];

         if (lastToken?.type === "code") {
            // blockquote continuation cannot be preceded by a code block
            break;
         } else if (lastToken?.type === "blockquote") {
            // include continuation in nested blockquote
            const oldToken = lastToken;
            const newText = oldToken.raw + "\n" + lines.join("\n");
            // re-lexing the nested blockquote restarts at its first source line
            this.lexer.line = startLine + raw.split("\n").length - oldToken.raw.split("\n").length;
            const newToken = this.blockquote(newText)!;
            tokens[tokens.length - 1] = newToken;

            raw = raw.substring(0, raw.length - oldToken.raw.length) + newToken.raw;
            text = text.substring(0, text.length - oldToken.text.length) + newToken.text;
            break;
         } else if (lastToken?.type === "list") {
            // include continuation in nested list
            const oldToken = lastToken;
            const newText = oldToken.raw + "\n" + lines.join("\n");
            // re-lexing the nested list restarts at its first source line
            this.lexer.line = startLine + raw.split("\n").length - oldToken.raw.split("\n").length;
            const newToken = this.list(newText)!;
            tokens[tokens.length - 1] = newToken;

            raw = raw.substring(0, raw.length - lastToken.raw.length) + newToken.raw;
            text = text.substring(0, text.length - oldToken.raw.length) + newToken.raw;
            lines = newText.substring(tokens[tokens.length - 1]!.raw.length).split("\n");
            continue;
         }
      }

      // leave the counter on the blockquote's last line; `raw` has no trailing
      // newline, so the pending line terminator is counted by the next space token
      this.lexer.line = startLine + raw.split("\n").length - 1;

      const blockquoteToken: Tokens["Blockquote"] = {
         type: "blockquote",
         raw,
         tokens,
         text,
      };

      const matchedAlertVariant = ALERTS.find(({ regex }) => regex.test(blockquoteToken.text));

      if (matchedAlertVariant) {
         const { variant, icon, regex } = matchedAlertVariant;

         const firstToken = blockquoteToken.tokens[0] as Tokens["Paragraph"];

         text = firstToken.raw.replace(regex, "");

         // since we're modifying firstToken.raw by removing the first line,
         // resulting tokens also change and thus also the sourceMap that
         // was generated for the blockquote
         if (firstToken.sourceMap?.[0]) firstToken.sourceMap[0]++;

         firstToken.tokens = this.lexer.inlineTokens(text, []);

         const alertToken: Tokens["Alert"] = {
            ...blockquoteToken,
            type: "alert",
            variant: variant as Tokens["Alert"]["variant"],
            icon,
         };

         return alertToken;
      }

      return blockquoteToken;
   }

   list(src: string): Tokens["List"] | undefined {
      let cap = block.list.exec(src);
      if (!cap) return undefined;

      let bull = cap[1]!.trim();
      const isordered = bull.length > 1;

      const list: Tokens["List"] = {
         type: "list",
         raw: "",
         ordered: isordered,
         start: isordered ? +bull.slice(0, -1) : "",
         loose: false,
         items: [] as Tokens["ListItem"][],
      };

      bull = isordered ? `\\d{1,9}\\${bull.slice(-1)}` : `\\${bull}`;

      // Get next list item
      const itemRegex = other.listItemRegex(bull);
      let endsWithBlankLine = false;
      // Check if current bullet point can start a new List Item
      while (src) {
         let endEarly = false;
         let raw = "";
         let itemContents = "";
         if (!(cap = itemRegex.exec(src))) {
            break;
         }

         if (block.hr.test(src)) {
            // End list if bullet was actually HR (possibly move into itemRegex?)
            break;
         }

         raw = cap[0];
         src = src.substring(raw.length);

         let line = expandTabs(cap[2]!.split("\n", 1)[0]!, cap[1]!.length);
         let nextLine = src.split("\n", 1)[0] ?? "";

         let blankLine = !line.trim();

         let indent = 0;
         if (blankLine) {
            indent = cap[1]!.length + 1;
         } else {
            indent = line.search(other.nonSpaceChar); // Find first non-space char
            indent = indent > 4 ? 1 : indent; // Treat indented code blocks (> 4 spaces) as having only 1 indent
            itemContents = line.slice(indent);
            indent += cap[1]!.length;
         }

         if (blankLine && other.blankLine.test(nextLine)) {
            // Items begin with at most one blank line
            raw += nextLine + "\n";
            src = src.substring(nextLine.length + 1);
            endEarly = true;
         }

         if (!endEarly) {
            const nextBulletRegex = other.nextBulletRegex(indent);
            const hrRegex = other.hrRegex(indent);
            const fencesBeginRegex = other.fencesBeginRegex(indent);
            const headingBeginRegex = other.headingBeginRegex(indent);
            const htmlBeginRegex = other.htmlBeginRegex(indent);
            const blockquoteBeginRegex = other.blockquoteBeginRegex(indent);

            // Check if following lines should be included in List Item
            while (src) {
               const rawLine = src.split("\n", 1)[0] ?? "";
               nextLine = rawLine;
               const nextLineWithoutTabs = nextLine.replace(other.tabCharGlobal, "    ");

               // End list item if found code fences
               if (fencesBeginRegex.test(nextLine)) {
                  break;
               }

               // End list item if found start of new heading
               if (headingBeginRegex.test(nextLine)) {
                  break;
               }

               // End list item if found start of html block
               if (htmlBeginRegex.test(nextLine)) {
                  break;
               }

               // End list item if found start of blockquote
               if (blockquoteBeginRegex.test(nextLine)) {
                  break;
               }

               // End list item if found start of new bullet
               if (nextBulletRegex.test(nextLine)) {
                  break;
               }

               // Horizontal rule found
               if (hrRegex.test(nextLine)) {
                  break;
               }

               if (nextLineWithoutTabs.search(other.nonSpaceChar) >= indent || !nextLine.trim()) {
                  // Dedent if possible
                  itemContents += "\n" + nextLineWithoutTabs.slice(indent);
               } else {
                  // not enough indentation
                  if (blankLine) {
                     break;
                  }

                  // paragraph continuation unless last line was a different block level element
                  if (line.replace(other.tabCharGlobal, "    ").search(other.nonSpaceChar) >= 4) {
                     // indented code block
                     break;
                  }
                  if (fencesBeginRegex.test(line)) {
                     break;
                  }
                  if (headingBeginRegex.test(line)) {
                     break;
                  }
                  if (hrRegex.test(line)) {
                     break;
                  }

                  itemContents += "\n" + nextLine;
               }

               // Check if current line is blank
               blankLine = !nextLine.trim();

               raw += rawLine + "\n";
               src = src.substring(rawLine.length + 1);
               line = nextLineWithoutTabs.slice(indent);
            }
         }

         if (!list.loose) {
            // If the previous item ended with a blank line, the list is loose
            if (endsWithBlankLine) {
               list.loose = true;
            } else if (other.doubleBlankLine.test(raw)) {
               endsWithBlankLine = true;
            }
         }

         list.items.push({
            type: "list_item",
            raw,
            task: other.listIsTask.test(itemContents),
            loose: false,
            text: itemContents,
            tokens: [],
            sourceMap: this.lexer.getSourceMap(raw),
         });

         list.raw += raw;
      }

      const lastItem = list.items[list.items.length - 1];
      if (!lastItem) {
         // not a list since there were no items
         return undefined;
      }

      // Do not consume newlines at end of final item. Alternatively, make itemRegex *start* with any newlines to simplify/speed up endsWithBlankLine logic
      const lastTrimmed = lastItem.raw.trimEnd();

      if (lastItem.sourceMap) {
         // give back the trimmed trailing newlines; the counter tracks lines, not chars
         this.lexer.line -= (lastItem.raw.slice(lastTrimmed.length).match(/\n/g) ?? []).length;
      }

      lastItem.raw = lastTrimmed;
      lastItem.text = lastItem.text.trimEnd();
      list.raw = list.raw.trimEnd();

      // Item child tokens handled here at end because we needed to have the final item to trim it first
      // save/restore top: blockTokens resets it to true on exit, and a nested list
      // lexed with a stale top=true would advance the sourcemap line counter
      const top = this.lexer.state.top;
      for (const item of list.items) {
         this.lexer.state.top = false;
         item.tokens = this.lexer.blockTokens(item.text, []);

         const itemToken = item.tokens[0];
         if (item.task && (itemToken?.type === "text" || itemToken?.type === "paragraph")) {
            // Remove checkbox markdown from item tokens
            item.text = item.text.replace(other.listReplaceTask, "");
            itemToken.raw = itemToken.raw.replace(other.listReplaceTask, "");
            itemToken.text = itemToken.text.replace(other.listReplaceTask, "");
            for (let i = this.lexer.inlineQueue.length - 1; i >= 0; i--) {
               if (other.listIsTask.test(this.lexer.inlineQueue[i]!.src)) {
                  this.lexer.inlineQueue[i]!.src = this.lexer.inlineQueue[i]!.src.replace(
                     other.listReplaceTask,
                     "",
                  );
                  break;
               }
            }

            const taskRaw = other.listTaskCheckbox.exec(item.raw);
            if (taskRaw) {
               const checkboxToken: Tokens["Checkbox"] = {
                  type: "checkbox",
                  raw: taskRaw[0] + " ",
                  checked: taskRaw[0] !== "[ ]",
               };
               item.checked = checkboxToken.checked;
               const firstToken = item.tokens[0];
               if (list.loose) {
                  if (
                     firstToken &&
                     (firstToken.type === "paragraph" || firstToken.type === "text") &&
                     "tokens" in firstToken
                  ) {
                     firstToken.raw = checkboxToken.raw + firstToken.raw;
                     firstToken.text = checkboxToken.raw + firstToken.text;
                     firstToken.tokens.unshift(checkboxToken);
                  } else {
                     item.tokens.unshift({
                        type: "paragraph",
                        raw: checkboxToken.raw,
                        text: checkboxToken.raw,
                        tokens: [checkboxToken],
                        sourceMap: undefined,
                     });
                  }
               } else {
                  item.tokens.unshift(checkboxToken);
               }
            }
         } else if (item.task) {
            item.task = false;
         }

         if (!list.loose) {
            // Check if list should be loose
            const spacers = item.tokens.filter((t) => t.type === "space");
            const hasMultipleLineBreaks =
               spacers.length > 0 && spacers.some((t) => other.anyLine.test(t.raw));

            list.loose = hasMultipleLineBreaks;
         }
      }
      this.lexer.state.top = top;

      // Set all items to loose if list is loose
      if (list.loose) {
         for (const item of list.items) {
            item.loose = true;
            for (const token of item.tokens) {
               if (token.type === "text") {
                  (token as unknown as Tokens["Paragraph"]).type = "paragraph";
               }
            }
         }
      }

      return list;
   }

   footnote(src: string): Tokens["Footnote"] | undefined {
      const cap = block.footnote.exec(src);
      if (!cap) return undefined;

      const label = cap[1] ?? "";
      let text = cap[2] ? rtrim(cap[2].replace(/^ *[ \t]?/gm, ""), "\n") : "";

      text += `<a href="#footnote-ref-${encodeURIComponent(
         label,
      )}" data-footnote-backref aria-label="Back to reference ${label}"> ↩</a>`;

      this.lexer.state.top = false;
      const tokens = this.lexer.blockTokens(text, []);

      const token: Tokens["Footnote"] = {
         type: "footnote",
         raw: cap[0],
         text: text,
         label: label,
         content: tokens,
         sourceMap: this.lexer.getSourceMap(cap[0]),
      };

      return token;
   }

   html(src: string): Tokens["HTML"] | undefined {
      const cap = block.html.exec(src);
      if (!cap) return undefined;

      const raw = trimTrailingBlankLines(cap[0]);
      const token: Tokens["HTML"] = {
         type: "html",
         block: true,
         raw,
         pre: cap[1] === "pre" || cap[1] === "script" || cap[1] === "style",
         text: raw,
         sourceMap: this.lexer.getSourceMap(raw),
      };

      /*
       * Sometimes an html token does not contain its closing tag.
       *
       * The following markdown:
       *
       * 130  <details>
       * 131    <summary><h4>Hello World</h4></summary>
       * 132
       * 133    Here some non-html markdown
       * 134  </details>
       *
       * would result in 3 tokens:
       * [
       *   {
       *     type: "html",
       *     raw: "<details>↵  <summary><h4>PUT</h4></summary>↵↵",
       *     sourceMap: [130, 131]
       *   },
       *   {
       *     type: "paragraph",
       *     raw: "Here some non-html markdown",
       *     sourceMap: [133, 133]
       *   },
       *   {
       *     type: "html",
       *     raw: "</details>",
       *   }
       * ]
       *
       * sourceMap metadata in first token will be incorrect, because it will
       * not take its children into consideration when it should.
       *
       * To solve that we keep track of html tokens that are pending to be closed
       * and update their sourceMap once they're closed.
       */

      const capEndsWith = (str?: string) => str && cap[0].trimEnd().endsWith(str);

      const tag = inline.tag.exec(src);
      const isHtmlClosed = capEndsWith(tag?.[0].slice(1));

      if (tag?.[0] && !isHtmlClosed) {
         // index where the token we just created will be inserted
         const tokenIdx = this.lexer.tokens.length;
         // first in last out
         this.pendingHtmlClose.unshift([tag[0], tokenIdx]);
      } else if (this.pendingHtmlClose.length) {
         for (const [pendingTag, index] of this.pendingHtmlClose) {
            if (capEndsWith(pendingTag.slice(1))) {
               const updateToken = this.lexer.tokens[index] as Tokens["HTML"];
               if (updateToken.sourceMap?.[1] && token.sourceMap?.[1]) {
                  updateToken.sourceMap[1] = token.sourceMap[1];
               }
               this.pendingHtmlClose.shift();
            }
         }
      }

      return token;
   }

   def(src: string): Tokens["Def"] | undefined {
      const cap = block.def.exec(src);
      if (!cap) return undefined;

      const tag = cap[1]!.toLowerCase().replace(other.multipleSpaceGlobal, " ");
      const href = cap[2]
         ? cap[2].replace(other.hrefBrackets, "$1").replace(inline.anyPunctuation, "$1")
         : "";
      const title = cap[3]
         ? cap[3].substring(1, cap[3].length - 1).replace(inline.anyPunctuation, "$1")
         : "";
      const raw = rtrim(cap[0], "\n");
      return {
         type: "def",
         tag,
         raw,
         href,
         title,
         sourceMap: this.lexer.getSourceMap(raw),
      };
   }

   table(src: string): Tokens["Table"] | undefined {
      const cap = block.table.exec(src);
      if (!cap?.[2]) return;

      if (!other.tableDelimiter.test(cap[2])) {
         // delimiter row must have a pipe (|) or colon (:) otherwise it is a setext heading
         return;
      }

      const headers = splitCells(cap[1]!);
      const aligns = cap[2].replace(other.tableAlignChars, "").split("|");
      const rows = cap[3]?.trim() ? cap[3].replace(other.tableRowBlankLine, "").split("\n") : [];

      if (headers.length !== aligns.length) return;

      const item: Tokens["Table"] = {
         type: "table",
         raw: rtrim(cap[0], "\n"),
         header: [],
         align: [],
         rows: [],
         sourceMap: this.lexer.getSourceMap(rtrim(cap[0], "\n")),
      };

      for (const align of aligns) {
         if (other.tableAlignRight.test(align)) {
            item.align.push("right");
         } else if (other.tableAlignCenter.test(align)) {
            item.align.push("center");
         } else if (other.tableAlignLeft.test(align)) {
            item.align.push("left");
         } else {
            item.align.push(null);
         }
      }

      for (let i = 0, len = headers.length; i < len; i++) {
         item.header.push({
            type: "tablecell",
            raw: headers[i]!,
            text: headers[i]!,
            tokens: this.lexer.inline(headers[i]!),
            header: true,
            align: item.align[i]!,
         });
      }

      for (const row of rows) {
         item.rows.push(
            splitCells(row, headers.length).map((cell, i) => ({
               type: "tablecell" as const,
               raw: cell,
               text: cell,
               tokens: this.lexer.inline(cell),
               header: false,
               align: item.align[i]!,
            })),
         );
      }

      return item;
   }

   lheading(src: string): Tokens["Heading"] | undefined {
      const cap = block.lheading.exec(src);
      if (!cap) return undefined;

      const text = cap[1]!.trim();
      const raw = rtrim(cap[0], "\n");
      return {
         type: "heading",
         raw,
         depth: cap[2]!.startsWith("=") ? 1 : 2,
         text,
         tokens: this.lexer.inline(text),
         sourceMap: this.lexer.getSourceMap(raw),
      };
   }

   paragraph(src: string): Tokens["Paragraph"] | undefined {
      const cap = block.paragraph.exec(src);
      if (!cap) return undefined;

      const text = cap[1]!.endsWith("\n") ? cap[1]!.slice(0, -1) : cap[1]!;
      return {
         type: "paragraph",
         raw: cap[0],
         text,
         tokens: this.lexer.inline(text),
         sourceMap: this.lexer.getSourceMap(cap[0]),
      };
   }

   text(src: string): Tokens["Text"] | undefined {
      const cap = block.text.exec(src);
      if (!cap) return undefined;

      return {
         type: "text",
         raw: cap[0],
         text: cap[0],
         tokens: this.lexer.inline(cap[0]),
         sourceMap: this.lexer.getSourceMap(cap[0]),
      };
   }

   escape(src: string): Tokens["Escape"] | undefined {
      const cap = inline.escape.exec(src);
      if (!cap) return undefined;

      return {
         type: "escape",
         raw: cap[0],
         text: cap[1]!,
      };
   }

   tag(src: string): Tokens["Tag"] | undefined {
      const cap = inline.tag.exec(src);
      if (!cap) return undefined;

      if (!this.lexer.state.inLink && other.startATag.test(cap[0])) {
         this.lexer.state.inLink = true;
      } else if (this.lexer.state.inLink && other.endATag.test(cap[0])) {
         this.lexer.state.inLink = false;
      }
      if (!this.lexer.state.inRawBlock && other.startPreScriptTag.test(cap[0])) {
         this.lexer.state.inRawBlock = true;
      } else if (this.lexer.state.inRawBlock && other.endPreScriptTag.test(cap[0])) {
         this.lexer.state.inRawBlock = false;
      }

      return {
         type: "html",
         raw: cap[0],
         inLink: this.lexer.state.inLink,
         inRawBlock: this.lexer.state.inRawBlock,
         block: false,
         text: cap[0],
      };
   }

   link(src: string): Tokens["Link"] | Tokens["Image"] | undefined {
      const cap = inline.link.exec(src);
      if (!cap) return undefined;

      const trimmedUrl = cap[2]!.trim();
      if (trimmedUrl.startsWith("<")) {
         // commonmark requires matching angle brackets
         if (!trimmedUrl.endsWith(">")) {
            return;
         }

         // ending angle bracket cannot be escaped
         const rtrimSlash = rtrim(trimmedUrl.slice(0, -1), "\\");
         if ((trimmedUrl.length - rtrimSlash.length) % 2 === 0) {
            return;
         }
      } else {
         // find closing parenthesis
         const lastParenIndex = findClosingBracket(cap[2]!, "()");
         if (lastParenIndex === -2) {
            // more open parens than closed
            return;
         }
         if (lastParenIndex > -1) {
            const start = cap[0].startsWith("!") ? 5 : 4;
            const linkLen = start + cap[1]!.length + lastParenIndex;
            cap[2] = cap[2]!.substring(0, lastParenIndex);
            cap[0] = cap[0].substring(0, linkLen).trim();
            cap[3] = "";
         }
      }
      let href = cap[2]!;
      let title = "";
      title = cap[3] ? cap[3].slice(1, -1) : "";

      href = href.trim();
      if (href.startsWith("<")) {
         href = href.slice(1, -1);
      }
      return outputLink(
         cap,
         {
            href: href ? href.replace(inline.anyPunctuation, "$1") : href,
            title: title ? title.replace(inline.anyPunctuation, "$1") : title,
         },
         cap[0],
         this.lexer,
      );
   }

   reflink(
      src: string,
      links: Links,
   ): Tokens["Link"] | Tokens["Image"] | Tokens["Text"] | undefined {
      let cap;
      if ((cap = inline.reflink.exec(src)) ?? (cap = inline.nolink.exec(src))) {
         const linkStr = (cap[2] ?? cap[1])!.replace(/\s+/g, " ");
         const link = links[linkStr.toLowerCase()];
         if (!link) {
            const text = cap[0].charAt(0);
            return {
               type: "text",
               raw: text,
               text,
            };
         }
         return outputLink(cap, link, cap[0], this.lexer);
      }
      return undefined;
   }

   emStrong(
      src: string,
      maskedSrc: string,
      prevChar = "",
   ): Tokens["Em"] | Tokens["Strong"] | undefined {
      let match = inline.emStrong.lDelim.exec(src);
      if (!match) return;
      if (!match[1] && !match[2] && !match[3] && !match[4]) return;

      // _ can't be between two alphanumerics. \p{L}\p{N} includes non-english alphabet/numbers as well
      if (match[4] && other.unicodeAlphaNumeric.exec(prevChar)) return;

      const nextChar = match[1] || match[3] || "";

      if (!nextChar || !prevChar || inline.punctuation.exec(prevChar)) {
         // unicode Regex counts emoji as 1 char; convert to array for proper count (used multiple times below)
         const lLength = Array.from(match[0]).length - 1;
         let rDelim,
            rLength,
            delimTotal = lLength,
            midDelimTotal = 0;

         const endReg = match[0].startsWith("*")
            ? inline.emStrong.rDelimAst
            : inline.emStrong.rDelimUnd;
         endReg.lastIndex = 0;

         // Clip maskedSrc to same section of string as src (move to lexer?)
         maskedSrc = maskedSrc.slice(-1 * src.length + lLength);

         while ((match = endReg.exec(maskedSrc)) != null) {
            rDelim = match[1] || match[2] || match[3] || match[4] || match[5] || match[6];

            if (!rDelim) continue; // skip single * in __abc*abc__

            rLength = Array.from(rDelim).length;

            if (match[3] || match[4]) {
               // found another Left Delim
               delimTotal += rLength;
               continue;
            } else if (match[5] || match[6]) {
               // either Left or Right Delim
               if (lLength % 3 && !((lLength + rLength) % 3)) {
                  midDelimTotal += rLength;
                  continue; // CommonMark Emphasis Rules 9-10
               }
            }

            delimTotal -= rLength;

            if (delimTotal > 0) continue; // Haven't found enough closing delimiters

            // Remove extra characters. *a*** -> *a*
            rLength = Math.min(rLength, rLength + delimTotal + midDelimTotal);
            // char length can be >1 for unicode characters;
            const lastCharLength = Array.from(match[0])[0]!.length;
            const raw = src.slice(0, lLength + match.index + lastCharLength + rLength);

            // Create `em` if smallest delimiter has odd char count. *a***
            if (Math.min(lLength, rLength) % 2) {
               const text = raw.slice(1, -1);
               return {
                  type: "em",
                  raw,
                  text,
                  tokens: this.lexer.inlineTokens(text),
               };
            }

            // Create 'strong' if smallest delimiter has even char count. **a***
            const text = raw.slice(2, -2);
            return {
               type: "strong",
               raw,
               text,
               tokens: this.lexer.inlineTokens(text),
            };
         }
      }

      return undefined;
   }

   footnoteRef(src: string): Tokens["FootnoteRef"] | undefined {
      const cap = inline.footnoteRef.exec(src);
      if (!cap) return undefined;

      return {
         type: "footnoteRef",
         raw: cap[0],
         label: cap[1] ?? "",
      };
   }

   codespan(src: string): Tokens["Codespan"] | undefined {
      const cap = inline.code.exec(src);
      if (!cap) return undefined;

      let text = cap[2]!.replace(other.newLineCharGlobal, " ");
      const hasNonSpaceChars = other.nonSpaceChar.test(text);
      const hasSpaceCharsOnBothEnds = text.startsWith(" ") && text.endsWith(" ");
      if (hasNonSpaceChars && hasSpaceCharsOnBothEnds) {
         text = text.substring(1, text.length - 1);
      }
      return {
         type: "codespan",
         raw: cap[0],
         text,
      };
   }

   br(src: string): Tokens["Br"] | undefined {
      const cap = inline.br.exec(src);
      if (!cap) return undefined;

      return {
         type: "br",
         raw: cap[0],
      };
   }

   del(src: string, maskedSrc: string, prevChar = ""): Tokens["Del"] | undefined {
      let match = inline.delLDelim.exec(src);
      if (!match) return;

      const nextChar = match[1] || "";

      if (!nextChar || !prevChar || inline.punctuation.exec(prevChar)) {
         // unicode Regex counts emoji as 1 char; spread into array for proper count
         const lLength = Array.from(match[0]).length - 1;
         let rDelim,
            rLength,
            delimTotal = lLength;

         const endReg = inline.delRDelim;
         endReg.lastIndex = 0;

         // Clip maskedSrc to same section of string as src
         maskedSrc = maskedSrc.slice(-1 * src.length + lLength);

         while ((match = endReg.exec(maskedSrc)) !== null) {
            rDelim = match[1] || match[2] || match[3] || match[4] || match[5] || match[6];

            if (!rDelim) continue;

            rLength = Array.from(rDelim).length;

            if (rLength !== lLength) continue;

            if (match[3] || match[4]) {
               // found another Left Delim
               delimTotal += rLength;
               continue;
            }

            delimTotal -= rLength;

            if (delimTotal > 0) continue; // Haven't found enough closing delimiters

            // Remove extra characters
            rLength = Math.min(rLength, rLength + delimTotal);
            // char length can be >1 for unicode characters
            const lastCharLength = Array.from(match[0])[0]!.length;
            const raw = src.slice(0, lLength + match.index + lastCharLength + rLength);

            // Create del token - only single ~ or double ~~ supported
            const text = raw.slice(lLength, -lLength);
            return {
               type: "del",
               raw,
               text,
               tokens: this.lexer.inlineTokens(text),
            };
         }
      }

      return undefined;
   }

   autolink(src: string): Tokens["Link"] | undefined {
      const cap = inline.autolink.exec(src);
      if (!cap) return undefined;

      let text, href;
      if (cap[2] === "@") {
         text = cap[1]!;
         href = "mailto:" + text;
      } else {
         text = cap[1]!;
         href = text;
      }

      return {
         type: "link",
         title: null,
         raw: cap[0],
         text,
         href,
         tokens: [
            {
               type: "text",
               raw: text,
               text,
            },
         ],
      };
   }

   url(src: string): Tokens["Link"] | undefined {
      let cap;
      if ((cap = inline.url.exec(src))) {
         let text, href;
         if (cap[2] === "@") {
            text = cap[0];
            href = "mailto:" + text;
         } else {
            // do extended autolink path validation
            let prevCapZero;
            do {
               prevCapZero = cap[0];
               cap[0] = inline.backpedal.exec(cap[0])![0];
            } while (prevCapZero !== cap[0]);
            text = cap[0];
            if (cap[1] === "www.") {
               href = "http://" + cap[0];
            } else {
               href = cap[0];
            }
         }
         return {
            type: "link",
            title: null,
            raw: cap[0],
            text,
            href,
            tokens: [
               {
                  type: "text",
                  raw: text,
                  text,
               },
            ],
         };
      }
      return undefined;
   }

   inlineText(src: string): Tokens["Text"] | undefined {
      const cap = inline.text.exec(src);
      if (!cap) return undefined;

      return {
         type: "text",
         raw: cap[0],
         text: cap[0],
         escaped: this.lexer.state.inRawBlock,
      };
   }

   latexBlock(src: string): Tokens["LatexBlock"] | undefined {
      const cap = block.latexBlock.exec(src);
      if (!cap) return undefined;

      // cap[1] is from $$...$$ syntax, cap[2] is from \[...\] syntax
      const text = cap[1] ?? cap[2] ?? "";

      return {
         type: "latexBlock",
         raw: cap[0],
         text: text.trim(),
         sourceMap: this.lexer.getSourceMap(cap[0]),
      };
   }

   latexInline(src: string): Tokens["LatexInline"] | undefined {
      const cap = inline.latexInline.exec(src);
      if (!cap) return undefined;

      // cap[1] is from $...$ syntax, cap[2] is from \(...\) syntax
      const text = cap[1] ?? cap[2] ?? "";

      return {
         type: "latexInline",
         raw: cap[0],
         text,
      };
   }
}
