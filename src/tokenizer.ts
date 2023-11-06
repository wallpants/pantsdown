import type { Lexer } from "./lexer.ts";
import { block } from "./rules/block.ts";
import { inline } from "./rules/inline.ts";
import { type Links, type Tokens } from "./types.ts";
import {
    ALERTS,
    escape,
    findClosingBracket,
    indentCodeCompensation,
    outputLink,
    rtrim,
    splitCells,
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

        const text = cap[0].replace(/^ {1,4}/gm, "");
        return {
            type: "code",
            raw: cap[0],
            codeBlockStyle: "indented",
            text: rtrim(text, "\n"),
            sourceMap: this.lexer.getSourceMap(cap[0]),
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
            lang: cap[2] ? cap[2].trim().replace(inline.escapes, "$1") : cap[2],
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

        return {
            type: "heading",
            raw: cap[0],
            depth: cap[1]!.length,
            text,
            tokens: this.lexer.inline(text),
            sourceMap: this.lexer.getSourceMap(cap[0]),
        };
    }

    hr(src: string): Tokens["Hr"] | undefined {
        const cap = block.hr.exec(src);
        if (!cap) return undefined;

        return {
            type: "hr",
            raw: cap[0],
            sourceMap: this.lexer.getSourceMap(cap[0]),
        };
    }

    blockquote(src: string): Tokens["Blockquote"] | Tokens["Alert"] | undefined {
        const cap = block.blockquote.exec(src);
        if (!cap) return undefined;

        const text = rtrim(cap[0].replace(/^ *>[ \t]?/gm, ""), "\n");
        const top = this.lexer.state.top;
        this.lexer.state.top = true;
        const tokens = this.lexer.blockTokens(text, []);
        this.lexer.state.top = top;
        this.lexer.line++;

        const blockquoteToken: Tokens["Blockquote"] = {
            type: "blockquote",
            raw: cap[0],
            tokens,
            text,
        };

        const matchedVariant = ALERTS.find(({ regex }) => regex.test(blockquoteToken.text));

        if (matchedVariant) {
            const { variant, icon, regex } = matchedVariant;

            const firstLine = blockquoteToken.tokens[0] as Tokens["Paragraph"];
            const firstLineText = firstLine.raw.replace(regex, "");
            firstLine.tokens = [
                {
                    type: "text",
                    raw: firstLine.raw,
                    text: `<span>${icon + variant}</span>${firstLineText}`,
                },
            ];

            const alertToken: Tokens["Alert"] = {
                ...blockquoteToken,
                type: "alert",
                variant: variant as Tokens["Alert"]["variant"],
                icon,
            };

            alertToken.tokens.splice(0, 1, firstLine);

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
        const itemRegex = new RegExp(`^( {0,3}${bull})((?:[\t ][^\\n]*)?(?:\\n|$))`);
        let raw = "";
        let itemContents = "";
        let endsWithBlankLine = false;
        // Check if current bullet point can start a new List Item
        while (src) {
            let endEarly = false;
            if (!(cap = itemRegex.exec(src))) {
                break;
            }

            if (block.hr.test(src)) {
                // End list if bullet was actually HR (possibly move into itemRegex?)
                break;
            }

            raw = cap[0];
            src = src.substring(raw.length);

            let line = cap[2]!
                .split("\n", 1)[0]!
                .replace(/^\t+/, (t: string) => " ".repeat(3 * t.length));
            let nextLine = src.split("\n", 1)[0] ?? "";

            let indent = 0;
            indent = cap[2]!.search(/[^ ]/); // Find first non-space char
            indent = indent > 4 ? 1 : indent; // Treat indented code blocks (> 4 spaces) as having only 1 indent
            itemContents = line.slice(indent);
            indent += cap[1]!.length;

            let blankLine = false;

            if (!line && /^ *$/.test(nextLine)) {
                // Items begin with at most one blank line
                raw += nextLine + "\n";
                src = src.substring(nextLine.length + 1);
                endEarly = true;
            }

            if (!endEarly) {
                const nextBulletRegex = new RegExp(
                    `^ {0,${Math.min(
                        3,
                        indent - 1,
                    )}}(?:[*+-]|\\d{1,9}[.)])((?:[ \t][^\\n]*)?(?:\\n|$))`,
                );
                const hrRegex = new RegExp(
                    `^ {0,${Math.min(
                        3,
                        indent - 1,
                    )}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`,
                );
                const fencesBeginRegex = new RegExp(
                    `^ {0,${Math.min(3, indent - 1)}}(?:\`\`\`|~~~)`,
                );
                const headingBeginRegex = new RegExp(`^ {0,${Math.min(3, indent - 1)}}#`);

                // Check if following lines should be included in List Item
                while (src) {
                    const rawLine = src.split("\n", 1)[0] ?? "";
                    nextLine = rawLine;

                    // End list item if found code fences
                    if (fencesBeginRegex.test(nextLine)) {
                        break;
                    }

                    // End list item if found start of new heading
                    if (headingBeginRegex.test(nextLine)) {
                        break;
                    }

                    // End list item if found start of new bullet
                    if (nextBulletRegex.test(nextLine)) {
                        break;
                    }

                    // Horizontal rule found
                    if (hrRegex.test(src)) {
                        break;
                    }

                    if (nextLine.search(/[^ ]/) >= indent || !nextLine.trim()) {
                        // Dedent if possible
                        itemContents += "\n" + nextLine.slice(indent);
                    } else {
                        // not enough indentation
                        if (blankLine) {
                            break;
                        }

                        // paragraph continuation unless last line was a different block level element
                        if (line.search(/[^ ]/) >= 4) {
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

                    if (!blankLine && !nextLine.trim()) {
                        // Check if current line is blank
                        blankLine = true;
                    }

                    raw += rawLine + "\n";
                    src = src.substring(rawLine.length + 1);
                    line = nextLine.slice(indent);
                }
            }

            if (!list.loose) {
                // If the previous item ended with a blank line, the list is loose
                if (endsWithBlankLine) {
                    list.loose = true;
                } else if (/\n *\n *$/.test(raw)) {
                    endsWithBlankLine = true;
                }
            }

            let istask: RegExpExecArray | null = null;
            let ischecked: boolean | undefined;
            // Check for task list items
            istask = /^\[[ xX]\] /.exec(itemContents);
            if (istask) {
                ischecked = istask[0] !== "[ ] ";
                itemContents = itemContents.replace(/^\[[ xX]\] +/, "");
            }

            list.items.push({
                type: "list_item",
                raw,
                task: Boolean(istask),
                checked: ischecked,
                loose: false,
                text: itemContents,
                tokens: [],
                sourceMap: this.lexer.getSourceMap(raw),
            });

            list.raw += raw;
        }

        // Do not consume newlines at end of final item. Alternatively, make itemRegex *start* with any newlines to simplify/speed up endsWithBlankLine logic
        const lastTrimmed = raw.trimEnd();

        if (list.items[list.items.length - 1]!.sourceMap) {
            this.lexer.line -= raw.length - lastTrimmed.length;
        }

        list.items[list.items.length - 1]!.raw = lastTrimmed;
        list.items[list.items.length - 1]!.text = itemContents.trimEnd();
        list.raw = list.raw.trimEnd();

        // Item child tokens handled here at end because we needed to have the final item to trim it first
        for (let i = 0, listItemsLen = list.items.length; i < listItemsLen; i++) {
            this.lexer.state.top = false;
            list.items[i]!.tokens = this.lexer.blockTokens(list.items[i]!.text, []);

            if (!list.loose) {
                // Check if list should be loose
                const spacers = list.items[i]!.tokens.filter((t) => t.type === "space");
                const hasMultipleLineBreaks =
                    // eslint-disable-next-line
                    spacers.length > 0 && spacers.some((t: any) => /\n.*\n/.test(t.raw));

                list.loose = hasMultipleLineBreaks;
            }
        }

        // Set all items to loose if list is loose
        if (list.loose) {
            for (let i = 0, listItemsLen = list.items.length; i < listItemsLen; i++) {
                list.items[i]!.loose = true;
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

        const token: Tokens["HTML"] = {
            type: "html",
            block: true,
            raw: cap[0],
            pre: cap[1] === "pre" || cap[1] === "script" || cap[1] === "style",
            text: cap[0],
            sourceMap: this.lexer.getSourceMap(cap[0]),
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

        const tag = cap[1]!.toLowerCase().replace(/\s+/g, " ");
        const href = cap[2] ? cap[2].replace(/^<(.*)>$/, "$1").replace(inline.escapes, "$1") : "";
        const title = cap[3]
            ? cap[3].substring(1, cap[3].length - 1).replace(inline.escapes, "$1")
            : "";
        return {
            type: "def",
            tag,
            raw: cap[0],
            href,
            title,
            sourceMap: this.lexer.getSourceMap(cap[0]),
        };
    }

    table(src: string): Tokens["Table"] | undefined {
        const cap = block.table.exec(src);
        if (!cap?.[2]) return;

        if (!/[:|]/.test(cap[2])) {
            // delimiter row must have a pipe (|) or colon (:) otherwise it is a setext heading
            return;
        }

        const item: Tokens["Table"] = {
            type: "table",
            raw: cap[0],
            header: splitCells(cap[1]!).map((c) => ({
                type: "tablecell",
                raw: c,
                text: c,
                tokens: [],
            })),
            align: [],
            rows: [],
            sourceMap: this.lexer.getSourceMap(cap[0]),
        };

        const align = cap[2].replace(/^\||\| *$/g, "").split("|") as (string | null)[];
        const rows = cap[3]?.trim() ? cap[3].replace(/\n[ \t]*$/, "").split("\n") : [];

        if (item.header.length !== align.length) return;

        let l = align.length;
        let i, j, k, row;
        for (i = 0; i < l; i++) {
            const alignStr = align[i];
            if (alignStr) {
                if (/^ *-+: *$/.test(alignStr)) {
                    item.align.push("right");
                } else if (/^ *:-+: *$/.test(alignStr)) {
                    item.align.push("center");
                } else if (/^ *:-+ *$/.test(alignStr)) {
                    item.align.push("left");
                } else {
                    item.align.push(null);
                }
            }
        }

        l = rows.length;
        for (i = 0; i < l; i++) {
            item.rows.push(
                splitCells(rows[i] as unknown as string, item.header.length).map((c) => ({
                    type: "tablecell",
                    raw: c,
                    text: c,
                    tokens: [],
                })),
            );
        }

        // parse child tokens inside headers and cells

        // header child tokens
        l = item.header.length;
        for (j = 0; j < l; j++) {
            item.header[j]!.tokens = this.lexer.inline(item.header[j]!.text);
        }

        // cell child tokens
        l = item.rows.length;
        for (j = 0; j < l; j++) {
            row = item.rows[j]!;
            for (k = 0; k < row.length; k++) {
                row[k]!.tokens = this.lexer.inline(row[k]!.text);
            }
        }

        return item;
    }

    lheading(src: string): Tokens["Heading"] | undefined {
        const cap = block.lheading.exec(src);
        if (!cap) return undefined;

        return {
            type: "heading",
            raw: cap[0],
            depth: cap[2]!.startsWith("=") ? 1 : 2,
            text: cap[1]!,
            tokens: this.lexer.inline(cap[1]!),
            sourceMap: this.lexer.getSourceMap(cap[0]),
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
            text: escape(cap[1]!),
        };
    }

    tag(src: string): Tokens["Tag"] | undefined {
        const cap = inline.tag.exec(src);
        if (!cap) return undefined;

        if (!this.lexer.state.inLink && /^<a /i.test(cap[0])) {
            this.lexer.state.inLink = true;
        } else if (this.lexer.state.inLink && /^<\/a>/i.test(cap[0])) {
            this.lexer.state.inLink = false;
        }
        if (!this.lexer.state.inRawBlock && /^<(pre|code|kbd|script)(\s|>)/i.test(cap[0])) {
            this.lexer.state.inRawBlock = true;
        } else if (this.lexer.state.inRawBlock && /^<\/(pre|code|kbd|script)(\s|>)/i.test(cap[0])) {
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
                href: href ? href.replace(inline.escapes, "$1") : href,
                title: title ? title.replace(inline.escapes, "$1") : title,
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

        // _ can't be between two alphanumerics. \p{L}\p{N} includes non-english alphabet/numbers as well
        if (match[3] && prevChar.match(/[\p{L}\p{N}]/u)) return;

        // eslint-disable-next-line
        const nextChar = match[1] || match[2] || "";

        if (!nextChar || !prevChar || inline.punctuation.exec(prevChar)) {
            // unicode Regex counts emoji as 1 char; spread into array for proper count (used multiple times below)
            const lLength = [...match[0]].length - 1;
            let rDelim,
                rLength,
                delimTotal = lLength,
                midDelimTotal = 0;

            const endReg = match[0].startsWith("*")
                ? inline.emStrong.rDelimAst
                : inline.emStrong.rDelimUnd;
            endReg.lastIndex = 0;

            // Clip maskedSrc to same section of string as src (move to lexer?)
            maskedSrc = maskedSrc.slice(-1 * src.length + match[0].length - 1);

            while ((match = endReg.exec(maskedSrc)) != null) {
                // eslint-disable-next-line
                rDelim = match[1] || match[2] || match[3] || match[4] || match[5] || match[6];

                if (!rDelim) continue; // skip single * in __abc*abc__

                rLength = [...rDelim].length;

                // eslint-disable-next-line
                if (match[3] || match[4]) {
                    // found another Left Delim
                    delimTotal += rLength;
                    continue;
                    // eslint-disable-next-line
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

                const raw = [...src].slice(0, lLength + match.index + rLength + 1).join("");

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

        let text = cap[2]!.replace(/\n/g, " ");
        const hasNonSpaceChars = /[^ ]/.test(text);
        const hasSpaceCharsOnBothEnds = text.startsWith(" ") && text.endsWith(" ");
        if (hasNonSpaceChars && hasSpaceCharsOnBothEnds) {
            text = text.substring(1, text.length - 1);
        }
        text = escape(text, true);
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

    del(src: string): Tokens["Del"] | undefined {
        const cap = inline.del.exec(src);
        if (!cap) return undefined;

        return {
            type: "del",
            raw: cap[0],
            text: cap[2]!,
            tokens: this.lexer.inlineTokens(cap[2]!),
        };
    }

    autolink(src: string): Tokens["Link"] | undefined {
        const cap = inline.autolink.exec(src);
        if (!cap) return undefined;

        let text, href;
        if (cap[2] === "@") {
            text = escape(cap[1]!);
            href = "mailto:" + text;
        } else {
            text = escape(cap[1]!);
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
                text = escape(cap[0]);
                href = "mailto:" + text;
            } else {
                // do extended autolink path validation
                let prevCapZero;
                do {
                    prevCapZero = cap[0];
                    cap[0] = inline.backpedal.exec(cap[0])![0];
                } while (prevCapZero !== cap[0]);
                text = escape(cap[0]);
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

        let text;
        if (this.lexer.state.inRawBlock) {
            text = cap[0];
        } else {
            text = escape(cap[0]);
        }
        return {
            type: "text",
            raw: cap[0],
            text,
        };
    }
}
