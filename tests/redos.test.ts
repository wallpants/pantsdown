import { expect, test } from "bun:test";
import { Pantsdown } from "../src";

/**
 * Regression guards for the ReDoS / infinite-loop fixes ported from marked
 * (see marked #3560, #3902, #3906, #3918, #3947, #3969, #4013, #4014, #4017)
 * plus the Pantsdown-specific `inline.url` reshape for JSC.
 *
 * Inputs mirror upstream's test/specs/redos suite. The timing budget is
 * deliberately generous (fixed code parses each input in 2-170ms locally);
 * before the fixes these inputs took 0.8s-7.3s, so a budget breach signals a
 * reintroduced quadratic, not a slow machine.
 */

const BUDGET_MS = 500;

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
   const md =
      "[" + Array.from({ length: 15 }, (_, i) => `\`\`\`\`code${i}\`\`\`\``).join(" ");
   const html = parseWithin(md);
   expect(html).toContain("<code>code0</code>");
   expect(html).toContain("<code>code14</code>");
});

test("redos: emStrong left delimiter run (marked #3906)", () => {
   const underscores = "_".repeat(10000);
   const html = parseWithin(underscores + " a", 600);
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

test("redos: tilde paragraph interrupt (marked #4014)", () => {
   const html = parseWithin("intro\n" + "~".repeat(50000));
   expect(html).toContain("intro");
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
