/**
 * Regexes that don't belong to the block or inline grammars.
 * Names mirror marked's `other` rules object (src/rules.ts) so future
 * syncs stay diffable; some values intentionally lag upstream until the
 * corresponding fixes are ported (see MARKED_SYNC.md).
 */
export const other = {
   codeRemoveIndent: /^ {1,4}/gm,
   outputLinkReplace: /\\([\[\]])/g,
   indentCodeCompensation: /^(\s+)(?:```)/,
   beginningSpace: /^\s+/,
   nonSpaceChar: /[^ ]/,
   newLineCharGlobal: /\n/g,
   multipleSpaceGlobal: /\s+/g,
   blankLine: /^ *$/,
   doubleBlankLine: /\n *\n *$/,
   blockquoteSetextReplace: /\n {0,3}((?:=+|-+) *)(?=\n|$)/g,
   blockquoteSetextReplace2: /^ *>[ \t]?/gm,
   listReplaceTabs: /^\t+/,
   listIsTask: /^\[[ xX]\] /,
   listReplaceTask: /^\[[ xX]\] +/,
   listTaskCheckbox: /\[[ xX]\]/,
   anyLine: /\n.*\n/,
   hrefBrackets: /^<(.*)>$/,
   tableDelimiter: /[:|]/,
   tableAlignChars: /^\||\| *$/g,
   tableRowBlankLine: /\n[ \t]*$/,
   tableAlignRight: /^ *-+: *$/,
   tableAlignCenter: /^ *:-+: *$/,
   tableAlignLeft: /^ *:-+ *$/,
   startATag: /^<a /i,
   endATag: /^<\/a>/i,
   startPreScriptTag: /^<(pre|code|kbd|script)(\s|>)/i,
   endPreScriptTag: /^<\/(pre|code|kbd|script)(\s|>)/i,
   unicodeAlphaNumeric: /[\p{L}\p{N}]/u,
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
   nextBulletRegex: (indent: number) =>
      new RegExp(
         `^ {0,${Math.min(3, indent - 1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ \t][^\\n]*)?(?:\\n|$))`,
      ),
   hrRegex: (indent: number) =>
      new RegExp(
         `^ {0,${Math.min(3, indent - 1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`,
      ),
   fencesBeginRegex: (indent: number) =>
      new RegExp(`^ {0,${Math.min(3, indent - 1)}}(?:\`\`\`|~~~)`),
   headingBeginRegex: (indent: number) => new RegExp(`^ {0,${Math.min(3, indent - 1)}}#`),
};
