import { type Lexer } from "./lexer.ts";
import { other } from "./rules/other.ts";
import { type HTMLAttrs, type PantsdownConfig, type SourceMap, type Tokens } from "./types.ts";

/**
 * Helpers
 */
const escapeReplacements: Record<string, string> = {
   "&": "&amp;",
   "<": "&lt;",
   ">": "&gt;",
   '"': "&quot;",
   "'": "&#39;",
};
const getEscapeReplacement = (ch: string) => escapeReplacements[ch]!;

// look into using Bun's Bun.escapeHTML()
// https://bun.sh/docs/api/utils#bun-escapehtml
export function escape(html: string, encode?: boolean) {
   if (encode) {
      if (other.escapeTest.test(html)) {
         return html.replace(other.escapeReplace, getEscapeReplacement);
      }
   } else {
      if (other.escapeTestNoEncode.test(html)) {
         return html.replace(other.escapeReplaceNoEncode, getEscapeReplacement);
      }
   }

   return html;
}

/** djb2 — stable, collision-tolerant key for identifying content across parses */
export function hashString(str: string): string {
   let hash = 5381;
   for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
   }
   return (hash >>> 0).toString(36);
}

export function getHtmlElementText(html: string) {
   try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const element = doc.body.firstChild;
      if (!element) throw Error("No valid element found");
      return element.textContent || html;
   } catch (_) {
      return html;
   }
}

export function injectHtmlAttributes(html: string, attrs: HTMLAttrs, sourceMap?: SourceMap) {
   if (sourceMap) {
      attrs.push(["line-start", String(sourceMap[0])]);
      attrs.push(["line-end", String(sourceMap[1])]);
   }

   if (!attrs.length) return html;

   // closing tags cannot carry attributes
   if (/^\s*<\//.test(html)) return html;

   const closingBracket = /[a-zA-Z0-9\/"]>/;
   const match = closingBracket.exec(html);
   if (match) {
      let htmlAttrs = "";
      attrs.forEach((atrr) => (htmlAttrs += ` ${atrr[0]}="${atrr[1]}"`));
      const sliceIdx = match.index + (match[0] === "/>" ? 0 : 1);
      return html.slice(0, sliceIdx) + htmlAttrs + html.slice(sliceIdx);
   }
   return html;
}

export function fixHtmlLocalImageHref(html: string, config: PantsdownConfig): string {
   return config.renderer.relativeImageUrlPrefix
      ? html.replace(
           /<img\s+([^>]*?)src\s*=\s*(["'])([^>'"]+?)\2([^>]*)>/gm,
           (_m, g1, _g2, g3: string, g4) => {
              const href = fixLocalImageHref(g3, config);
              return `<img ${g1}src="${href}"${g4}>`;
           },
        )
      : html;
}

/**
 * Add GitHub-style inline styles to images with dimension attributes.
 * - If `height` or `width` is specified: adds `max-width: 100%`
 * - If `height` is specified: also adds `height: auto; max-height: {height}`
 */
export function addGithubImageStyles(html: string): string {
   return html.replace(/<img\s+([^>]*)>/gi, (_match, attrs: string) => {
      const heightMatch = /height\s*=\s*["']?(\d+(?:px)?)["']?/i.exec(attrs);
      const widthMatch = /width\s*=\s*["']?(\d+(?:px)?)["']?/i.exec(attrs);

      if (!heightMatch && !widthMatch) return _match;

      // Build style string matching GitHub's behavior
      const styles: string[] = ["max-width: 100%"];
      if (heightMatch?.[1]) {
         const value = heightMatch[1].endsWith("px") ? heightMatch[1] : `${heightMatch[1]}px`;
         styles.push("height: auto", `max-height: ${value}`);
      }

      // Check for existing style attribute
      const styleMatch = /style\s*=\s*["']([^"']*)["']/i.exec(attrs);
      let newAttrs = attrs;

      if (styleMatch?.[1]) {
         // Append to existing style
         const existingStyle = styleMatch[1].trim();
         const separator = existingStyle.endsWith(";") ? " " : "; ";
         const newStyle = existingStyle + separator + styles.join("; ");
         newAttrs = attrs.replace(styleMatch[0], `style="${newStyle}"`);
      } else {
         // Add new style attribute
         newAttrs = attrs + ` style="${styles.join("; ")}"`;
      }

      return `<img ${newAttrs}>`;
   });
}

export function fixLocalImageHref(href: string, config: PantsdownConfig): string {
   if (!config.renderer.relativeImageUrlPrefix) return href;

   // http://something
   const refIsExternal = /^[\w+]+:\/\//;
   const dummyUrl = "http://__dummy__";
   const dummyBaseUrl = new URL(config.renderer.relativeImageUrlPrefix, dummyUrl);
   const dummyUrlLength =
      dummyUrl.length + (config.renderer.relativeImageUrlPrefix.startsWith("/") ? 0 : 1);

   if (refIsExternal.test(href)) {
      // the URL is external, do not touch it
      return href;
   }

   if (href.startsWith("/")) {
      // the URL is from root
      return (
         (config.renderer.absoluteImageUrlPrefix ?? config.renderer.relativeImageUrlPrefix) +
         href.slice(1)
      );
   }

   try {
      const temp = new URL(href, dummyBaseUrl).href;
      return temp.slice(dummyUrlLength);
   } catch (_) {
      return href;
   }
}

export function cleanUrl(href: string) {
   try {
      href = encodeURI(href).replace(other.percentDecode, "%");
   } catch (_) {
      return null;
   }
   return href;
}

export const noopTest = { exec: () => null };

export function splitCells(tableRow: string, count?: number) {
   // ensure that every cell-delimiting pipe has a space
   // before it to distinguish it from an escaped pipe
   const row = tableRow.replace(other.findPipe, (_match, offset: number, str: string) => {
         let escaped = false;
         let curr = offset;
         while (--curr >= 0 && str[curr] === "\\") escaped = !escaped;
         if (escaped) {
            // odd number of slashes means | is escaped
            // so we leave it alone
            return "|";
         } else {
            // add space before unescaped |
            return " |";
         }
      }),
      cells = row.split(other.splitPipe);

   // First/last cell in a row cannot be empty if it has no leading/trailing pipe
   if (!cells[0]?.trim()) {
      cells.shift();
   }
   if (cells.length > 0 && !cells[cells.length - 1]?.trim()) {
      cells.pop();
   }

   if (count) {
      if (cells.length > count) {
         cells.splice(count);
      } else {
         while (cells.length < count) cells.push("");
      }
   }

   for (let i = 0, len = cells.length; i < len; i++) {
      // leading or trailing whitespace is ignored per the gfm spec
      cells[i] = cells[i]!.trim().replace(other.slashPipe, "|");
   }
   return cells;
}

/**
 * Remove trailing 'c's. Equivalent to str.replace(/c*$/, '').
 * /c*$/ is vulnerable to REDOS.
 *
 * @param str
 * @param c
 * @param invert Remove suffix of non-c chars instead. Default falsey.
 */
export function rtrim(str: string, c: string, invert?: boolean) {
   const l = str.length;
   if (l === 0) {
      return "";
   }

   // Length of suffix matching the invert condition.
   let suffLen = 0;

   // Step left until we fail to match the invert condition.
   while (suffLen < l) {
      const currChar = str.charAt(l - suffLen - 1);
      if (currChar === c && !invert) {
         suffLen++;
      } else if (currChar !== c && invert) {
         suffLen++;
      } else {
         break;
      }
   }

   return str.slice(0, l - suffLen);
}

export function trimTrailingBlankLines(str: string) {
   const lines = str.split("\n");
   let end = lines.length - 1;
   while (end >= 0 && other.blankLine.test(lines[end]!)) {
      end--;
   }
   if (lines.length - end <= 2) {
      // we want to keep single trailing blank lines
      return str;
   }

   return lines.slice(0, end + 1).join("\n");
}

export function findClosingBracket(str: string, b: string) {
   if (!b[1] || !str.includes(b[1])) {
      return -1;
   }

   let level = 0;
   for (let i = 0, len = str.length; i < len; i++) {
      if (str[i] === "\\") {
         i++;
      } else if (str[i] === b[0]) {
         level++;
      } else if (str[i] === b[1]) {
         level--;
         if (level < 0) {
            return i;
         }
      }
   }
   if (level > 0) {
      return -2;
   }
   return -1;
}

export function outputLink(
   cap: string[],
   link: Pick<Tokens["Link"], "href" | "title">,
   raw: string,
   lexer: Lexer,
): Tokens["Link"] | Tokens["Image"] {
   const href = link.href;
   const title = link.title || null;
   const text = cap[1]?.replace(other.outputLinkReplace, "$1") ?? "";

   lexer.state.inLink = true;
   const token: Tokens["Link"] | Tokens["Image"] = {
      type: cap[0]?.charAt(0) === "!" ? "image" : "link",
      raw,
      href,
      title,
      text,
      tokens: lexer.inlineTokens(text),
   };
   lexer.state.inLink = false;
   return token;
}

export function indentCodeCompensation(raw: string, text: string) {
   const matchIndentToCode = other.indentCodeCompensation.exec(raw);

   if (matchIndentToCode === null) {
      return text;
   }

   const indentToCode = matchIndentToCode[1];

   return text
      .split("\n")
      .map((node) => {
         const matchIndentInNode = other.beginningSpace.exec(node);
         if (matchIndentInNode === null) {
            return node;
         }

         const [indentInNode] = matchIndentInNode;

         if (indentToCode && indentInNode.length >= indentToCode.length) {
            return node.slice(indentToCode.length);
         }

         return node;
      })
      .join("\n");
}

function makeAlertRegex(type: string) {
   return new RegExp(`^(?:\\[\\!${type.toUpperCase()}\\]|[\\*]{2}${type}[\\*]{2})[ \\t]*\\n?`);
}

export const ALERTS = [
   {
      variant: "Note",
      regex: makeAlertRegex("Note"),
      icon: '<svg class="octicon octicon-info" style="margin-right: 0.5rem;" viewBox="0 0 16 16" version="1.1" width="16" height="16" aria-hidden="true"><path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"></path></svg>',
   },
   {
      variant: "Important",
      regex: makeAlertRegex("Important"),
      icon: '<svg class="octicon octicon-report" style="margin-right: 0.5rem;" viewBox="0 0 16 16" version="1.1" width="16" height="16" aria-hidden="true"><path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v9.5A1.75 1.75 0 0 1 14.25 13H8.06l-2.573 2.573A1.458 1.458 0 0 1 3 14.543V13H1.75A1.75 1.75 0 0 1 0 11.25Zm1.75-.25a.25.25 0 0 0-.25.25v9.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h6.5a.25.25 0 0 0 .25-.25v-9.5a.25.25 0 0 0-.25-.25Zm7 2.25v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 9a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"></path></svg>',
   },
   {
      variant: "Warning",
      regex: makeAlertRegex("Warning"),
      icon: '<svg class="octicon octicon-alert" style="margin-right: 0.5rem;" viewBox="0 0 16 16" version="1.1" width="16" height="16" aria-hidden="true"><path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"></path></svg>',
   },
   {
      variant: "Tip",
      regex: makeAlertRegex("Tip"),
      icon: '<svg class="octicon octicon-alert" style="margin-right: 0.5rem;" viewBox="0 0 16 16" version="1.1" width="16" height="16" aria-hidden="true"><path d="M8 1.5c-2.363 0-4 1.69-4 3.75 0 .984.424 1.625.984 2.304l.214.253c.223.264.47.556.673.848.284.411.537.896.621 1.49a.75.75 0 0 1-1.484.211c-.04-.282-.163-.547-.37-.847a8.456 8.456 0 0 0-.542-.68c-.084-.1-.173-.205-.268-.32C3.201 7.75 2.5 6.766 2.5 5.25 2.5 2.31 4.863 0 8 0s5.5 2.31 5.5 5.25c0 1.516-.701 2.5-1.328 3.259-.095.115-.184.22-.268.319-.207.245-.383.453-.541.681-.208.3-.33.565-.37.847a.751.751 0 0 1-1.485-.212c.084-.593.337-1.078.621-1.489.203-.292.45-.584.673-.848.075-.088.147-.173.213-.253.561-.679.985-1.32.985-2.304 0-2.06-1.637-3.75-4-3.75ZM5.75 12h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5ZM6 15.25a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1-.75-.75Z"/></svg>',
   },
   {
      variant: "Caution",
      regex: makeAlertRegex("Caution"),
      icon: '<svg class="octicon octicon-alert" style="margin-right: 0.5rem;" viewBox="0 0 16 16" version="1.1" width="16" height="16" aria-hidden="true"><path d="M4.47.22A.749.749 0 0 1 5 0h6c.199 0 .389.079.53.22l4.25 4.25c.141.14.22.331.22.53v6a.749.749 0 0 1-.22.53l-4.25 4.25A.749.749 0 0 1 11 16H5a.749.749 0 0 1-.53-.22L.22 11.53A.749.749 0 0 1 0 11V5c0-.199.079-.389.22-.53Zm.84 1.28L1.5 5.31v5.38l3.81 3.81h5.38l3.81-3.81V5.31L10.69 1.5ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"/></svg>',
   },
];

export function expandTabs(line: string, indent = 0) {
   let col = indent;
   let expanded = "";
   for (const char of line) {
      if (char === "\t") {
         const added = 4 - (col % 4);
         expanded += " ".repeat(added);
         col += added;
      } else {
         expanded += char;
         col++;
      }
   }

   return expanded;
}
