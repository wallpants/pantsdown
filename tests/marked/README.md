# Marked spec fixtures

Fixtures mirrored from [Marked](https://github.com/markedjs/marked)'s
`test/specs/new/` for upstream fixes that have been ported to Pantsdown (the
current sync baseline is the "Last synced with Marked" note in the root
README). Run by `tests/marked.test.ts`.

Two kinds of fixtures:

- `<name>.md` + `<name>.html` — output is compared against Marked's expected
  HTML after normalizing Pantsdown's rendering extras (injected
  `line-start`/`line-end` attributes, the empty `class=""` of lists without
  task items, GitHub-style heading anchors, `<hr>` for `<hr />`, the
  highlight.js wrapper of language-less code blocks), trimming per-line
  whitespace and dropping line breaks between tags. Used wherever the
  normalized output matches.
- `<name>.md` only — output is snapshot-tested instead. Used where Pantsdown's
  GitHub-style renderer differs from Marked's canonical HTML beyond that
  normalization (highlighted code, task list markup, ...). The snapshots were
  reviewed against upstream's expected HTML for semantic equivalence when
  added.

Local adaptations of upstream expected HTML (keep when re-syncing):

- `del_strikethrough.html` — the `~~~test~~~` fence renders with Pantsdown's
  highlight.js markup (`hljs language-plaintext`) instead of Marked's
  `language-test~~~`.
- `image_alt.html` — Pantsdown emits `<img ...>` (no self-closing ` />`) and
  escapes `'` as `&#39;` in the alt attribute (upstream's fixture shows raw
  single quotes; Marked's own output escapes them too, but its spec compare is
  entity-insensitive).
- `link_in_link_text.html` — `<img ...>` without the self-closing ` />`, as
  in `image_alt.html`.
- `setext_underline_trailing_tab.html` — the tabs of the lazy `===\t`,
  `---\t` and `=\t=` lines are kept in the paragraph text, as Marked's own
  output has them (upstream's fixture drops them; its spec compare is
  whitespace-insensitive).
- `emoji_strikethrough.html` — upstream's fixture has a stray double space in
  `<del>🏴‍☠️</del>  test` (Marked's own spec comparison is
  whitespace-insensitive; the source has a single space).

Upstream fixes that ship no fixture of their own are covered by fixtures built
from the CommonMark 0.31.2 spec examples they unlock (concatenated, `<img />`
written as `<img>`):

- `link_label_nested_brackets` — examples 512, 520, 528 (marked #4064)
- `link_label_raw_token_precedence` — examples 524, 526, 536, 538 (marked #4066)
- `gfm_protocol_autolinks` — GFM 0.29 examples 633, 634, 635 (marked #4067)

Upstream's per-fixture option front matter (e.g. `gfm: false`) is stripped:
Pantsdown is GFM-only, so a fixture is mirrored only when its behavior also
holds under GFM (`backtick_fence_eof_interrupts_paragraph`,
`tilde_fence_eof_interrupts_paragraph`).

When porting a new upstream fix, drop its fixture pair in here: keep upstream's
`.html` if the outputs match, otherwise delete the `.html` and rely on the
snapshot (or adapt it and document the deviation above).
