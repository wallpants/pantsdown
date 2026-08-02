---
name: marked-sync
description: Sync Pantsdown with upstream Marked. Reads the "Last synced with Marked" baseline from README.md, finds upstream fixes merged since then, and ports the applicable ones one commit per fix, with mirrored fixtures and sourcemap verification.
---

# Marked sync

Pantsdown is a fork of [Marked](https://github.com/markedjs/marked) with GitHub-style
rendering, source-line maps, and extras (alerts, footnotes, LaTeX). This skill ports
upstream fixes released since the last sync.

## 1. Establish the range

1. Baseline: the "Last synced with Marked [vX.Y.Z]" line in the root `README.md`.
2. Target: latest upstream release — `curl -sL https://api.github.com/repos/markedjs/marked/releases/latest`.
3. List what changed:
   - Release notes per version: `https://api.github.com/repos/markedjs/marked/releases?per_page=100`
     (each fix line links its PR), or
   - `https://api.github.com/repos/markedjs/marked/compare/vX.Y.Z...vA.B.C` filtered to `src/`.
4. For each PR get its patch: `merge_commit_sha` from
   `https://api.github.com/repos/markedjs/marked/pulls/<n>`, then
   `curl -sL https://github.com/markedjs/marked/commit/<sha>.patch`. Ignore `test/`
   and `docs/` hunks except `test/specs/new/` (fixtures to mirror).

## 2. Triage

Skip: CLI, build/packaging, TypeScript type-only changes, extension/hooks API,
async race fixes, browser-compat regex workarounds (e.g. `supportsLookbehind`
fallbacks — Pantsdown targets bun/JSC and uses lookbehind forms directly),
pedantic-mode-only changes (Pantsdown has no pedantic mode; it is GFM-only, so
gfm/commonmark rule variants collapse into one — adopt the GFM variant).

Sequence the rest so rule changes land before fixes that build on them. Before
porting anything, `git log --all -S '<fragment>'` — fixes are sometimes already
cherry-picked under commits that don't mention marked versions.

Maintain a temporary checklist file at the repo root (e.g. `MARKED_SYNC.md`,
gitignored, header "do not commit — delete when done") with one entry per fix,
checked off as ported / marked n/a with a reason. Keep a "working context" section
updated at the end of every session so a fresh session can resume. Delete the file
at the end of the sync, after moving any durable findings into code comments or
this skill.

## 3. File mapping (marked → pantsdown)

- `src/rules.ts` → `src/rules/{block,inline,other,utils}.ts` (`other.ts` mirrors
  upstream's `other` object name-for-name)
- `src/Tokenizer.ts` → `src/tokenizer.ts` (helpers `outputLink`/`splitCells`/`rtrim`/
  `expandTabs`/`trimTrailingBlankLines` live in `src/utils.ts`)
- `src/Lexer.ts` → `src/lexer.ts`; `src/Parser.ts` → `src/parser.ts`;
  `src/Renderer.ts` → `src/renderer.ts`; `src/TextRenderer.ts` → `src/text-renderer.ts`
- `src/Tokens.ts` → `src/types.ts` (a `Tokens` record type + `Token` union, not a namespace)

## 4. Permanent deviations — adapt patches around these, never "fix" them

- `Parser.parse(tokens, top)` keeps the `top` param and consecutive-text-token
  merging (upstream removed both in v17): footnote content relies on it.
- `renderer.tablerow({ text, sourceMapStart })` instead of upstream's
  `tablerow(TableRow)` — per-row line attrs.
- `inline_url`'s domain part is `(?:[a-zA-Z0-9\-]+\.)*[a-zA-Z0-9\-]+\.?` (not
  upstream's nested-quantifier form) — same language, avoids O(n²) under JSC.
  Preserve it through any url-rule change.
- Lookbehind regex forms are used directly; no `supportsLookbehind` fallback.
- Pantsdown extras with no upstream counterpart: alerts, footnotes, latex tokens,
  sourceMap plumbing, task-checkbox `javascript` output, `injectHtmlAttributes`,
  `TextRenderer.footnoteRef`/`latexInline`.

## 5. Source maps — the fork-specific hazard

Tokenizers call `this.lexer.getSourceMap(raw)` once per consumed token; it advances
`lexer.line`, so call order/count matters. Any upstream change to what a tokenizer
consumes (its `raw`) affects line counting — watch list/table/blockquote/heading fixes.
Convention: a raw without a trailing newline leaves the counter ON its last line; the
pending newlines are counted by the following space token. After any raw-affecting
port, `bun test tests/sourcemap.test.ts` must pass — it verifies every token's claimed
lines against the actual source.

## 6. Per-fix loop

1. Port the patch (adapted per §3–§5). Prefer landing a rule in its final
   latest-version form when later fixes in the same range touch the same regex
   (note which later PRs are folded in, in the commit message).
2. Verify with the bare commands `bun run check` then `bun test` — NEVER judge
   success through a pipe (`| tail` masks exit codes); check `$?` of the command itself.
3. Output must stay byte-identical unless the fix intentionally changes rendering.
   If only `line-start`/`line-end` attrs move, verify the new numbers against the
   markdown source before `bun test --update-snapshots`. Review every snapshot diff
   deliberately; describe accepted diffs in the commit message.
4. Mirror the fix's fixture from upstream `test/specs/new/` into `tests/marked/`
   (policy in `tests/marked/README.md`: keep upstream's `.html` when output matches
   after normalization; otherwise `.md`-only snapshot, or adapt the `.html` and
   document it in that README). If the fix has no fixture, build one from the
   CommonMark/GFM spec examples it unlocks. NOTE: `tests/marked` and `tests/test.md`
   are in `.oxfmtrc.json` `ignorePatterns` — oxfmt rewrites markdown fixture content
   (tabs, escapes); never let a formatter touch fixtures, and check `git status`
   after any `bun run format`.
5. One commit per upstream fix: `fix(<area>): port marked vX.Y.Z <title> (#<PR>)`,
   body noting adaptations and n/a hunks. Never `git push`.
6. ReDoS fixes: also add the pathological input to `tests/redos.test.ts` under a
   timing budget.

## 7. Wrap up

- Full `bun run check` + `bun test` green.
- Update the README acknowledgement: "Last synced with Marked vX.Y.Z".
- Delete the temporary checklist file; fold durable findings into this skill.
- Report: fixes ported, fixes skipped (and why), behavior changes accepted.
