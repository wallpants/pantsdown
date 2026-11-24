import { tag } from "./block.ts";

/**
 * Regexes that don't belong to the block or inline grammars.
 * Names and values mirror marked's `other` rules object (src/rules.ts, as of
 * the "Last synced" version in the root README) so future syncs stay diffable.
 */

function cachedIndentRegex(createRegex: (indent: number) => RegExp) {
   const cache: RegExp[] = [];
   return (indent: number) => {
      const cacheIndex = Math.max(0, Math.min(3, indent - 1));
      let regex = cache[cacheIndex];
      if (!regex) {
         regex = createRegex(cacheIndex);
         cache[cacheIndex] = regex;
      }
      return regex;
   };
}

// header and delimiter rows of a gfm table, shared with block.table
export const tableHeaderSource =
   "^ *([^\\n ].*)\\n" + // Header
   " {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)"; // Align

export const other = {
   codeRemoveIndent: /^(?: {0,3}\t| {1,4})/gm,
   listInterruptsParagraph: /^ {0,3}(?:[*+-]|1[.)])[ \t]+[^ \t\n]/,
   tabCharGlobal: /\t/g,
   leadingSpaceTab: /^[ \t]+/,
   outputLinkReplace: /\\([\[\]])/g,
   indentCodeCompensation: /^(\s+)(?:```)/,
   beginningSpace: /^\s+/,
   endingSpaceTabChar: /[ \t]$/,
   nonSpaceChar: /[^ ]/,
   newLineCharGlobal: /\n/g,
   multipleSpaceGlobal: /\s+/g,
   blankLine: /^[ \t]*$/,
   doubleBlankLine: /\n[ \t]*\n[ \t]*$/,
   textIndentedContinuation: /^(?:\n(?: {4}| {0,3}\t)[ \t]*[^ \t\n][^\n]*)+/,
   // Neutralize a lazy setext underline, including one with trailing tabs.
   // CommonMark §4.3 allows those tabs on a real underline, so the same class
   // has to be recognized here or a lazy `===\t` becomes a heading.
   blockquoteSetextReplace: /\n {0,3}((?:=+|-+)[ \t]*)(?=\n|$)/g,
   blockquoteSetextReplace2: /^ {0,3}>[ \t]?/gm,
   blockquoteStart: /^ {0,3}>/,
   blockquoteMarkerWhitespace: /^( {0,3}>)(\t[ \t]*)/gm,
   blockquoteFenceOpen: /^ {0,3}(`{3,}(?=[^`]*$)|~{3,})/,
   blockquoteFenceClose: /^ {0,3}(`{3,}|~{3,})[ \t]*$/,
   blockquoteListItemStart: /^ {0,3}(?:[*+-]|\d{1,9}[.)])(?:[ \t]|$)/,
   nestedBlockMarker: /^ {0,3}(?:(?:[*+-]|\d{1,9}[.)])(?: |$)|> ?)/,
   // Pantsdown: lazy setext underline inside a list item (upstream inlines these)
   setextUnderline: /^ {0,3}(?:=+|-+) *$/,
   leadingThreeSpaces: /^ {0,3}/,
   listIsTask: /^\[[ xX]\][ \t]+\S/,
   listReplaceTask: /^\[[ xX]\][ \t]+/,
   listTaskCheckbox: /\[[ xX]\]/,
   anyLine: /\n.*\n/,
   hrefBrackets: /^<(.*)>$/,
   tableHeader: new RegExp(tableHeaderSource + "(?:\\n|$)"),
   startAngleBracket: /^</,
   tableDelimiter: /[:|]/,
   tableAlignChars: /^\||\| *$/g,
   tableRowBlankLine: /\n[ \t]*$/,
   tableAlignRight: /^ *-+: *$/,
   tableAlignCenter: /^ *:-+: *$/,
   tableAlignLeft: /^ *:-+ *$/,
   // Pantsdown: setext heading continuation lines (see Tokenizer.lheading)
   continuationIndent: /\n[ \t]+/g,
   // Pantsdown: html block sourcemaps (see Tokenizer.html)
   htmlOpenTagName: /^ {0,3}<([a-zA-Z][a-zA-Z0-9-]*)/,
   htmlEndingCloseTagName: /<\/([a-zA-Z][a-zA-Z0-9-]*)\s*>$/,
   startATag: /^<a /i,
   endATag: /^<\/a>/i,
   startPreScriptTag: /^<(pre|code|kbd|script)(\s|>)/i,
   endPreScriptTag: /^<\/(pre|code|kbd|script)(\s|>)/i,
   unicodeAlphaNumeric: /[\p{L}\p{N}]/u,
   numericCharacterReference: /&#(?:(\d{1,7})|[Xx]([A-Fa-f0-9]{1,6}));/,
   numericCharacterReferenceOrAmpersand:
      /&#(?:(\d{1,7})|[Xx]([A-Fa-f0-9]{1,6}));|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,
   escapeTest: /[&<>"']/,
   escapeReplace: /[&<>"']/g,
   escapeTestNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,
   escapeReplaceNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,
   caret: /(^|[^\[])\^/g,
   percentDecode: /%25/g,
   findPipe: /\|/g,
   splitPipe: / \|/,
   slashPipe: /\\\|/g,
   carriageReturn: /\r\n|\r/g,
   notSpaceStart: /^\S*/,
   endingNewline: /\n$/,
   listItemRegex: (bull: string) => new RegExp(`^( {0,3}${bull})((?:[\t ][^\\n]*)?(?:\\n|$))`),
   nextBulletRegex: cachedIndentRegex(
      (indent: number) =>
         new RegExp(`^ {0,${indent}}(?:[*+-]|\\d{1,9}[.)])((?:[ \t][^\\n]*)?(?:\\n|$))`),
   ),
   hrRegex: cachedIndentRegex(
      (indent: number) =>
         new RegExp(`^ {0,${indent}}((?:-[ \t]*){3,}|(?:_[ \t]*){3,}|(?:\\*[ \t]*){3,})(?:\\n+|$)`),
   ),
   fencesBeginRegex: cachedIndentRegex(
      (indent: number) => new RegExp(`^ {0,${indent}}(?:\`\`\`|~~~)`),
   ),
   // an ATX heading needs a space (or the end of the line) after the hashes, so a
   // line like `#tag` does not end a list item
   headingBeginRegex: cachedIndentRegex(
      (indent: number) => new RegExp(`^ {0,${indent}}#{1,6}(?:\\s|$)`),
   ),
   // a list item ends where a paragraph would be interrupted, so this mirrors the
   // html start conditions in the paragraph rule; type 7 is excluded there
   htmlBeginRegex: cachedIndentRegex(
      (indent: number) =>
         new RegExp(
            `^ {0,${indent}}(?:</?(?:${tag})(?:[ \\t]+|$|/?>)|<(?:(?:script|pre|style|textarea)(?:[\\s>]|$)|!--)|<\\?|<![A-Za-z]|<!\\[CDATA\\[)`,
            "i",
         ),
   ),
   blockquoteBeginRegex: cachedIndentRegex((indent: number) => new RegExp(`^ {0,${indent}}>`)),
   // list item and blockquote markers that open nested blocks at the start of a line, as in `- > # heading`
   nestedContainerMarkers: /^(?: {0,3}(?:(?:[*+-]|\d{1,9}[.)])[ \t]+|>[ \t]?))+/,
};
