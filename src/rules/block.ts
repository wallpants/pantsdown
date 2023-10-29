import { edit } from "./utils.ts";

type BlockRuleNames =
    | "newline"
    | "code"
    | "fences"
    | "hr"
    | "heading"
    | "blockquote"
    | "list"
    | "html"
    | "def"
    | "table"
    | "lheading"
    | "text"
    | "bullet"
    | "listItemStart"
    | "footnote"
    | "paragraph";

export const label = /(?!\s*\])(?:\\.|[^\[\]\\])+/;

const tag =
    "address|article|aside|base|basefont|blockquote|body|caption" +
    "|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption" +
    "|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe" +
    "|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option" +
    "|p|param|section|source|summary|table|tbody|td|tfoot|th|thead|title|tr" +
    "|track|ul";

const title = /(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/;

const block_def = edit(
    /^ {0,3}\[(label)\]: *(?:\n *)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n *)?| *\n *)(title))? *(?:\n+|$)/,
)
    .replace("label", label)
    .replace("title", title)
    .getRegex();

const block_bullet = /(?:[*+-]|\d{1,9}[.)])/;

const block_listItemStart = edit(/^( *)(bull) */)
    .replace("bull", block_bullet)
    .getRegex();

const block_list = edit(/^( {0,3}bull)([ \t][^\n]+?)?(?:\n|$)/)
    .replace(/bull/g, block_bullet)
    .replace("hr", "\\n+(?=\\1?(?:(?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$))")
    .replace("def", "\\n+(?=" + block_def.source + ")")
    .getRegex();

export const comment = /<!--(?!-?>)[\s\S]*?(?:-->|$)/;

const block_html = edit(
    "^ {0,3}(?:" + // optional indentation
        "<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)" + // (1)
        "|comment[^\\n]*(\\n+|$)" + // (2)
        "|<\\?[\\s\\S]*?(?:\\?>\\n*|$)" + // (3)
        "|<![A-Z][\\s\\S]*?(?:>\\n*|$)" + // (4)
        "|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)" + // (5)
        "|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n *)+\\n|$)" + // (6)
        "|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n *)+\\n|$)" + // (7) open tag
        "|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n *)+\\n|$)" + // (7) closing tag
        ")",
    "i",
)
    .replace("comment", comment)
    .replace("tag", tag)
    .replace(
        "attribute",
        / +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/,
    )
    .getRegex();

const block_lheading = edit(/^(?!bull )((?:.|\n(?!\s*?\n|bull ))+?)\n {0,3}(=+|-+) *(?:\n+|$)/)
    .replace(/bull/g, block_bullet) // lists can interrupt
    .getRegex();

const block_hr = /^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/;

const block_table = edit(
    "^ *([^\\n ].*)\\n" + // Header
        " {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)" + // Align
        "(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)", // Cells
)
    .replace("hr", block_hr)
    .replace("heading", " {0,3}#{1,6}(?:\\s|$)")
    .replace("blockquote", " {0,3}>")
    .replace("code", " {4}[^\\n]")
    .replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n")
    .replace("list", " {0,3}(?:[*+-]|1[.)]) ") // only lists starting from 1 can interrupt
    .replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)")
    .replace("tag", tag) // tables can be interrupted by type (6) html blocks
    .getRegex();

const block_paragraph = edit(
    /^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/,
)
    .replace("hr", block_hr)
    .replace("heading", " {0,3}#{1,6}(?:\\s|$)")
    .replace("|lheading", "") // setex headings don't interrupt commonmark paragraphs
    .replace("table", block_table) // interrupt paragraphs with table
    .replace("blockquote", " {0,3}>")
    .replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n")
    .replace("list", " {0,3}(?:[*+-]|1[.)]) ") // only lists starting from 1 can interrupt
    .replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)")
    .replace("tag", tag) // pars can be interrupted by type (6) html blocks
    .getRegex();

const block_blockquote = edit(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/)
    .replace("paragraph", block_paragraph)
    .getRegex();

const block_footnote = edit(/^( {0,3}\[\^(\d+)\]:(?:[ \t]+|[\n]*?|$)?(paragraph|[^\n]*))+/)
    .replace("paragraph", block_paragraph)
    .getRegex();

export const block: Record<BlockRuleNames, RegExp> = {
    newline: /^(?: *(?:\n|$))+/,
    code: /^( {4}[^\n]+(?:\n(?: *(?:\n|$))*)?)+/,
    fences: /^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/,
    hr: block_hr,
    heading: /^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/,
    blockquote: block_blockquote,
    list: block_list,
    html: block_html,
    bullet: block_bullet,
    listItemStart: block_listItemStart,
    def: block_def,
    table: block_table,
    lheading: block_lheading,
    paragraph: block_paragraph,
    footnote: block_footnote,
    text: /^[^\n]+/,
};
