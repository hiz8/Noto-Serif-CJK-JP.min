# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

This repo produces size-reduced subsets of the [Noto Serif CJK JP](http://www.google.com/get/noto/help/cjk/) typeface. The full OTFs are 20–50 MB; output WOFF2s are ~0.8–1.4 MB because they only carry the glyphs listed under `Letters/` (ASCII, kana, JIS Level-1 kanji, and a curated slice of JIS Level-2). There is no application code — the repo is a build pipeline plus a static demo site.

## Build

```sh
# Prereq: Node 18+ (uses fs/promises). No Python toolchain needed.
npm install

# Place the source Noto Serif CJK JP .otf (or .ttf) files in ./src/ (gitignored)
# Then run the subsetter:
npm start    # equivalent to: node build.js
```

`build.js` does the following:
1. Concatenates every file under `Letters/` in memory — no on-disk temp file.
2. Scans `./src/` for `*.otf` and `*.ttf` source fonts.
3. For each font × each of `sfnt` / `woff` / `woff2`, calls `harfbuzzjs/hb-subset.wasm` directly to subset the input, **dropping the `GSUB`, `GPOS`, `GDEF`, `kern`, `morx`, `mort` tables** via `HB_SUBSET_SETS_DROP_TABLE_TAG` plus the `NO_HINTING | DESUBROUTINIZE | NO_LAYOUT_CLOSURE` flags. The result is wrapped to the requested format via [`fontverter`](https://github.com/papandreou/fontverter) and written as `<name>.min.{ttf,woff,woff2}` into `./dist/`. Per-font failures are logged and the build continues, exiting non-zero only at the end if any target failed. The output preserves the input outline format (CFF/CFF2 for OTF, glyf for TTF) under the `.min.ttf` extension — `.min.ttf` for an OTF source is technically OTF-inside-a-.ttf-named-file, which every browser handles.

Stripping the layout tables is the main extra size lever over a plain subset: CJK GSUB lookups (alternates, vertical forms) and GPOS kerning data dwarf the actual glyph outlines for a small subset, and browsers fall back to default glyph mapping without GSUB/GPOS — fine for horizontal Web body text. Trade-off: vertical writing (`vert`/`vrt2`), a few CJK punctuation alternates, and kerning regress. To restore any of those, narrow `DROP_TABLES` in `build.js`.

There is no test suite and no lint script. `.prettierrc` (`singleQuote`, `trailingComma: all`) is the only style config.

## Repo layout — what's tracked vs generated

- `Letters/` — **source of truth for which glyphs survive subsetting.** Edit these `.txt` files (one per glyph group) to change coverage. Any character added here will be retained; anything not listed will be dropped from the output font.
- `src/` — gitignored. The user drops the upstream `.otf` files here before running the build. Do not commit fonts here.
- `dist/` — gitignored. Build output; do not commit.
- `docs/` — the GitHub Pages demo site (https://hiz8.github.io/Noto-Serif-CJK-JP.min/). `docs/fonts/` contains a *checked-in copy* of the latest built minified fonts so the demo can load them. When you rebuild and want the demo to reflect new output, copy the relevant files from `dist/` into `docs/fonts/`. `docs/en/index.html` is the English variant of the demo.

## Editing the character set

The README's "Packaging Letters" section mirrors the contents of `Letters/`. If you change a `Letters/*.txt` file, update the corresponding code block in `README.md` so the documented coverage matches reality. The size table in the README is also hand-maintained — if a subsetting-rule change moves the output sizes meaningfully, refresh that table too.

## Gotchas

- The harfbuzz wasm has a single linear memory, so `subsetToSfnt()` is cached as a module-level singleton and `main()` drives `buildOne()` strictly sequentially. Parallelizing would corrupt the wasm heap; revisit the singleton if that ever changes.
- `GSUB`/`GPOS`/`GDEF`/`kern`/`morx`/`mort` are dropped by design — the size win is large but the cost is loss of vertical writing (`vert`/`vrt2`), a few CJK punctuation alternates, and kerning. To restore any of those, narrow `DROP_TABLES` in `build.js`.
