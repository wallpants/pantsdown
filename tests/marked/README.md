# Marked spec fixtures

Fixtures mirrored from [Marked](https://github.com/markedjs/marked)'s
`test/specs/new/` for upstream fixes that have been ported to Pantsdown (the
current sync baseline is the "Last synced with Marked" note in the root
README). Run by `tests/marked.test.ts`.

Two kinds of fixtures:

- `<name>.md` + `<name>.html` — output is compared against Marked's expected
  HTML after stripping Pantsdown's injected `line-start`/`line-end` attributes
  and trimming per-line whitespace. Used where Pantsdown's rendering matches
  upstream exactly (mostly inline-level fixtures).
- `<name>.md` only — output is snapshot-tested instead. Used for block-level
  fixtures where Pantsdown's GitHub-style renderer intentionally differs from
  Marked's canonical HTML (heading anchors, `class` attributes on lists,
  highlight.js code blocks, `<hr>` vs `<hr />`, ...). The snapshots were
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
- `emoji_strikethrough.html` — upstream's fixture has a stray double space in
  `<del>🏴‍☠️</del>  test` (Marked's own spec comparison is
  whitespace-insensitive; the source has a single space).

When porting a new upstream fix, drop its fixture pair in here: keep upstream's
`.html` if the outputs match, otherwise delete the `.html` and rely on the
snapshot (or adapt it and document the deviation above).
