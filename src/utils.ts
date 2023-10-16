import { type Lexer } from "./lexer.ts";
import { type SourceMap, type Tokens } from "./types.ts";

/**
 * Helpers
 */
const escapeTest = /[&<>"']/;
const escapeReplace = new RegExp(escapeTest.source, "g");
const escapeTestNoEncode = /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/;
const escapeReplaceNoEncode = new RegExp(escapeTestNoEncode.source, "g");
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
        if (escapeTest.test(html)) {
            return html.replace(escapeReplace, getEscapeReplacement);
        }
    } else {
        if (escapeTestNoEncode.test(html)) {
            return html.replace(escapeReplaceNoEncode, getEscapeReplacement);
        }
    }

    return html;
}

export function renderHtmlClasses(classes: string[]) {
    if (!classes.length) return "";
    let result = ' class="';
    result += classes.join(" ");
    result += '"';
    return result;
}

function parseHtmlElement(html: string) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    // eslint-disable-next-line
    if (!doc.body) throw Error("Invalid HTML");
    const element = doc.body.firstChild as HTMLElement;
    // eslint-disable-next-line
    if (!element) throw Error("No valid element found");
    return element;
}

export function getHtmlElementText(html: string) {
    try {
        const element = parseHtmlElement(html);
        return element.textContent ?? html;
    } catch (_) {
        return html;
    }
}

export function injectHtmlAttributes(
    html: string,
    attrs: [name: string, value: string | number][],
) {
    try {
        const element = parseHtmlElement(html);
        attrs.forEach(([name, value]) => {
            element.setAttribute(name, JSON.stringify(value));
        });
        return element.outerHTML;
    } catch (_) {
        return html;
    }
}

export function fixHtmlLocalImageHref(html: string, localImageUrlPrefix: string): string {
    return html.replace(
        /<img\s+([^>]*?)src\s*=\s*(["'])([^\2>]+?)\2([^>]*)>/gm,
        (_m, g1, _g2, g3: string, g4) => {
            const href = fixLocalImageHref(g3, localImageUrlPrefix);
            return `<img ${g1}src="${href}"${g4}>`;
        },
    );
}

export function fixLocalImageHref(href: string, localImageUrlPrefix: string): string {
    const reIsAbsolute = /^[\w+]+:\/\//;
    const dummyUrl = "http://__dummy__";
    const dummyBaseUrl = new URL(localImageUrlPrefix, dummyUrl);
    const dummyUrlLength = dummyUrl.length + (localImageUrlPrefix.startsWith("/") ? 0 : 1);

    if (reIsAbsolute.test(href)) {
        // the URL is absolute, do not touch it
        return href;
    }

    if (href.startsWith("/")) {
        // the URL is from root
        return href;
    }

    try {
        const temp = new URL(href, dummyBaseUrl).href;
        return temp.slice(dummyUrlLength);
    } catch (e) {
        return href;
    }
}

export function renderSourceMap(sourceMap: SourceMap) {
    if (!sourceMap) return "";
    return ` line-start=${sourceMap[0]} line-end=${sourceMap[1]}`;
}

export function cleanUrl(href: string) {
    try {
        href = encodeURI(href).replace(/%25/g, "%");
    } catch (e) {
        return null;
    }
    return href;
}

export const noopTest = { exec: () => null };

export function splitCells(tableRow: string, count?: number) {
    // ensure that every cell-delimiting pipe has a space
    // before it to distinguish it from an escaped pipe
    const row = tableRow.replace(/\|/g, (_match, offset: number, str: string) => {
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
        cells = row.split(/ \|/);

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
        cells[i] = cells[i]!.trim().replace(/\\\|/g, "|");
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
    return -1;
}

export function outputLink(
    cap: string[],
    link: Pick<Tokens["Link"], "href" | "title">,
    raw: string,
    lexer: Lexer,
): Tokens["Link"] | Tokens["Image"] {
    const href = link.href;
    const title = link.title ? escape(link.title) : null;
    const text = cap[1]?.replace(/\\([\[\]])/g, "$1") ?? "";

    if (cap[0]?.charAt(0) !== "!") {
        lexer.state.inLink = true;
        const token: Tokens["Link"] = {
            type: "link",
            raw,
            href,
            title,
            text,
            tokens: lexer.inlineTokens(text),
        };
        lexer.state.inLink = false;
        return token;
    }
    return {
        type: "image",
        raw,
        href,
        title,
        text: escape(text),
    };
}

export function indentCodeCompensation(raw: string, text: string) {
    const matchIndentToCode = raw.match(/^(\s+)(?:```)/);

    if (matchIndentToCode === null) {
        return text;
    }

    const indentToCode = matchIndentToCode[1];

    return text
        .split("\n")
        .map((node) => {
            const matchIndentInNode = node.match(/^\s+/);
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
