import { expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { Pantsdown } from "../src";

// Fixtures mirrored from marked's test/specs — see tests/marked/README.md.
// Fixtures with a .html file are compared against marked's expected output
// (modulo Pantsdown's injected line-start/line-end attributes and per-line
// leading/trailing whitespace); fixtures without one are snapshot-tested.

const fixturesDir = import.meta.dir + "/marked";

function normalize(html: string): string {
   return (
      html
         .replace(/ line-(?:start|end)="\d+"/g, "")
         // lists without task items carry an empty class attribute
         .replace(/<(ul|ol) class=""/g, "<$1")
         // GitHub-style heading anchors
         .replace(
            /<(h[1-6]) style="position: relative;"><span style="position: absolute; top: -50px;" id="[^"]*"><\/span>([\s\S]*?)<a class="anchor octicon-link" href="#[^"]*"><\/a><\/\1>/g,
            "<$1>$2</$1>",
         )
         .replace(/<hr \/>/g, "<hr>")
         .split("\n")
         .map((line) => line.trim())
         .filter((line) => line !== "")
         .join("\n")
   );
}

const fixtures = readdirSync(fixturesDir)
   .filter((file) => file.endsWith(".md") && file !== "README.md")
   .sort();

for (const fixture of fixtures) {
   const name = fixture.slice(0, -3);
   const expectedPath = `${fixturesDir}/${name}.html`;

   test(`marked spec: ${name}`, async () => {
      const pantsdown = new Pantsdown();
      const markdown = await Bun.file(`${fixturesDir}/${fixture}`).text();
      const { html } = pantsdown.parse(markdown);

      if (existsSync(expectedPath)) {
         const expected = await Bun.file(expectedPath).text();
         expect(normalize(html)).toBe(normalize(expected));
      } else {
         expect(html).toMatchSnapshot();
      }
   });
}
