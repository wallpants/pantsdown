import { expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { Pantsdown } from "../src";
import { Lexer } from "../src/lexer";
import { type Token, type Tokens } from "../src/types";

// Source-line mapping tests. Pantsdown's sourcemaps drive line-start/line-end
// attributes used by github-preview.nvim for scroll sync; a drift anywhere in
// the lexer's line counter corrupts every attribute after the drift point.
//
// Tokens cannot be located by searching the source for their raws: raws are
// mutated after consumption (single-\n spacers merged into earlier tokens,
// blockquote merge rounds, checkbox stripping) and test.md duplicates every
// example inside a code fence. Instead each token's *claim* is verified: the
// source line named by sourceMap[0] must contain the token's first raw line,
// the claimed span must match the raw's newline count, and claimed starts
// must be monotonic in document order. A drifted counter fails the content
// check for essentially every token after the drift point.

function countLines(text: string): number {
   let lines = 1;
   for (const char of text) {
      if (char === "\n") lines++;
   }
   return lines;
}

function trimTrailingNewlines(text: string): string {
   let end = text.length;
   while (end > 0 && text[end - 1] === "\n") end--;
   return text.slice(0, end);
}

type MappedToken = {
   type: string;
   raw: string;
   map: [start: number, end: number];
   /** an alert's first paragraph keeps its raw but its map starts one line later */
   alertFirstChild: boolean;
};

function collectMapped(tokens: (Token | Tokens["Footnote"])[], out: MappedToken[], inAlert = false) {
   tokens.forEach((token, index) => {
      if (token.type === "footnotes") return;
      if ("sourceMap" in token && token.sourceMap) {
         out.push({
            type: token.type,
            raw: token.raw,
            map: token.sourceMap,
            alertFirstChild: inAlert && index === 0,
         });
      }
      if (token.type === "list") {
         collectMapped(token.items, out);
      } else if (token.type === "list_item" || token.type === "blockquote") {
         collectMapped(token.tokens, out);
      } else if (token.type === "alert") {
         collectMapped(token.tokens, out, true);
      }
   });
}

function verifySourceMaps(src: string, label: string) {
   src = src.replace(/\r\n|\r/g, "\n");
   const lexer = new Lexer();
   const tokens = lexer.lex(src);
   const lines = src.split("\n");

   const mainMapped: MappedToken[] = [];
   collectMapped(tokens, mainMapped);
   const footnoteMapped: MappedToken[] = [];
   collectMapped(lexer.footnoteTokens, footnoteMapped);

   // footnote definitions are consumed out of band, so they get their own
   // monotonicity sequence
   for (const mapped of [mainMapped, footnoteMapped]) {
      let previousStart = 1;
      for (const { type, raw, map, alertFirstChild } of mapped) {
         const [start, end] = map;
         const describe = `${label}: ${type} claiming lines ${start}-${end}`;

         // claimed starts must not move backwards in document order
         expect(describe).toBe(
            `${label}: ${type} claiming lines ${Math.max(start, previousStart)}-${end}`,
         );
         previousStart = start;

         // the source line at the claimed start must contain the raw's first
         // line (raws of nested tokens are stripped of `> ` prefixes and list
         // indentation, so substring containment is the right relation; an
         // alert's first child claims the line after its `[!NOTE]` marker)
         const rawLines = raw.split("\n");
         const claimedLine = lines[start - 1] ?? "";
         const expectedLine = (alertFirstChild ? rawLines[1] : rawLines[0])!.trimEnd();
         if (!claimedLine.includes(expectedLine)) {
            expect(`${describe}, but line ${start} is ${JSON.stringify(claimedLine)}`).toBe(
               `${describe}, containing ${JSON.stringify(expectedLine)}`,
            );
         }

         // the claimed span must match the raw's line count exactly — except
         // html blocks, whose end is extended to the closing tag's line once
         // that tag is lexed (pendingHtmlClose), making the raw a lower bound
         const rawSpan = countLines(trimTrailingNewlines(raw)) - 1 - (alertFirstChild ? 1 : 0);
         if (type === "html") {
            expect(end - start).toBeGreaterThanOrEqual(rawSpan);
         } else {
            expect(`${describe} spanning ${end - start}`).toBe(`${describe} spanning ${rawSpan}`);
         }
      }
   }

   return mainMapped.length + footnoteMapped.length;
}

test("sourcemaps match source lines across tests/test.md", async () => {
   const markdown = await Bun.file(import.meta.dir + "/test.md").text();
   const checked = verifySourceMaps(markdown, "test.md");
   expect(checked).toBeGreaterThan(100);
});

const fixturesDir = import.meta.dir + "/marked";
for (const fixture of readdirSync(fixturesDir).filter(
   (file) => file.endsWith(".md") && file !== "README.md",
)) {
   test(`sourcemaps match source lines across marked fixture ${fixture}`, async () => {
      const markdown = await Bun.file(`${fixturesDir}/${fixture}`).text();
      verifySourceMaps(markdown, fixture);
   });
}

test("line-start/line-end attributes for every block type", () => {
   const markdown = [
      "# heading", //        1
      "",
      "paragraph", //        3
      "",
      "- item one", //       5
      "- item two", //       6
      "",
      "> quote", //          8
      "",
      "```js", //           10
      "code();",
      "```", //             12
      "",
      "| a | b |", //       14
      "| - | - |",
      "| 1 | 2 |", //       16
      "",
      "    indented", //    18
      "",
      "<div>html</div>", // 20
      "",
      "last paragraph", //  22
      "",
   ].join("\n");

   const pantsdown = new Pantsdown();
   const { html } = pantsdown.parse(markdown);

   expect(html).toMatch(/<h1[^>]* line-start="1" line-end="1">/);
   expect(html).toContain('<p line-start="3" line-end="3">paragraph</p>');
   expect(html).toContain('<li line-start="5" line-end="5">item one</li>');
   expect(html).toContain('<li line-start="6" line-end="6">item two</li>');
   expect(html).toContain('<p line-start="8" line-end="8">quote</p>');
   expect(html).toMatch(/<pre[^>]* line-start="10" line-end="12">/);
   expect(html).toContain('<tr line-start="14" line-end="14">');
   expect(html).toContain('<tr line-start="16" line-end="16">');
   expect(html).toMatch(/<pre[^>]* line-start="18" line-end="18">/);
   expect(html).toContain('<div line-start="20" line-end="20">html</div>');
   expect(html).toContain('<p line-start="22" line-end="22">last paragraph</p>');
});

test("sourcemaps stay correct after sibling nested lists", () => {
   // regression: a nested list following a sibling nested list used to be
   // lexed with a stale state.top and advanced the line counter (+2 drift
   // for everything after) — see MARKED_SYNC.md Phase 4 finding
   const markdown = [
      "- a", //      1
      "  - a1", //   2
      "- b", //      3
      "  - b1", //   4
      "",
      "after", //    6
      "",
   ].join("\n");

   const pantsdown = new Pantsdown();
   const { html } = pantsdown.parse(markdown);
   expect(html).toContain('<p line-start="6" line-end="6">after</p>');
});
