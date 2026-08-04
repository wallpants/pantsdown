import { type PantsdownConfig } from "./types.ts";

const copyButtonScript = `
    /** code copy button */
    document.querySelectorAll("pre").forEach((pre) => {
        const firstElement = pre.firstElementChild;
        if (!firstElement || firstElement.tagName !== "CODE") return;

        const copyButton = document.createElement("button");

        const innerHTML =
            '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="copy-base"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>' +
            '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="green" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="copy-success"><polyline points="20 6 9 17 4 12"/></svg>';

        copyButton.innerHTML = innerHTML;
        copyButton.className = "copy-button";

        pre.appendChild(copyButton);
        copyButton.addEventListener("click", () => {
            if (!pre.firstChild?.textContent) {
                return;
            }

            navigator.clipboard
                .writeText(pre.firstChild.textContent)
                .then(() => {
                    copyButton.classList.add("success");
                    setTimeout(() => {
                        copyButton.classList.remove("success");
                    }, 1000);
                })
                .catch(() => {
                    //
                });
        });
    });
`;

function mermaidScript(config: PantsdownConfig["renderer"]["mermaid"]): string {
   return `
    /** mermaid pan & zoom controls */
    (() => {
        const config = ${JSON.stringify(config)};
        const MIN_SCALE = 0.2;
        const MAX_SCALE = 10;
        const PAN_STEP = 60;

        // pan/zoom state per diagram, keyed by data-mermaid-key. Lives on
        // window so it survives consumers replacing the whole DOM on every
        // update. Pruning to the keys present in the current document resets
        // views on navigation and evicts stale entries.
        const transforms = (window.pantsdownMermaidTransforms ??= new Map());
        {
            const presentKeys = new Set();
            document.querySelectorAll(".mermaid[data-mermaid-key]").forEach((el) => {
                presentKeys.add(el.getAttribute("data-mermaid-key"));
            });
            transforms.forEach((_, key) => {
                if (!presentKeys.has(key)) transforms.delete(key);
            });
        }

        const icon = (paths) =>
            '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            paths +
            "</svg>";

        const icons = {
            up: icon('<path d="m18 15-6-6-6 6"/>'),
            down: icon('<path d="m6 9 6 6 6-6"/>'),
            left: icon('<path d="m15 18-6-6 6-6"/>'),
            right: icon('<path d="m9 18 6-6-6-6"/>'),
            zoomIn: icon('<circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><line x1="11" x2="11" y1="8" y2="14"/><line x1="8" x2="14" y1="11" y2="11"/>'),
            zoomOut: icon('<circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><line x1="8" x2="14" y1="11" y2="11"/>'),
            reset: icon('<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>'),
            popover: icon('<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" x2="14" y1="3" y2="10"/><line x1="3" x2="10" y1="21" y2="14"/>'),
            close: icon('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
        };

        function makeButton(name, title, onClick) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "mermaid-button";
            btn.innerHTML = icons[name];
            btn.title = title;
            btn.setAttribute("aria-label", title);
            btn.addEventListener("click", onClick);
            return btn;
        }

        function attachGestures(viewport, canvas, opts) {
            const state = { x: 0, y: 0, scale: 1 };
            // "reset" returns to this state; the popover overrides it with a
            // fitted & centered transform via setHome
            const home = { x: 0, y: 0, scale: 1 };

            function apply() {
                canvas.style.transform =
                    "translate(" + state.x + "px, " + state.y + "px) scale(" + state.scale + ")";
                if (opts.storeKey) {
                    transforms.set(opts.storeKey, {
                        x: state.x,
                        y: state.y,
                        scale: state.scale,
                    });
                }
            }

            function panBy(dx, dy) {
                state.x += dx;
                state.y += dy;
                apply();
            }

            function zoomAt(factor, originX, originY) {
                const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, state.scale * factor));
                factor = scale / state.scale;
                state.x = originX - (originX - state.x) * factor;
                state.y = originY - (originY - state.y) * factor;
                state.scale = scale;
                apply();
            }

            // canvas coordinates are relative to the viewport's content box;
            // the inline viewport carries the pre's padding, so gesture
            // coordinates (relative to the border box) must be shifted by it
            function contentOrigin() {
                const style = window.getComputedStyle(viewport);
                return {
                    x: parseFloat(style.paddingLeft) || 0,
                    y: parseFloat(style.paddingTop) || 0,
                };
            }

            function zoomBy(factor) {
                const rect = viewport.getBoundingClientRect();
                const origin = contentOrigin();
                zoomAt(factor, rect.width / 2 - origin.x, rect.height / 2 - origin.y);
            }

            function reset() {
                state.x = home.x;
                state.y = home.y;
                state.scale = home.scale;
                apply();
            }

            function setHome(x, y, scale) {
                home.x = x;
                home.y = y;
                home.scale = scale;
                reset();
            }

            // inline diagrams require cmd/ctrl (and can be disabled via config)
            // so plain click & scroll keep selecting text / scrolling the page;
            // the popover captures plain gestures
            const enabled = opts.requireMod ? config.mouseActions : true;
            const modOk = (e) => !opts.requireMod || e.metaKey || e.ctrlKey;

            if (enabled) {
                viewport.addEventListener(
                    "wheel",
                    (e) => {
                        if (!modOk(e)) return;
                        e.preventDefault();
                        const rect = viewport.getBoundingClientRect();
                        const origin = contentOrigin();
                        const delta = e.deltaY * (e.deltaMode === 1 ? 16 : 1);
                        zoomAt(
                            Math.exp(-delta * 0.002),
                            e.clientX - rect.left - origin.x,
                            e.clientY - rect.top - origin.y,
                        );
                    },
                    { passive: false },
                );

                viewport.addEventListener("pointerdown", (e) => {
                    if (e.button !== 0 || !modOk(e)) return;
                    e.preventDefault();
                    viewport.setPointerCapture(e.pointerId);
                    viewport.classList.add("dragging");
                    let lastX = e.clientX;
                    let lastY = e.clientY;
                    const onMove = (ev) => {
                        panBy(ev.clientX - lastX, ev.clientY - lastY);
                        lastX = ev.clientX;
                        lastY = ev.clientY;
                    };
                    const onUp = () => {
                        viewport.classList.remove("dragging");
                        viewport.removeEventListener("pointermove", onMove);
                        viewport.removeEventListener("pointerup", onUp);
                        viewport.removeEventListener("pointercancel", onUp);
                    };
                    viewport.addEventListener("pointermove", onMove);
                    viewport.addEventListener("pointerup", onUp);
                    viewport.addEventListener("pointercancel", onUp);
                });
            }

            // restore the stashed transform so re-renders don't visually
            // move the diagram; home stays identity, so reset still returns
            // to the natural view
            const stored = opts.storeKey ? transforms.get(opts.storeKey) : undefined;
            if (stored) {
                state.x = stored.x;
                state.y = stored.y;
                state.scale = stored.scale;
                apply();
            }

            return { panBy, zoomBy, reset, setHome };
        }

        function buildCluster(controller) {
            const b = config.buttons;
            if (!b.arrows && !b.zoom && !b.reset) return null;

            const cluster = document.createElement("div");
            cluster.className = "mermaid-controls";
            cluster.style.gridTemplateAreas = b.arrows
                ? '". up zin" "left reset right" ". down zout"'
                : '"zin" "reset" "zout"';

            const place = (btn, area) => {
                btn.style.gridArea = area;
                cluster.appendChild(btn);
            };

            if (b.arrows) {
                place(makeButton("up", "Pan up", () => controller.panBy(0, PAN_STEP)), "up");
                place(makeButton("down", "Pan down", () => controller.panBy(0, -PAN_STEP)), "down");
                place(makeButton("left", "Pan left", () => controller.panBy(PAN_STEP, 0)), "left");
                place(makeButton("right", "Pan right", () => controller.panBy(-PAN_STEP, 0)), "right");
            }
            if (b.zoom) {
                place(makeButton("zoomIn", "Zoom in", () => controller.zoomBy(1.25)), "zin");
                place(makeButton("zoomOut", "Zoom out", () => controller.zoomBy(0.8)), "zout");
            }
            if (b.reset) place(makeButton("reset", "Reset view", () => controller.reset()), "reset");

            return cluster;
        }

        function openPopover(el, svg) {
            const root = el.closest(".pantsdown");
            const overlay = document.createElement("div");
            overlay.className = (root ? root.className : "pantsdown") + " mermaid-overlay";

            const panel = document.createElement("div");
            panel.className = "mermaid-panel";
            const viewport = document.createElement("div");
            viewport.className = "mermaid-viewport";
            const canvas = document.createElement("div");
            canvas.className = "mermaid-canvas";
            const clone = svg.cloneNode(true);
            canvas.appendChild(clone);
            viewport.appendChild(canvas);
            panel.appendChild(viewport);
            overlay.appendChild(panel);

            const controller = attachGestures(viewport, canvas, { requireMod: false });
            const cluster = buildCluster(controller);
            if (cluster) panel.appendChild(cluster);

            function onKeydown(e) {
                if (e.key === "Escape") close();
            }
            function close() {
                overlay.remove();
                window.removeEventListener("keydown", onKeydown);
            }

            const closeButton = makeButton("close", "Close", close);
            closeButton.classList.add("mermaid-popover-button");
            panel.appendChild(closeButton);

            window.addEventListener("keydown", onKeydown);
            overlay.addEventListener("pointerdown", (e) => {
                if (e.target === overlay) close();
            });

            document.body.appendChild(overlay);

            // fit the whole diagram inside the viewport (never upscaling past
            // its natural size) and center it; reset returns to this state
            const vp = viewport.getBoundingClientRect();
            const content = clone.getBoundingClientRect();
            if (vp.width > 0 && content.width > 0 && content.height > 0) {
                const pad = 32;
                const scale = Math.max(
                    MIN_SCALE,
                    Math.min(
                        1,
                        (vp.width - pad) / content.width,
                        (vp.height - pad) / content.height,
                    ),
                );
                const x = (vp.width - content.width * scale) / 2 - (content.left - vp.left) * scale;
                const y = (vp.height - content.height * scale) / 2 - (content.top - vp.top) * scale;
                controller.setHome(x, y, scale);
            }
        }

        function setup(el) {
            // prefer the canvas svg: if a consumer re-injects html that was
            // serialized after a previous setup, the diagram svg sits inside
            // the old wrapper and stale button icons are svgs too
            const svg = el.querySelector(".mermaid-canvas svg") ?? el.querySelector("svg");
            if (!svg) return;

            // serialized html loses event listeners, so stale wrappers and
            // controls would be dead and duplicated — remove them and rebuild
            el.querySelectorAll(
                ".mermaid-viewport, .mermaid-controls, .mermaid-popover-button",
            ).forEach((stale) => {
                stale.remove();
            });

            const viewport = document.createElement("div");
            viewport.className = "mermaid-viewport";
            const canvas = document.createElement("div");
            canvas.className = "mermaid-canvas";
            canvas.appendChild(svg);
            viewport.appendChild(canvas);
            el.appendChild(viewport);

            const controller = attachGestures(viewport, canvas, {
                requireMod: true,
                storeKey: el.getAttribute("data-mermaid-key"),
            });
            const cluster = buildCluster(controller);
            if (cluster) el.appendChild(cluster);

            if (config.buttons.popover) {
                const btn = makeButton("popover", "Open in popover", () => openPopover(el, svg));
                btn.classList.add("mermaid-popover-button");
                el.appendChild(btn);
            }
        }

        // mermaid renders asynchronously (the page loads mermaid.js separately),
        // so wait for the svg to replace the diagram source
        function whenRendered(el, cb) {
            if (el.querySelector("svg")) {
                cb();
                return;
            }
            const observer = new MutationObserver(() => {
                if (el.querySelector("svg")) {
                    observer.disconnect();
                    cb();
                }
            });
            observer.observe(el, { childList: true, subtree: true });
        }

        document.querySelectorAll(".mermaid").forEach((el) => {
            if (el.hasAttribute("data-pantsdown-mermaid")) return;
            el.setAttribute("data-pantsdown-mermaid", "");
            whenRendered(el, () => {
                setup(el);
            });
        });

        // grab cursor hint while cmd/ctrl is held over a diagram
        if (config.mouseActions && !window.pantsdownMermaidModListener) {
            window.pantsdownMermaidModListener = true;
            const setMod = (on) => {
                document.documentElement.classList.toggle("pantsdown-mermaid-mod", on);
            };
            window.addEventListener("keydown", (e) => {
                if (e.key === "Meta" || e.key === "Control") setMod(true);
            });
            window.addEventListener("keyup", (e) => {
                if (e.key === "Meta" || e.key === "Control") setMod(false);
            });
            window.addEventListener("blur", () => {
                setMod(false);
            });
        }
    })();
`;
}

export function getJavascript(config: PantsdownConfig): string {
   return copyButtonScript + mermaidScript(config.renderer.mermaid);
}
