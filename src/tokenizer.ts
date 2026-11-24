import type { Lexer } from "./lexer.ts";
import { block } from "./rules/block.ts";
import { inline } from "./rules/inline.ts";
import { other } from "./rules/other.ts";
import { type Links, type Token, type Tokens } from "./types.ts";
import {
   ALERTS,
   cachedLastPossibleDelCloserIndex,
   cachedLastPossibleEmStrongCloserIndex,
   decodeNumericCharacterReferences,
   expandBlockquoteTabs,
   expandTabs,
   findClosingBracket,
   indentCodeCompensation,
   isLabelEndInsideToken,
   normalizeLabel,
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
   pendingHtmlClose: { tag: string; token: Tokens["HTML"] }[] = [];

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
      let text = indentCodeCompensation(raw, cap[3] ?? "");
      // The fence pattern consumes the final content newline outside the capture.
      // Keep it when the captured content ends in a blank line.
      if (cap[3] !== undefined && (text === "" || text.endsWith("\n"))) {
         text += "\n";
      }

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
         if (!trimmed || other.endingSpaceTabChar.test(trimmed)) {
            // CommonMark requires a space or tab before trailing #s
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
      // Inside a list item or footnote the line counter is not tracking this
      // blockquote's lines (their children are lexed after the whole container
      // was consumed), so its children get no sourcemaps and the counter is
      // left alone.
      const mapped = this.lexer.state.top && !this.lexer.state.unmapped;
      const outerUnmapped = this.lexer.state.unmapped;
      const outerInBlockquote = this.lexer.state.inBlockquote;

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
         // expandBlockquoteTabs needs the marker's column, which is unknown inside a list item
         // or a block quote, where the outermost block quote has already expanded the markers
         const expandColumns =
            this.lexer.state.top && !this.lexer.state.inBlockquote && currentRaw.includes("\t");
         const currentText = (expandColumns ? expandBlockquoteTabs(currentLines) : currentRaw)
            // a tab right after the block quote marker runs to the next tab stop, and
            // the marker only consumes one space of it; the rest is content.
            // After a space the marker consumes it whole, so later tabs stay literal.
            .replace(other.blockquoteMarkerWhitespace, (_, marker: string, whitespace: string) => {
               // The optional space after ">" is marker; anything after that is
               // content (e.g. a tab that opens a fenced code line) and must not
               // be expanded. Tabs with no leading space are structural and are
               // expanded so indented code under the quote still works.
               if (whitespace.startsWith(" ")) {
                  return marker + " " + whitespace.slice(1);
               }
               return marker + expandTabs(whitespace, marker.length);
            })
            // precede setext continuation with 4 spaces so it isn't a setext
            .replace(other.blockquoteSetextReplace, "\n    $1")
            .replace(other.blockquoteSetextReplace2, "");
         // this round starts right after the lines already accumulated in `raw`
         if (mapped) this.lexer.line = startLine + (raw ? raw.split("\n").length : 0);
         raw = raw ? `${raw}\n${currentRaw}` : currentRaw;
         text = text ? `${text}\n${currentText}` : currentText;

         // parse blockquote lines as top level tokens
         // merge paragraphs if this is a continuation
         const top = this.lexer.state.top;
         this.lexer.state.top = true;
         this.lexer.state.inBlockquote = true;
         this.lexer.state.unmapped = !mapped;
         this.lexer.blockTokens(currentText, tokens, true);
         this.lexer.state.top = top;
         this.lexer.state.inBlockquote = outerInBlockquote;
         this.lexer.state.unmapped = outerUnmapped;

         // if there is no continuation then we are done
         if (lines.length === 0) {
            break;
         }

         const lastToken = tokens[tokens.length - 1];

         if (
            lastToken?.type === "code" ||
            lastToken?.type === "heading" ||
            lastToken?.type === "hr" ||
            lastToken?.type === "html" ||
            lastToken?.type === "table"
         ) {
            // blockquote continuation cannot be preceded by a code block, heading, hr, html block or table
            break;
         } else if (lastToken?.type === "blockquote") {
            // include continuation in nested blockquote
            const oldToken = lastToken;
            // The continuation lines belong to the same nesting frame as the
            // nested blockquote, which already had one '>' marker stripped, so
            // strip one marker from them too. Otherwise a restated marker after a
            // lazy line is re-parsed as a spurious deeper blockquote.
            const continuation = lines.join("\n");
            const newText =
               oldToken.raw + "\n" + continuation.replace(other.blockquoteSetextReplace2, "");
            // re-lexing the nested blockquote restarts at its first source line
            if (mapped)
               this.lexer.line =
                  startLine + raw.split("\n").length - oldToken.raw.split("\n").length;
            this.lexer.state.inBlockquote = true;
            const newToken = this.blockquote(newText)!;
            this.lexer.state.inBlockquote = outerInBlockquote;
            tokens[tokens.length - 1] = newToken;

            // Only include continuation lines the nested blockquote actually
            // consumed. Unconsumed trailing lines must stay out of `raw` so the
            // lexer can still tokenize them (paragraph, next blockquote, etc.).
            const leftover = newText.substring(newToken.raw.length).replace(/^\n/, "");
            const leftoverCount = leftover ? leftover.split("\n").length : 0;
            const consumed = leftoverCount ? lines.slice(0, -leftoverCount) : lines;
            if (consumed.length > 0) {
               raw = `${raw}\n${consumed.join("\n")}`;
            }
            text = text.substring(0, text.length - oldToken.text.length) + newToken.text;

            // A leftover line that starts with '>' still belongs to this
            // blockquote; any other leftover line ends it.
            lines = lines.slice(consumed.length);
            if (lines.length > 0 && other.blockquoteStart.test(lines[0]!)) {
               continue;
            }
            break;
         } else if (lastToken?.type === "list") {
            // include continuation in nested list
            const oldToken = lastToken;
            const newText = oldToken.raw + "\n" + lines.join("\n");
            // re-lexing the nested list restarts at its first source line
            if (mapped)
               this.lexer.line =
                  startLine + raw.split("\n").length - oldToken.raw.split("\n").length;
            const newToken = this.list(newText)!;
            tokens[tokens.length - 1] = newToken;

            // The list raw has no '>' markers, so it cannot be cut out of `raw`.
            // Count the continuation lines the list took and add those lines instead.
            const consumedCount =
               newToken.raw.length > oldToken.raw.length
                  ? newText.slice(oldToken.raw.length + 1, newToken.raw.length).split("\n").length
                  : 0;
            if (consumedCount > 0) {
               const consumed = lines.slice(0, consumedCount).join("\n");
               raw = `${raw}\n${consumed}`;
               text = `${text}\n${consumed}`;
            }
            lines = lines.slice(consumedCount);

            // A lazy line the list did not take is not a paragraph continuation,
            // e.g. after an empty list item, so it ends the blockquote.
            if (lines.length > 0 && !other.blockquoteStart.test(lines[0]!)) {
               break;
            }
            continue;
         }
      }

      // leave the counter on the blockquote's last line; `raw` has no trailing
      // newline, so the pending line terminator is counted by the next space token
      if (mapped) this.lexer.line = startLine + raw.split("\n").length - 1;

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

      // Inside a list item, paragraph lines are lexed as text tokens, so a list after one would
      // interrupt the paragraph. Only a non-empty list starting with a bullet or 1 can do that
      if (this.lexer.state.lastToken?.type === "text" && !other.listInterruptsParagraph.test(src)) {
         return;
      }

      // src is only consumed from the front, so every raw below is a slice of
      // listSrc rather than a string built up line by line
      const listSrc = src;
      const taken = () => listSrc.length - src.length;
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
         let itemContents = "";
         if (!(cap = itemRegex.exec(src))) {
            break;
         }

         if (block.hr.test(src)) {
            // End list if bullet was actually HR (possibly move into itemRegex?)
            break;
         }

         const itemStart = taken();
         src = src.substring(cap[0].length);

         const firstLine = cap[2]!.split("\n", 1)[0]!;
         const bulletIndent = cap[1]!.length;
         let line = firstLine.replace(other.leadingSpaceTab, (whitespace) =>
            expandTabs(whitespace, bulletIndent),
         );
         let nextLine = src.split("\n", 1)[0] ?? "";

         let blankLine = !line.trim();

         let indent = 0;
         if (blankLine) {
            indent = bulletIndent + 1;
         } else {
            indent = line.search(other.nonSpaceChar); // Find first non-space char
            indent = indent > 4 ? 1 : indent; // Treat indented code blocks (> 4 spaces) as having only 1 indent
            itemContents = line.slice(indent);
            indent += bulletIndent;
         }

         if (blankLine && other.blankLine.test(nextLine)) {
            // Items begin with at most one blank line
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

            // A lazy line continues a paragraph, so it is not checked for the start of a block
            let lineIsLazy = false;

            // Check if following lines should be included in List Item
            while (src) {
               const rawLine = src.split("\n", 1)[0] ?? "";
               nextLine = rawLine;
               const nextLineWithoutTabs = nextLine.replace(other.leadingSpaceTab, (whitespace) =>
                  expandTabs(whitespace),
               );

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
                  lineIsLazy = false;
               } else {
                  // not enough indentation
                  if (blankLine) {
                     break;
                  }

                  // The first line of an item always starts a block, which can be a
                  // nested list item or block quote. Look past their markers to the
                  // block a lazy line would continue. Tabs are left alone because
                  // their width depends on the column they start at.
                  let lastBlock = line;
                  if (!itemContents.includes("\n") && !line.includes("\t")) {
                     let marker;
                     while (
                        !hrRegex.test(lastBlock) &&
                        (marker = other.nestedBlockMarker.exec(lastBlock))
                     ) {
                        lastBlock = lastBlock.slice(marker[0].length);
                     }
                     if (!lastBlock.trim()) {
                        // empty list item or block quote
                        break;
                     }
                  }

                  // paragraph continuation unless last line was a different block level element
                  if (
                     lastBlock.replace(other.tabCharGlobal, "    ").search(other.nonSpaceChar) >= 4
                  ) {
                     // indented code block
                     break;
                  }
                  if (fencesBeginRegex.test(lastBlock)) {
                     break;
                  }
                  if (headingBeginRegex.test(lastBlock)) {
                     break;
                  }
                  if (htmlBeginRegex.test(lastBlock)) {
                     break;
                  }
                  if (hrRegex.test(lastBlock)) {
                     break;
                  }
                  if (!lineIsLazy) {
                     // `line` is relative to the item content, so a block on it can be indented up
                     // to 3 spaces whatever the item indent is. A nested list item or blockquote on
                     // it, as in `- # heading` or `> ---`, holds a block that a lazy line cannot
                     // continue either, so check what follows those markers too.
                     const lastBlockLine = line.replace(other.nestedContainerMarkers, "");
                     if (
                        block.fences.test(lastBlockLine) ||
                        block.heading.test(lastBlockLine) ||
                        block.hr.test(lastBlockLine)
                     ) {
                        break;
                     }
                  }

                  // A lazy continuation can look like a setext underline after
                  // list indentation is removed. Keep it in the paragraph.
                  const setextContinuation =
                     other.setextUnderline.test(nextLine) &&
                     block.lheading.test(`${line}\n${nextLine}`);
                  const continuation = setextContinuation
                     ? `    ${nextLineWithoutTabs.replace(other.leadingThreeSpaces, "")}`
                     : nextLine;
                  itemContents += "\n" + continuation;
                  lineIsLazy = true;
               }

               // Check if current line is blank
               blankLine = !nextLine.trim();

               src = src.substring(rawLine.length + 1);
               line = nextLineWithoutTabs.slice(indent);
            }
         }

         // The loops above may step past a '\n' the source did not have. It could
         // only be on the item that exhausts src, whose raw is trimmed below,
         // and after which nothing reads endsWithBlankLine
         const raw = listSrc.slice(itemStart, taken());

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
      list.raw = listSrc.slice(0, taken()).trimEnd();

      // Item child tokens handled here at end because we needed to have the final item to trim it first
      // save/restore top: blockTokens resets it to true on exit, and a nested list
      // lexed with a stale top=true would advance the sourcemap line counter
      const top = this.lexer.state.top;
      // First pass: tokenize items and finalize list.loose from spacers before placing checkboxes
      // Where each item's inline queue entries start, so the checkbox is removed from its own text
      const queueStarts: number[] = [];
      for (const item of list.items) {
         this.lexer.state.top = false;
         queueStarts.push(this.lexer.inlineQueue.length);
         item.tokens = this.lexer.blockTokens(item.text, []);

         if (!list.loose) {
            // Check if list should be loose
            const spacers = item.tokens.filter((t) => t.type === "space");
            const hasMultipleLineBreaks =
               spacers.length > 0 && spacers.some((t) => other.anyLine.test(t.raw));

            list.loose = hasMultipleLineBreaks;
         }
      }
      this.lexer.state.top = top;

      // Second pass: place task checkboxes using the final list.loose
      list.items.forEach((item, i) => {
         const itemToken = item.tokens[0];
         if (item.task && (itemToken?.type === "text" || itemToken?.type === "paragraph")) {
            // Remove checkbox markdown from item tokens
            item.text = item.text.replace(other.listReplaceTask, "");
            itemToken.raw = itemToken.raw.replace(other.listReplaceTask, "");
            itemToken.text = itemToken.text.replace(other.listReplaceTask, "");
            // The first token queued its text first, so its entry is found right away
            const inlineQueue = this.lexer.inlineQueue;
            for (let j = queueStarts[i]!; j < inlineQueue.length; j++) {
               const entry = inlineQueue[j]!;
               if (entry.tokens === itemToken.tokens) {
                  entry.src = entry.src.replace(other.listReplaceTask, "");
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
      });

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

      // an html block of type 7 cannot interrupt a paragraph, so a lazy
      // continuation line that starts one continues the paragraph instead
      if (this.lexer.state.lastToken?.type === "paragraph" && !other.htmlBeginRegex(4).test(src)) {
         return;
      }

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

      const openTag = other.htmlOpenTagName.exec(raw)?.[1]?.toLowerCase();
      const closeTag = other.htmlEndingCloseTagName.exec(raw.trimEnd())?.[1]?.toLowerCase();

      // a token ending in the closing tag of a pending html token closes it, even
      // when it opens other tags itself (`  <dt>a</dt>\n</dl>`); one that closes
      // the tag it opens (`<div>a</div>`) is self-contained
      const index =
         closeTag === undefined || closeTag === openTag
            ? -1
            : this.pendingHtmlClose.findIndex((pending) => pending.tag === closeTag);
      const pending = this.pendingHtmlClose[index];
      if (pending) {
         if (pending.token.sourceMap && token.sourceMap) {
            pending.token.sourceMap[1] = token.sourceMap[1];
         }
         // tags opened after the one just closed can no longer be closed
         this.pendingHtmlClose.splice(0, index + 1);
      } else if (openTag && openTag !== closeTag) {
         // first in last out
         this.pendingHtmlClose.unshift({ tag: openTag, token });
      }

      return token;
   }

   def(src: string): Tokens["Def"] | undefined {
      const cap = block.def.exec(src);
      if (!cap) return undefined;

      // outside angle brackets a link destination holds only balanced parentheses
      if (!other.startAngleBracket.test(cap[2]!) && findClosingBracket(cap[2]!, "()") !== -1) {
         return;
      }

      const tag = normalizeLabel(cap[1]!);
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
      // decide on the header and delimiter rows before scanning the body
      const header = other.tableHeader.exec(src);
      // delimiter row must have a pipe (|) or colon (:) otherwise it is a setext heading
      if (!header || !other.tableDelimiter.test(header[2]!)) return;
      const headers = splitCells(header[1]!);
      const aligns = header[2]!.replace(other.tableAlignChars, "").split("|");
      if (headers.length !== aligns.length) return;

      const cap = block.table.exec(src);
      if (!cap) return;
      const rows = cap[3]?.trim() ? cap[3].replace(other.tableRowBlankLine, "").split("\n") : [];

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

      // DEVIATION: upstream keeps continuation lines' indentation; CommonMark (and
      // GitHub, whose heading slugs would otherwise gain a dash per space) strips it
      const text = cap[1]!.trim().replace(other.continuationIndent, "\n");
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

      let raw = cap[0];
      let text = cap[0];
      // Indented code cannot interrupt the text, so indented lines continue it
      // up to the next blank line
      const continuation = other.textIndentedContinuation.exec(src.slice(raw.length));
      if (continuation) {
         raw += continuation[0];
         text += continuation[0].replace(other.codeRemoveIndent, "");
      }
      return {
         type: "text",
         raw,
         text,
         tokens: this.lexer.inline(text),
         sourceMap: this.lexer.getSourceMap(raw),
      };
   }

   escape(src: string): Tokens["Escape"] | undefined {
      if (src.charCodeAt(0) !== 92) return; // \\
      const cap = inline.escape.exec(src);
      if (!cap) return undefined;

      return {
         type: "escape",
         raw: cap[0],
         text: cap[1]!,
      };
   }

   tag(src: string): Tokens["Tag"] | undefined {
      if (src.charCodeAt(0) !== 60) return; // <
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
      // The link regex backtracks quadratically over unterminated-link inputs
      // like '[a](b'.repeat(n); inlineTokens anchors one paren scan per run in
      // state.linkParenPossible, and when it is false the regex cannot match.
      if (!this.lexer.state.linkParenPossible) return;
      const first = src.charCodeAt(0);
      if (first !== 91 && first !== 33) return; // [ or !
      const cap = inline.link.exec(src);
      if (!cap) return undefined;

      if (isLabelEndInsideToken(src, cap[1]!, cap[0].startsWith("!") ? 2 : 1)) {
         return;
      }

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
      // The ')' that ends the match is the link closer only when it is not
      // escaped. `[foo](/url\)` has no closer; that paren is destination text.
      const unescaped = rtrim(cap[0].slice(0, -1), "\\");
      if ((cap[0].length - unescaped.length) % 2 === 0) {
         return;
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
      const first = src.charCodeAt(0);
      if (first !== 91 && first !== 33) return; // [ or !
      let cap;
      if ((cap = inline.reflink.exec(src)) ?? (cap = inline.nolink.exec(src))) {
         if (isLabelEndInsideToken(src, cap[1]!, cap[0].startsWith("!") ? 2 : 1)) {
            return;
         }

         const link = links[normalizeLabel((cap[2] ?? cap[1])!)];
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

      const delimChar = match[0][0];
      // A mid-run opener (for example the second star of an unmatched `**`) must
      // only pair with a delimiter that can only close, otherwise it steals the
      // opener of a later span (`**a*b*c` must be `**a<em>b</em>c`).
      const midRun = prevChar === delimChar;

      // The start of this delimiter run may already be behind src, either taken
      // as text after the whole run failed to match or used to close an earlier
      // span. Flanking and rules 9-10 are about the whole run, so find its start.
      const srcStart = maskedSrc.length - src.length;
      let runStart = srcStart;
      while (runStart > 0 && maskedSrc[runStart - 1] === delimChar) {
         runStart--;
      }
      const runPrevChar =
         Array.from(maskedSrc.slice(Math.max(0, runStart - 2), runStart)).at(-1) ?? "";
      // The other delimiter character counts as punctuation here (`_**a*`, `*_#_`)
      const runPrevPunct =
         runPrevChar === "*" || runPrevChar === "_" || !!inline.punctuation.exec(runPrevChar);
      if (runStart < srcStart) {
         prevChar = runPrevChar;
      }
      const prevPunct =
         runStart < srcStart
            ? runPrevPunct
            : prevChar === "*" || prevChar === "_" || !!inline.punctuation.exec(prevChar);

      // _ can't be between two alphanumerics. \p{L}\p{N} includes non-english alphabet/numbers as well
      if (match[4] && other.unicodeAlphaNumeric.exec(prevChar)) return;

      const nextChar = match[1] || match[3] || "";

      if (!nextChar || !prevChar || prevPunct) {
         // unicode Regex counts emoji as 1 char; convert to array for proper count (used multiple times below)
         const lLength = Array.from(match[0]).length - 1;
         let rDelim,
            rLength,
            delimTotal = lLength,
            midDelimTotal = 0;

         // Rules 9-10 count the whole run, and also apply when the opener could
         // close as well (`a*b**`, where `*` is both left- and right-flanking).
         const runLength = srcStart - runStart + lLength;
         const openerCanClose =
            !!runPrevChar.trim() && (!!nextChar || (delimChar === "*" && !runPrevPunct));
         if (delimChar !== "*" && delimChar !== "_") return;
         const endReg = delimChar === "*" ? inline.emStrong.rDelimAst : inline.emStrong.rDelimUnd;
         const lastPossibleEmStrongCloserIndex = cachedLastPossibleEmStrongCloserIndex(
            this,
            maskedSrc,
            delimChar,
         );
         const emStrongCloserWindowStart = maskedSrc.length - src.length + lLength;
         if (lastPossibleEmStrongCloserIndex < emStrongCloserWindowStart) return;
         // Clip maskedSrc to same section of string as src (move to lexer?)
         maskedSrc = maskedSrc.slice(-1 * src.length + lLength);
         const lastPossibleEmStrongCloserIndexInWindow =
            lastPossibleEmStrongCloserIndex - emStrongCloserWindowStart;
         endReg.lastIndex = 0;

         while ((match = endReg.exec(maskedSrc)) != null) {
            if (match.index > lastPossibleEmStrongCloserIndexInWindow) break;
            rDelim = match[1] || match[2] || match[3] || match[4] || match[5] || match[6];

            if (!rDelim) continue; // skip single * in __abc*abc__

            rLength = Array.from(rDelim).length;

            if (match[3] || match[4]) {
               // found another Left Delim
               delimTotal += rLength;
               continue;
            } else if (match[5] || match[6] || openerCanClose) {
               // either Left or Right Delim
               if (runLength % 3 && !((runLength + rLength) % 3)) {
                  // CommonMark Emphasis Rules 9-10
                  if (midRun && (match[5] || match[6])) {
                     // A delimiter that can also open and cannot close this run
                     // opens its own span; a later closer pairs with it, not with a
                     // mid-run opener (`**a*a*` must be `**a<em>a</em>`).
                     break;
                  }
                  midDelimTotal += rLength;
                  continue;
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
      if (src.charCodeAt(0) !== 96) return; // `
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
      const first = src.charCodeAt(0);
      if (first !== 32 && first !== 92 && first !== 10) return; // space, \\ or newline
      const cap = inline.br.exec(src);
      if (!cap) return undefined;

      return {
         type: "br",
         raw: cap[0],
      };
   }

   del(src: string, maskedSrc: string, prevChar = ""): Tokens["Del"] | undefined {
      if (src.charCodeAt(0) !== 126) return; // ~
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
         const lastPossibleDelCloserIndex = cachedLastPossibleDelCloserIndex(this, maskedSrc);
         const delCloserWindowStart = maskedSrc.length - src.length + lLength;
         if (lastPossibleDelCloserIndex < delCloserWindowStart) return;
         // Clip maskedSrc to same section of string as src
         maskedSrc = maskedSrc.slice(-1 * src.length + lLength);
         const lastPossibleDelCloserIndexInWindow =
            lastPossibleDelCloserIndex - delCloserWindowStart;
         endReg.lastIndex = 0;

         while ((match = endReg.exec(maskedSrc)) !== null) {
            if (match.index > lastPossibleDelCloserIndexInWindow) break;
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
      if (src.charCodeAt(0) !== 60) return; // <
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
         autolink: true,
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
            autolink: true,
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

      const escaped = this.lexer.state.inRawBlock;
      return {
         type: "text",
         raw: cap[0],
         // raw HTML keeps whatever it was written with, everywhere else a numeric
         // character reference stands for the character itself
         text: escaped ? cap[0] : decodeNumericCharacterReferences(cap[0]),
         escaped,
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
