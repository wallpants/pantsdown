import { expect, test } from "bun:test";
import { Pantsdown } from "../src";

// the javascript output ships as a raw string that is never parsed at build
// time, so execute it against a fake rendered mermaid diagram to catch
// syntax errors and attachment regressions
function runJavascript(javascript: string) {
   // oxlint-disable-next-line typescript/no-implied-eval, typescript/no-unsafe-call
   new Function(javascript)();
}

test("javascript attaches mermaid controls once the svg is rendered", () => {
   const { javascript } = new Pantsdown().parse("");
   document.body.innerHTML =
      '<div class="pantsdown light">' +
      '<pre style="position: relative;" class="mermaid-container mermaid"><svg></svg></pre>' +
      "</div>";

   runJavascript(javascript);

   const pre = document.querySelector("pre.mermaid");
   expect(pre?.querySelector(".mermaid-viewport .mermaid-canvas svg")).toBeTruthy();
   // 4 arrows + zoom in + zoom out + reset in the cluster, plus the popover button
   expect(pre?.querySelectorAll(".mermaid-button").length).toBe(8);
   expect(pre?.querySelector(".mermaid-popover-button")).toBeTruthy();
});

test("javascript rebuilds controls when fed html serialized after a previous setup", () => {
   const { javascript } = new Pantsdown().parse("");
   document.body.innerHTML =
      '<div class="pantsdown light">' +
      '<pre style="position: relative;" class="mermaid-container mermaid"><svg></svg></pre>' +
      "</div>";

   runJavascript(javascript);

   // simulate a consumer memoizing innerHTML post-setup (event listeners are
   // lost in the round-trip) and re-injecting it into a fresh element
   const serialized = document.querySelector("pre.mermaid")?.innerHTML ?? "";
   document.body.innerHTML =
      '<div class="pantsdown light">' +
      '<pre style="position: relative;" class="mermaid-container mermaid">' +
      serialized +
      "</pre></div>";

   runJavascript(javascript);

   const pre = document.querySelector("pre.mermaid");
   expect(pre?.querySelectorAll(".mermaid-viewport").length).toBe(1);
   expect(pre?.querySelectorAll(".mermaid-button").length).toBe(8);
   expect(pre?.querySelectorAll(".mermaid-canvas svg").length).toBe(1);
});

test("renderer emits stable data-mermaid-key with occurrence index", () => {
   const markdown = "```mermaid\ngraph TD\n```\n\n```mermaid\ngraph TD\n```\n";
   const { html } = new Pantsdown().parse(markdown);

   const keys = [...html.matchAll(/data-mermaid-key="([^"]+)"/g)].map((m) => m[1]);
   expect(keys.length).toBe(2);
   // identical diagrams share the hash but get distinct occurrence indexes
   expect(keys[0]?.split("-")[0]).toBe(keys[1]?.split("-")[0]);
   expect(keys[0]).not.toBe(keys[1]);
   // re-parsing yields the same keys (occurrence counter resets per parse)
   expect(new Pantsdown().parse(markdown).html).toContain(`data-mermaid-key="${keys[0]}"`);
});

test("javascript persists pan/zoom per data-mermaid-key and prunes on navigation", () => {
   const { javascript } = new Pantsdown().parse("");
   const diagramHtml = (key: string) =>
      '<div class="pantsdown light">' +
      '<pre style="position: relative;" class="mermaid-container mermaid" data-mermaid-key="' +
      key +
      '"><svg></svg></pre></div>';
   const canvasTransform = () =>
      document.querySelector<HTMLElement>(".mermaid-canvas")!.style.transform;

   document.body.innerHTML = diagramHtml("abc-0");
   runJavascript(javascript);
   document.querySelector<HTMLButtonElement>('[aria-label="Zoom in"]')!.click();
   const zoomed = canvasTransform();
   expect(zoomed).toContain("scale(1.25)");

   // re-render of the same document restores the transform
   document.body.innerHTML = diagramHtml("abc-0");
   runJavascript(javascript);
   expect(canvasTransform()).toBe(zoomed);

   // navigating to a document without the key prunes the stash,
   // so coming back starts from the natural view
   document.body.innerHTML = diagramHtml("other-0");
   runJavascript(javascript);
   document.body.innerHTML = diagramHtml("abc-0");
   runJavascript(javascript);
   expect(canvasTransform()).not.toContain("1.25");
});

test("javascript respects mermaid button config", () => {
   const { javascript } = new Pantsdown({
      renderer: {
         mermaid: {
            buttons: { zoom: false, reset: false, arrows: false, popover: false },
            mouseActions: false,
         },
      },
   }).parse("");
   document.body.innerHTML =
      '<div class="pantsdown light">' +
      '<pre style="position: relative;" class="mermaid-container mermaid"><svg></svg></pre>' +
      "</div>";

   runJavascript(javascript);

   const pre = document.querySelector("pre.mermaid");
   expect(pre?.querySelector(".mermaid-viewport svg")).toBeTruthy();
   expect(pre?.querySelectorAll(".mermaid-button").length).toBe(0);
});
