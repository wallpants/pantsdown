import GithubSlugger from "github-slugger";
import hljs from "highlight.js";
import { renderToString } from "katex";
import { type Pantsdown } from "./pantsdown.ts";
import { type Parser } from "./parser.ts";
import { inline } from "./rules/inline.ts";
import { other } from "./rules/other.ts";
import { type HTMLAttrs, type SourceMap, type Tokens } from "./types.ts";
import {
   addGithubImageStyles,
   cleanUrl,
   escape,
   fixHtmlLocalImageHref,
   fixLocalImageHref,
   getHtmlElementText,
   hashString,
   injectHtmlAttributes,
} from "./utils.ts";

/**
 * An object containing functions to render tokens to HTML.
 */
export class Renderer {
   private pantsdown: Pantsdown;
   parser!: Parser; // set by the parser
   slugger = new GithubSlugger();
   mermaidCounts = new Map<string, number>();

   constructor(pantsdown: Pantsdown) {
      this.pantsdown = pantsdown;
   }

   space(_token: Tokens["Space"]): string {
      return "";
   }

   code({ text, lang: infostring, sourceMap }: Tokens["Code"]): string {
      const lang = other.notSpaceStart.exec(infostring ?? "")?.[0];
      let code = text.replace(other.endingNewline, "");

      const attrs: HTMLAttrs = [];

      if (lang === "mermaid") {
         attrs.push(["class", "mermaid-container mermaid"]);
         // stable identity across re-renders — the pan/zoom script keys
         // stashed transforms on it; the occurrence index disambiguates
         // byte-identical diagrams in the same document
         const hash = hashString(code);
         const count = this.mermaidCounts.get(hash) ?? 0;
         this.mermaidCounts.set(hash, count + 1);
         attrs.push(["data-mermaid-key", `${hash}-${count}`]);
         // escape so diagram source can't be parsed as HTML;
         // mermaid reads textContent, which undoes the escaping
         const result = `<pre style="position: relative;">` + escape(code, true) + "\n" + `</pre>`;
         return injectHtmlAttributes(result, attrs, sourceMap);
      }

      if (lang === "math") {
         return this.latexBlock({ text: code, sourceMap });
      }

      const language = lang && hljs.getLanguage(lang) ? lang : "plaintext";
      code = hljs.highlight(code + "\n", { language }).value;
      code = `<code class="hljs language-${escape(language)}">${code}</code>`;

      const result = `<pre style="position: relative;">` + code + `</pre>`;
      return injectHtmlAttributes(result, attrs, sourceMap);
   }

   alert(token: Tokens["Alert"]): string {
      const body = this.parser.parse(token.tokens);
      const result = `<div><span>${token.icon + token.variant}</span>${body}</div>\n`;
      return injectHtmlAttributes(result, [
         ["class", `markdown-alert markdown-alert-${token.variant.toLowerCase()}`],
      ]);
   }

   blockquote({ tokens }: Tokens["Blockquote"]): string {
      const body = this.parser.parse(tokens);
      return `<blockquote>\n${body}</blockquote>\n`;
   }

   html(token: Tokens["HTML"] | Tokens["Tag"]): string {
      let result = fixHtmlLocalImageHref(token.text, this.pantsdown.config);
      result = addGithubImageStyles(result);

      const attrs: HTMLAttrs = [];

      if (this.pantsdown.config.renderer.detailsTagDefaultOpen) {
         const tag = inline.tag.exec(token.text);
         if (tag?.[0] === "<details>") {
            attrs.push(["open", ""]);
         }
      }

      return injectHtmlAttributes(
         result,
         attrs,
         "sourceMap" in token ? token.sourceMap : undefined,
      );
   }

   heading({ tokens, depth, sourceMap }: Tokens["Heading"]): string {
      const text = this.parser.parseInline(tokens);
      const elementText = getHtmlElementText(text);
      const slug = this.slugger.slug(elementText);
      let result = `<h${depth}>`;
      // span with negative top to add some offset when scrolling to #slug
      result += `<span style="position: absolute; top: -50px;" id="${slug}"></span>`;
      result += `${text}<a class="anchor octicon-link" href="#${slug}"></a>`;
      result += `</h${depth}>\n`;
      return injectHtmlAttributes(result, [["style", "position: relative;"]], sourceMap);
   }

   hr({ sourceMap }: Tokens["Hr"]): string {
      return injectHtmlAttributes(`<hr>\n`, [], sourceMap);
   }

   list(token: Tokens["List"]): string {
      const ordered = token.ordered;
      const start = token.start;

      let body = "";
      let containsTaskList = false;
      for (const item of token.items) {
         if (item.task) containsTaskList = true;
         body += this.listitem(item);
      }

      const type = ordered ? "ol" : "ul";
      const listClasses: string[] = [];
      if (containsTaskList) listClasses.push("contains-task-list");
      const attrs: HTMLAttrs = [["class", listClasses.join(" ")]];
      if (ordered && start && start !== 1) {
         attrs.push(["start", String(start)]);
      }
      const result = `<${type}>\n${body}</${type}>\n`;
      return injectHtmlAttributes(result, attrs);
   }

   listitem(item: Tokens["ListItem"]): string {
      const attrs: HTMLAttrs = [];
      if (item.task) attrs.push(["class", "task-list-item"]);
      const text = this.parser.parse(item.tokens, false);
      const result = `<li>${text}</li>\n`;
      return injectHtmlAttributes(result, attrs, item.sourceMap);
   }

   checkbox({ checked }: Tokens["Checkbox"]): string {
      const result = "<input>";
      const attrs: HTMLAttrs = [
         ["disabled", ""],
         ["type", "checkbox"],
         ["class", "task-list-item-checkbox"],
      ];
      if (checked) attrs.push(["checked", ""]);
      return injectHtmlAttributes(result, attrs) + " ";
   }

   paragraph({ tokens, sourceMap }: Tokens["Paragraph"]): string {
      const result = `<p>${this.parser.parseInline(tokens)}</p>\n`;
      return injectHtmlAttributes(result, [], sourceMap);
   }

   table(token: Tokens["Table"]): string {
      const sourceMapLineStart = token.sourceMap?.[0];

      let header = "";
      let cell = "";
      for (const headerCell of token.header) {
         cell += this.tablecell(headerCell);
      }
      header += this.tablerow({ text: cell, sourceMapStart: sourceMapLineStart });

      let body = "";
      for (let j = 0, rowsLen = token.rows.length; j < rowsLen; j++) {
         const row = token.rows[j]!;

         cell = "";
         for (const rowCell of row) {
            cell += this.tablecell(rowCell);
         }

         body += this.tablerow({
            text: cell,
            sourceMapStart: sourceMapLineStart ? sourceMapLineStart + 2 + j : undefined,
         });
      }
      if (body) body = `<tbody>${body}</tbody>`;

      return "<table>\n" + "<thead>\n" + header + "</thead>\n" + body + "</table>\n";
   }

   tablerow({
      text,
      sourceMapStart,
   }: {
      text: string;
      sourceMapStart?: number | undefined;
   }): string {
      const sourceMap: SourceMap = sourceMapStart ? [sourceMapStart, sourceMapStart] : undefined;
      return injectHtmlAttributes(`<tr>\n${text}</tr>\n`, [], sourceMap);
   }

   tablecell(token: Tokens["TableCell"]): string {
      const content = this.parser.parseInline(token.tokens);
      const type = token.header ? "th" : "td";
      const attrs: HTMLAttrs = [];
      if (token.align) attrs.push(["align", token.align]);
      const result = `<${type}>` + content + `</${type}>\n`;
      return injectHtmlAttributes(result, attrs);
   }

   /**
    * span level renderer
    */
   strong({ tokens }: Tokens["Strong"]): string {
      return `<strong>${this.parser.parseInline(tokens)}</strong>`;
   }

   em({ tokens }: Tokens["Em"]): string {
      return `<em>${this.parser.parseInline(tokens)}</em>`;
   }

   codespan({ text }: Tokens["Codespan"]): string {
      return `<code>${escape(text, true)}</code>`;
   }

   br(_token: Tokens["Br"]): string {
      return "<br>";
   }

   del({ tokens }: Tokens["Del"]): string {
      return `<del>${this.parser.parseInline(tokens)}</del>`;
   }

   link({ href, title, tokens }: Tokens["Link"]): string {
      const text = this.parser.parseInline(tokens);
      const cleanHref = cleanUrl(href);
      if (cleanHref === null) {
         return text;
      }
      const attrs: HTMLAttrs = [["href", cleanHref]];
      if (title) attrs.push(["title", escape(title)]);
      return injectHtmlAttributes(`<a>${text}</a>`, attrs);
   }

   image({ href, title, tokens }: Tokens["Image"]): string {
      const text = this.parser.parseInline(tokens, this.parser.textRenderer);
      const cleanHref = cleanUrl(href);
      if (cleanHref === null) {
         return escape(text);
      }
      const attrs: HTMLAttrs = [
         ["src", fixLocalImageHref(cleanHref, this.pantsdown.config)],
         ["alt", escape(text)],
      ];
      if (title) attrs.push(["title", escape(title)]);
      return injectHtmlAttributes("<img>", attrs);
   }

   footnoteRef(token: Tokens["FootnoteRef"]) {
      const encodedLabel = encodeURIComponent(token.label);

      return `<sup><a id="footnote-ref-${encodedLabel}" href="#${
         "footnote-" + encodedLabel
      }" data-footnote-ref aria-describedby="footnote-label">${token.label}</a></sup>`;
   }

   footnotes(token: Tokens["Footnotes"]) {
      if (!token.items.length) return "";

      const body = token.items.reduce((acc, { label, content, sourceMap }) => {
         let footnoteItem = `<li id="footnote-${encodeURIComponent(label)}">\n`;
         footnoteItem += this.parser.parse(content);
         footnoteItem += "</li>\n";

         footnoteItem = injectHtmlAttributes(footnoteItem, [], sourceMap);

         return acc + footnoteItem;
      }, "");

      let footnotesHTML = '<section class="footnotes" data-footnotes>\n';
      footnotesHTML += `<ol>\n${body}\n</ol>\n`;
      footnotesHTML += "</section>\n";

      return footnotesHTML;
   }

   text(token: Tokens["Text"] | Tokens["Escape"] | Tokens["Tag"]): string {
      return "tokens" in token
         ? this.parser.parseInline(token.tokens)
         : "escaped" in token && token.escaped
           ? token.text
           : escape(token.text);
   }

   latexBlock({ text, sourceMap }: Pick<Tokens["LatexBlock"], "text" | "sourceMap">): string {
      try {
         const rendered = renderToString(text, {
            displayMode: true,
            throwOnError: false,
            output: "html",
            trust: false,
         });
         return injectHtmlAttributes(`<div class="katex-block">${rendered}</div>\n`, [], sourceMap);
      } catch {
         return injectHtmlAttributes(
            `<div class="katex-block katex-error"><code>${escape(text)}</code></div>\n`,
            [],
            sourceMap,
         );
      }
   }

   latexInline({ text }: Tokens["LatexInline"]): string {
      try {
         const rendered = renderToString(text, {
            displayMode: false,
            throwOnError: false,
            output: "html",
            trust: false,
         });
         return `<span class="katex-inline">${rendered}</span>`;
      } catch {
         return `<span class="katex-inline katex-error"><code>${escape(text)}</code></span>`;
      }
   }
}
