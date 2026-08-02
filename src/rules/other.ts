/**
 * Regexes that don't belong to the block or inline grammars.
 * Names and values mirror marked's `other` rules object (src/rules.ts,
 * currently marked v18.0.7 — see "Last synced" in the root README) so
 * future syncs stay diffable.
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

export const other = {
   codeRemoveIndent: /^(?: {1,4}| {0,3}\t)/gm,
   tabCharGlobal: /\t/g,
   outputLinkReplace: /\\([\[\]])/g,
   indentCodeCompensation: /^(\s+)(?:```)/,
   beginningSpace: /^\s+/,
   nonSpaceChar: /[^ ]/,
   newLineCharGlobal: /\n/g,
   multipleSpaceGlobal: /\s+/g,
   blankLine: /^[ \t]*$/,
   doubleBlankLine: /\n[ \t]*\n[ \t]*$/,
   blockquoteSetextReplace: /\n {0,3}((?:=+|-+) *)(?=\n|$)/g,
   blockquoteSetextReplace2: /^ {0,3}>[ \t]?/gm,
   blockquoteStart: /^ {0,3}>/,
   listIsTask: /^\[[ xX]\] +\S/,
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
   nextBulletRegex: cachedIndentRegex(
      (indent: number) =>
         new RegExp(`^ {0,${indent}}(?:[*+-]|\\d{1,9}[.)])((?:[ \t][^\\n]*)?(?:\\n|$))`),
   ),
   hrRegex: cachedIndentRegex(
      (indent: number) =>
         new RegExp(`^ {0,${indent}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`),
   ),
   fencesBeginRegex: cachedIndentRegex(
      (indent: number) => new RegExp(`^ {0,${indent}}(?:\`\`\`|~~~)`),
   ),
   headingBeginRegex: cachedIndentRegex((indent: number) => new RegExp(`^ {0,${indent}}#`)),
   htmlBeginRegex: cachedIndentRegex(
      (indent: number) => new RegExp(`^ {0,${indent}}<(?:[a-z].*>|!--)`, "i"),
   ),
   blockquoteBeginRegex: cachedIndentRegex((indent: number) => new RegExp(`^ {0,${indent}}>`)),
};
