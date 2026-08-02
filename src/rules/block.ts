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
   | "paragraph"
   | "latexBlock";

export const label = /(?!\s*\])(?:\\[\s\S]|[^\[\]\\])+/;

const tag =
   "address|article|aside|base|basefont|blockquote|body|caption" +
   "|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption" +
   "|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe" +
   "|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option" +
   "|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title" +
   "|tr|track|ul";

const title = /(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/;

const block_def = edit(
   /^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/,
)
   .replace("label", label)
   .replace("title", title)
   .getRegex();

const block_bullet = / {0,3}(?:[*+-]|\d{1,9}[.)])/;

const block_listItemStart = edit(/^( *)(bull) */)
   .replace("bull", block_bullet)
   .getRegex();

const block_list = edit(/^(bull)([ \t][^\n]*?)?(?:\n|$)/)
   .replace(/bull/g, block_bullet)
   .replace("hr", "\\n+(?=\\1?(?:(?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$))")
   .replace("def", "\\n+(?=" + block_def.source + ")")
   .getRegex();

export const comment = /<!--(?:-?>|[\s\S]*?(?:-->|$))/;

const block_html = edit(
   "^ {0,3}(?:" + // optional indentation
      "<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n*|$)" + // (1)
      "|comment[^\\n]*(\\n+|$)" + // (2)
      "|<\\?[\\s\\S]*?(?:\\?>[^\\n]*\\n*|$)" + // (3)
      "|<![A-Z][\\s\\S]*?(?:>[^\\n]*\\n*|$)" + // (4)
      "|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>[^\\n]*\\n*|$)" + // (5)
      "|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ \\t]*)+\\n|$)" + // (6)
      "|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ \\t]*)+\\n|$)" + // (7) open tag
      "|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ \\t]*)+\\n|$)" + // (7) closing tag
      ")",
   "i",
)
   .replace("comment", comment)
   .replace("tag", tag)
   .replace("attribute", / +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/)
   .getRegex();

// upstream's lheadingGfm variant (we are GFM-only; the commonmark variant drops |table)
const block_lheading = edit(
   /^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/,
)
   .replace(/bull/g, block_bullet) // lists can interrupt
   .replace(/blockCode/g, /(?: {4}| {0,3}\t)/) // indented code blocks can interrupt
   .replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/) // fenced code blocks can interrupt
   .replace(/blockquote/g, / {0,3}>/) // blockquote can interrupt
   .replace(/heading/g, / {0,3}#{1,6}(?:\s|$)/) // ATX heading can interrupt
   .replace(/html/g, / {0,3}<[^\n>]+>\n/) // block html can interrupt
   .replace(/table/g, / {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/) // table can interrupt
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
   .replace("code", "(?: {4}| {0,3}\\t)[^\\n]")
   .replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~~~)[^\\n]*\\n")
   .replace("list", " {0,3}(?:[*+-]|1[.)])[ \\t]") // any bullet ends the table rows
   .replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)")
   .replace("tag", tag) // tables can be interrupted by type (6) html blocks
   .getRegex();

const createParagraph = (listInterrupt: string) =>
   edit(/^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table|[ \t]+\n)[^\n]+)*)/)
      .replace("hr", block_hr)
      .replace("heading", " {0,3}#{1,6}(?:\\s|$)")
      .replace("|lheading", "") // setext headings don't interrupt commonmark paragraphs
      .replace("table", block_table) // interrupt paragraphs with table
      .replace("blockquote", " {0,3}>")
      .replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~~~)[^\\n]*\\n")
      .replace("list", listInterrupt)
      .replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)")
      .replace("tag", tag) // pars can be interrupted by type (6) html blocks
      .getRegex();

// only non-empty lists starting from 1 can interrupt paragraphs
const block_paragraph = createParagraph(" {0,3}(?:[*+-]|1[.)])[ \\t]+[^ \\t\\n]");
// inside a blockquote a bare list marker (any number) starts a sibling list,
// so it must not be lazily continued as paragraph text (unlike a top level
// paragraph, where an empty list cannot interrupt)
const block_blockquoteParagraph = createParagraph(" {0,3}(?:[*+-]|\\d{1,9}[.)])(?:[ \\t]|\\n|$)");

const block_blockquote = edit(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/)
   .replace("paragraph", block_blockquoteParagraph)
   .getRegex();

export const block: Record<BlockRuleNames, RegExp> = {
   newline: /^(?:[ \t]*(?:\n|$))+/,
   code: /^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/,
   fences:
      /^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/,
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
   footnote: /^\[\^([^\]\n]+)\]:(?:[ \t]+|[\n]*?|$)([^\n]*?(?:\n|$)(?:[\n]*?[ ]{4,}[^\n]*)*)/,
   text: /^[^\n]+/,
   latexBlock: /^(?:\$\$([^$]*(?:\$(?!\$)[^$]*)*)\$\$|\\\[([\s\S]*?)\\\])/,
};
