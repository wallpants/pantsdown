import { comment as blockComment, label as blockLabel } from "./block.ts";
import { edit } from "./utils.ts";

type InlineRuleNames =
   | "escape"
   | "autolink"
   | "tag"
   | "link"
   | "reflink"
   | "nolink"
   | "reflinkSearch"
   | "code"
   | "br"
   | "delLDelim"
   | "delRDelim"
   | "url"
   | "text"
   | "emStrong"
   | "anyPunctuation"
   | "punctuation"
   | "blockSkip"
   | "footnoteRef"
   | "backpedal"
   | "latexInline";

// list of unicode punctuation marks, plus any missing characters from CommonMark spec
const punctuation = "\\p{P}\\p{S}";
const _punctuation = /[\p{P}\p{S}]/u;
const _punctuationOrSpace = /[\s\p{P}\p{S}]/u;
const _notPunctuationOrSpace = /[^\s\p{P}\p{S}]/u;

// GFM allows ~ inside strong and em for strikethrough
const _punctuationGfmStrongEm = /(?!~)[\p{P}\p{S}]/u;
const _punctuationOrSpaceGfmStrongEm = /(?!~)[\s\p{P}\p{S}]/u;
const _notPunctuationOrSpaceGfmStrongEm = /(?:[^\s\p{P}\p{S}]|~)/u;

const title = /"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/;
const href = /<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]+|(?=\))/;
const scheme = /[a-zA-Z][a-zA-Z0-9+.-]{1,31}/;
const comment = edit(blockComment).replace("(?:-->|$)", "-->").getRegex();
const attribute = /\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/;
// codespan branches carry the #3918 ReDoS fix (`+(?!`) head, ``+(?=\]) tail)
const label =
   /(?:\[(?:\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|`+(?!`)[^`]*?`+(?!`)|``+(?=\])|[^\[\]\\`])*?/;
const email =
   /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/;
const extended_email = /[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/;

const inline_punctuation = edit(/^((?![*_])punctSpace)/, "u")
   .replace(/punctSpace/g, _punctuationOrSpace)
   .getRegex();

// sequences em should skip over [title](link), `code`, <html>
// upstream builds this via a codePattern placeholder and a lookbehind fallback;
// bun (JSC) supports lookbehind so we inline the lookbehind form directly
const inline_blockSkip =
   /\[(?:[^\[\]`]|(?<a>`+)[^`]+\k<a>(?!`))*?\]\((?:\\[\s\S]|[^\\\(\)]|\((?:\\[\s\S]|[^\\\(\)])*\))*\)|(?<!`)(?<b>`+)[^`]+\k<b>(?!`)|<(?! )[^<>]*?>/g;

const emStrongLDelimCore = /^(?:\*+(?:((?!\*)punct)|([^\s*]))?)|^_+(?:((?!_)punct)|([^\s_]))?/;

const emStrongRDelimAstCore =
   "^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)" + // Skip orphan inside strong
   "|[^*]+(?=[^*])" + // Consume to delim
   "|(?!\\*)punct(\\*+)(?=[\\s]|$)" + // (1) #*** can only be a Right Delimiter
   "|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)" + // (2) a***#, a*** can only be a Right Delimiter
   "|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)" + // (3) #***a, ***a can only be Left Delimiter
   "|[\\s](\\*+)(?!\\*)(?=punct)" + // (4) ***# can only be Left Delimiter
   "|(?!\\*)punct(\\*+)(?!\\*)(?=punct)" + // (5) #***# can be either Left or Right Delimiter
   "|notPunctSpace(\\*+)(?=notPunctSpace)"; // (6) a***a can be either Left or Right Delimiter

const inline_emStrong = {
   // GFM variants: ~ is not treated as punctuation so strikethrough
   // can nest directly inside strong/em (upstream emStrongLDelimGfm)
   lDelim: edit(emStrongLDelimCore, "u").replace(/punct/g, _punctuationGfmStrongEm).getRegex(),
   // upstream emStrongRDelimAstGfm
   rDelimAst: edit(emStrongRDelimAstCore, "gu")
      .replace(/notPunctSpace/g, _notPunctuationOrSpaceGfmStrongEm)
      .replace(/punctSpace/g, _punctuationOrSpaceGfmStrongEm)
      .replace(/punct/g, _punctuationGfmStrongEm)
      .getRegex(),
   // (6) Not allowed for _
   rDelimUnd: edit(
      "^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)" + // Skip orphan inside strong
         "|[^_]+(?=[^_])" + // Consume to delim
         "|(?!_)punct(_+)(?=[\\s]|$)" + // (1) #___ can only be a Right Delimiter
         "|notPunctSpace(_+)(?!_)(?=punctSpace|$)" + // (2) a___#, a___ can only be a Right Delimiter
         "|(?!_)punctSpace(_+)(?=notPunctSpace)" + // (3) #___a, ___a can only be Left Delimiter
         "|[\\s](_+)(?!_)(?=punct)" + // (4) ___# can only be Left Delimiter
         "|(?!_)punct(_+)(?!_)(?=punct)", // (5) #___# can be either Left or Right Delimiter
      "gu",
   )
      .replace(/notPunctSpace/g, _notPunctuationOrSpace)
      .replace(/punctSpace/g, _punctuationOrSpace)
      .replace(/punct/g, _punctuation)
      .getRegex(),
};

const inline_anyPunctuation = edit(/\\([punct])/g, "gu")
   .replace(/punct/g, punctuation)
   .getRegex();

const inline_autolink = edit(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/)
   .replace("scheme", scheme)
   .replace("email", email)
   .getRegex();

const inline_tag = edit(
   "^comment" +
      "|^</[a-zA-Z][\\w:-]*\\s*>" + // self-closing tag
      "|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>" + // open tag
      "|^<\\?[\\s\\S]*?\\?>" + // processing instruction, e.g. <?php ?>
      "|^<![a-zA-Z]+\\s[\\s\\S]*?>" + // declaration, e.g. <!DOCTYPE html>
      "|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>", // CDATA section
)
   .replace("comment", comment)
   .replace("attribute", attribute)
   .getRegex();

const inline_link = edit(
   /^!?\[(label)\]\(\s*(href)(?:(?:[ \t]+(?:\n[ \t]*)?|\n[ \t]*)(title))?\s*\)/,
)
   .replace("label", label)
   .replace("href", href)
   .replace("title", title)
   .getRegex();

const inline_reflink = edit(/^!?\[(label)\]\[(ref)\]/)
   .replace("label", label)
   .replace("ref", blockLabel)
   .getRegex();

const inline_nolink = edit(/^!?\[(ref)\](?:\[\])?/)
   .replace("ref", blockLabel)
   .getRegex();

const inline_reflinkSearch = edit("reflink|nolink(?!\\()", "g")
   .replace("reflink", inline_reflink)
   .replace("nolink", inline_nolink)
   .getRegex();

const inline_escape = /^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/;

const inline_backpedal =
   /(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/;

// Tilde left delimiter for strikethrough (similar to emStrongLDelim for asterisk)
const inline_delLDelim = edit(/^~~?(?:((?!~)punct)|[^\s~])/, "u")
   .replace(/punct/g, _punctuation)
   .getRegex();

// Tilde delimiter patterns for strikethrough (similar to asterisk)
const delRDelimCore =
   "^[^~]+(?=[^~])" + // Consume to delim
   "|(?!~)punct(~~?)(?=[\\s]|$)" + // (1) #~~ can only be a Right Delimiter
   "|notPunctSpace(~~?)(?!~)(?=punctSpace|$)" + // (2) a~~#, a~~ can only be a Right Delimiter
   "|(?!~)punctSpace(~~?)(?=notPunctSpace)" + // (3) #~~a, ~~a can only be Left Delimiter
   "|[\\s](~~?)(?!~)(?=punct)" + // (4) ~~# can only be Left Delimiter
   "|(?!~)punct(~~?)(?!~)(?=punct)" + // (5) #~~# can be either Left or Right Delimiter
   "|notPunctSpace(~~?)(?=notPunctSpace)"; // (6) a~~a can be either Left or Right Delimiter

const inline_delRDelim = edit(delRDelimCore, "gu")
   .replace(/notPunctSpace/g, _notPunctuationOrSpace)
   .replace(/punctSpace/g, _punctuationOrSpace)
   .replace(/punct/g, _punctuation)
   .getRegex();

const inline_text = edit(
   /^(`+|~+|[^`~])(?:(?=[`~])|(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_$]|\b_|protocol:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/,
)
   .replace("protocol", /[hH][tT][tT][pP][sS]?|[fF][tT][pP]/)
   .getRegex();

// DEVIATION from upstream `(?:[a-zA-Z0-9\-]+\.?)+`: the nested quantifier
// combined with the email alternative defeats JSC's start-anchor optimization
// (every exec scans the whole subject, O(n²) across the inline loop). This
// domain form matches the exact same language (fuzz-verified over 200k
// samples) — preserve it when porting upstream changes to this rule.
const inline_url = edit(
   /^((?:protocol):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.)*[a-zA-Z0-9\-]+\.?[^\s<]*|^email/,
)
   .replace("protocol", /[fF][tT][pP]|[hH][tT][tT][pP][sS]?/)
   .replace("email", extended_email)
   .getRegex();

export const inline: Omit<Record<InlineRuleNames, RegExp>, "emStrong"> & {
   ["emStrong"]: Record<keyof typeof inline_emStrong, RegExp>;
} = {
   escape: inline_escape,
   autolink: inline_autolink,
   url: inline_url,
   tag: inline_tag,
   link: inline_link,
   reflink: inline_reflink,
   nolink: inline_nolink,
   reflinkSearch: inline_reflinkSearch,
   anyPunctuation: inline_anyPunctuation,
   emStrong: inline_emStrong,
   code: /^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/,
   br: /^( {2,}|\\)\n(?!\s*$)/,
   delLDelim: inline_delLDelim,
   delRDelim: inline_delRDelim,
   text: inline_text,
   punctuation: inline_punctuation,
   blockSkip: inline_blockSkip,
   backpedal: inline_backpedal,
   footnoteRef: /^\[\^([^\]\n]+)\]/,
   latexInline: /^(?:\$(?!\$)([^\s$](?:[^$\n]*[^\s$])?)\$(?!\$)|\\\((.+?)\\\))/,
};
