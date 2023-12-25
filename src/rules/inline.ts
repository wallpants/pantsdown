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
    | "del"
    | "url"
    | "text"
    | "emStrong"
    | "anyPunctuation"
    | "punctuation"
    | "blockSkip"
    | "footnoteRef"
    | "backpedal";

// list of unicode punctuation marks, plus any missing characters from CommonMark spec
const punctuation = "\\p{P}$+<=>`^|~";
const title = /"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/;
const href = /<(?:\\.|[^\n<>\\])+>|[^\s\x00-\x1f]*/;
const scheme = /[a-zA-Z][a-zA-Z0-9+.-]{1,31}/;
const comment = edit(blockComment).replace("(?:-->|$)", "-->").getRegex();
const attribute = /\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/;
const label = /(?:\[(?:\\.|[^\[\]\\])*\]|\\.|`[^`]*`|[^\[\]\\`])*?/;
const email =
    /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/;
const extended_email = /[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/;

const inline_punctuation = edit(/^((?![*_])[\spunctuation])/, "u")
    .replace(/punctuation/g, punctuation)
    .getRegex();

// sequences em should skip over [title](link), `code`, <html>
const inline_blockSkip = /\[[^[\]]*?\]\([^\(\)]*?\)|`[^`]*?`|<[^<>]*?>/g;

const inline_emStrong = {
    lDelim: edit(/^(?:\*+(?:((?!\*)[punct])|[^\s*]))|^_+(?:((?!_)[punct])|([^\s_]))/, "u")
        .replace(/punct/g, punctuation)
        .getRegex(),
    // (1) and (2) can only be a Right Delimiter. (3) and (4) can only be Left.  (5) and (6) can be either Left or Right.
    // | Skip orphan inside strong      | Consume to delim | (1) #***              | (2) a***#, a***                    | (3) #***a, ***a                  | (4) ***#                 | (5) #***#                         | (6) a***a
    rDelimAst: edit(
        /^[^_*]*?__[^_*]*?\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\*)[punct](\*+)(?=[\s]|$)|[^punct\s](\*+)(?!\*)(?=[punct\s]|$)|(?!\*)[punct\s](\*+)(?=[^punct\s])|[\s](\*+)(?!\*)(?=[punct])|(?!\*)[punct](\*+)(?!\*)(?=[punct])|[^punct\s](\*+)(?=[^punct\s])/,
        "gu",
    )
        .replace(/punct/g, punctuation)
        .getRegex(),
    rDelimUnd: edit(
        // ^- Not allowed for _
        /^[^_*]*?\*\*[^_*]*?_[^_*]*?(?=\*\*)|[^_]+(?=[^_])|(?!_)[punct](_+)(?=[\s]|$)|[^punct\s](_+)(?!_)(?=[punct\s]|$)|(?!_)[punct\s](_+)(?=[^punct\s])|[\s](_+)(?!_)(?=[punct])|(?!_)[punct](_+)(?!_)(?=[punct])/,
        "gu",
    )
        .replace(/punct/g, punctuation)
        .getRegex(),
};

const inline_anyPunctuation = edit(/\\[punct]/g, "gu")
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

const inline_link = edit(/^!?\[(label)\]\(\s*(href)(?:\s+(title))?\s*\)/)
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

const inline_escape = edit(/^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/)
    .replace("])", "~|])")
    .getRegex();

const inline_backpedal =
    /(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/;

const inline_del = /^(~~?)(?=[^\s~])([\s\S]*?[^\s~])\1(?=[^~]|$)/;

const inline_text =
    /^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|https?:\/\/|ftp:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/;

const inline_url = edit(/^((?:ftp|https?):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/, "i")
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
    del: inline_del,
    text: inline_text,
    punctuation: inline_punctuation,
    blockSkip: inline_blockSkip,
    backpedal: inline_backpedal,
    footnoteRef: /^\[\^([^\]\n]+)\]/,
};
