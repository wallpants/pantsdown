import { expect, test } from "bun:test";
import { Pantsdown } from "../src";

// https://github.com/oven-sh/bun/issues/4722
test("pantsdown.parse(test.md)", async () => {
   const pantsdown = new Pantsdown({
      renderer: {
         detailsTagDefaultOpen: true,
         relativeImageUrlPrefix: "/__localimage__/",
      },
   });

   const markdown = await Bun.file(import.meta.dir + "/test.md").text();
   const html = pantsdown.parse(markdown);

   expect(html).toMatchSnapshot();
});

test("lexer state does not leak across parse() calls", () => {
   const pantsdown = new Pantsdown();
   // unclosed <code> sets inRawBlock while parsing
   pantsdown.parse("hello <code> world");
   const { html } = pantsdown.parse("a <b> & c");
   expect(html).toContain("&amp; c");
});

test("mermaid fence content is escaped", () => {
   const pantsdown = new Pantsdown();
   const { html } = pantsdown.parse("```mermaid\n</pre><script>alert(1)</script>\n```");
   expect(html).not.toContain("<script>");
   expect(html).toContain("&lt;script&gt;");
});

test("self-closing tag without space keeps its tag name", () => {
   const pantsdown = new Pantsdown();
   const { html } = pantsdown.parse("hello<br/>world");
   expect(html).toContain("<br/>");
});

test("alert with trailing whitespace renders no stray <br>", () => {
   const pantsdown = new Pantsdown();
   const { html } = pantsdown.parse("> [!NOTE]  \n> hello");
   expect(html).toContain("markdown-alert-note");
   expect(html).not.toContain("<br>");
});

test("source maps stay correct after a list followed by a whitespace-only line", () => {
   const pantsdown = new Pantsdown();
   const { html } = pantsdown.parse("- a\n- b\n   \npara\n\n# heading\n");
   expect(html).toContain('<p line-start="4" line-end="4">para</p>');
   expect(html).toMatch(/<h1[^>]*line-start="6" line-end="6"/);
});

test("closing tags receive no injected attributes", () => {
   const pantsdown = new Pantsdown();
   const { html } = pantsdown.parse("<details>\n  <summary>hi</summary>\n\ntext\n\n</details>\n");
   expect(html).toMatch(/<\/details>/);
   expect(html).not.toMatch(/<\/details [^>]/);
});
