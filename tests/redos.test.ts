import { expect, test } from "bun:test";
import { Pantsdown } from "../src";

/**
 * Regression guards for the ReDoS / infinite-loop fixes ported from marked
 * (see marked #3560, #3902, #3906, #3918, #3947, #3969, #4013, #4014, #4017,
 * #4040, #4070, #4090, #4103, #4106, #4114, #4196, #4225, #4233, #4274)
 * plus the Pantsdown-specific `inline.url` reshape for JSC.
 *
 * Inputs mirror upstream's test/specs/redos suite. The timing budget is
 * deliberately generous: fixed code parses each input in 0-170ms locally and
 * in up to ~650ms on CI, which runs them at ~5-10x local time. Before the
 * fixes these inputs took 0.4s-2min locally (several seconds or more on CI),
 * so a budget breach signals a reintroduced quadratic, not a slow machine.
 */

const BUDGET_MS = 1500;

function parseWithin(markdown: string, budgetMs = BUDGET_MS): string {
   const pantsdown = new Pantsdown();
   const start = performance.now();
   const { html } = pantsdown.parse(markdown);
   const elapsed = performance.now() - start;
   expect(elapsed).toBeLessThan(budgetMs);
   return html;
}

// warm up module init / regex compilation so budgets measure parsing only
new Pantsdown().parse("warmup");

test("redos: inline link title group (marked #3902)", () => {
   const html = parseWithin("a[b](c".repeat(1000));
   expect(html).toContain("a[b](c");
});

test("redos: backticks in link label without close (marked #3918)", () => {
   const md = "[" + Array.from({ length: 15 }, (_, i) => `\`\`\`\`code${i}\`\`\`\``).join(" ");
   const html = parseWithin(md);
   expect(html).toContain("<code>code0</code>");
   expect(html).toContain("<code>code14</code>");
});

test("redos: emStrong left delimiter run (marked #3906)", () => {
   const underscores = "_".repeat(10000);
   const html = parseWithin(underscores + " a");
   expect(html).toContain(underscores);
});

test("redos: indented code blank line terminates (marked #3947)", () => {
   const html = parseWithin("\t\v\n");
   expect(html).toContain("<pre");
});

test("redos: inline link empty href (marked #4013)", () => {
   const html = parseWithin("[](" + " ".repeat(50000));
   expect(html).toContain("[](");
});

test("redos: html block close at EOF (marked #4014)", () => {
   const html = parseWithin("<!x " + "a>".repeat(50000));
   expect(html).toContain("<!x");
});

test("redos: tilde paragraph interrupt (marked #4014, #4039)", () => {
   // since #4039 the EOF tilde run is an (empty) fence that interrupts the paragraph
   const html = parseWithin("intro\n" + "~".repeat(50000));
   expect(html).toMatch(/<p[^>]*>intro<\/p>/);
});

test("redos: masking escaped punctuation (marked #4017)", () => {
   const html = parseWithin("\\.".repeat(50000));
   expect(html).toContain("...");
});

test("redos: masking codespans (marked #4017 + url reshape for JSC)", () => {
   const html = parseWithin("`x` ".repeat(20000));
   expect(html).toContain("<code>x</code>");
});

test("redos: masking reflinks (marked #4017 + url reshape for JSC)", () => {
   const html = parseWithin("[a]: x\n\n" + "[a] ".repeat(20000));
   expect(html).toContain('<a href="x">a</a>');
});

test("url autolinks still match after domain regex reshape", () => {
   const pantsdown = new Pantsdown();
   const { html } = pantsdown.parse(
      "www.example.com and user@example.com and https://a.b-c.d/e?f=g and www.foo.bar. end",
   );
   expect(html).toContain('<a href="http://www.example.com">www.example.com</a>');
   expect(html).toContain('<a href="mailto:user@example.com">user@example.com</a>');
   expect(html).toContain('<a href="https://a.b-c.d/e?f=g">https://a.b-c.d/e?f=g</a>');
   expect(html).toContain('<a href="http://www.foo.bar">www.foo.bar</a>. end');
});

// The #4040 inputs are coarse guards here: under JSC they took 257ms and 97ms
// before the fix (vs ~60ms/~105ms after), and CI runs them at ~5-9x local time,
// so the budget only catches a catastrophic regression.
test("redos: reflink mask with many definitions (marked #4040)", () => {
   const n = 13000;
   const defs = ["[id]: /url"];
   for (let i = 0; i < n; i++) defs.push(`[unused-${i}]: /${i}`);
   const html = parseWithin(`${"[[x]][id] ".repeat(n)}\n\n${defs.join("\n")}`, 2000);
   expect(html).toContain('<a href="/url">[x]</a> <a href="/url">[x]</a>');
});

test("redos: many footnote definitions and references (marked #4040)", () => {
   const n = 13000;
   let refs = "";
   const defs: string[] = [];
   for (let i = 0; i < n; i++) {
      refs += `[^${i}] `;
      defs.push(`[^${i}]: x`);
   }
   const html = parseWithin(`${refs}\n\n${defs.join("\n")}`, 2000);
   expect(html).toContain('href="#footnote-12999"');
});

test("redos: reflinkSearch escaped brackets (marked #4090)", () => {
   // linear but bounded by the 999-item label cap: ~0.4s locally and ~1s on
   // CI, vs 2.4s locally before the fix
   const html = parseWithin("[" + "\t\\[".repeat(18000) + "[", 3000);
   expect(html).toContain("[" + "\t[".repeat(18000) + "[");
});

test("redos: reflinkSearch escaped bracket pairs (marked #4090)", () => {
   const html = parseWithin("[" + "\t\\[\\]".repeat(14000) + "[", 3000);
   expect(html).toContain("[" + "\t[]".repeat(14000) + "[");
});

test("redos: unterminated inline links (marked #4070)", () => {
   const html = parseWithin("[a](b".repeat(50000));
   expect(html).toContain("[a](b[a](b");
});

test("redos: unicode whitespace in link destination (marked #4106)", () => {
   const html = parseWithin("[](" + "\u00a0".repeat(50000));
   expect(html).toContain("[](\u00a0\u00a0");
});

test("redos: paragraph lines starting with a prefixed html tag (marked #4114)", () => {
   const html = parseWithin("a\n<prefix/>".repeat(10000));
   expect(html).toContain("a\n<prefix/>a\n<prefix/>");
});

test("redos: unmatched emphasis and strikethrough openers (marked #4103)", () => {
   expect(parseWithin("- *".repeat(2000))).toContain("*- *- ");
   expect(parseWithin("+ _".repeat(2000))).toContain("_+ _+ ");
   expect(parseWithin("*x *x ".repeat(2000))).toContain("*x *x *x");
   expect(parseWithin("~x ~x ".repeat(2000))).toContain("~x ~x ~x");
});

test("redos: closer-less delimiter runs (marked #4196)", () => {
   for (const run of [
      "**".repeat(10000),
      "__".repeat(10000),
      "*".repeat(20000),
      "_".repeat(20000),
   ]) {
      expect(parseWithin(run + "x")).toContain(run + "x");
   }
});

test("redos: long local part before @ (marked #4225)", () => {
   expect(parseWithin("a".repeat(50000) + "@")).toContain("a".repeat(50000) + "@");
});

test("redos: alternating indented code and quoted code (marked #4233)", () => {
   expect(parseWithin("    x\n>     y\n".repeat(5000))).toContain("<blockquote>");
});

test("redos: adjacent inline links (marked #4274)", () => {
   expect(parseWithin("[a](b)".repeat(40000))).toContain('<a href="b">a</a><a href="b">a</a>');
});
