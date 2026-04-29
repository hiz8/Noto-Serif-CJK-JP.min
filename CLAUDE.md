# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Purpose

This repo produces size-reduced subsets of the [Noto Serif CJK JP](http://www.google.com/get/noto/help/cjk/) typeface. The full OTFs are 20–50 MB; output WOFF2s are ~0.8–1.4 MB because they only carry the glyphs listed under `Letters/` (ASCII, kana, JIS Level-1 kanji, and a curated slice of JIS Level-2). There is no application code — the repo is a build pipeline plus a static demo site.

## Build

```sh
# Prereq: install Python fonttools so `pyftsubset` is on PATH, plus zopfli & brotli
pip install fonttools zopfli brotli

# Place the source Noto Serif CJK JP .otf files in ./src/ (gitignored)
# Then run the subsetter:
node build.js
```

`build.js` does the following:
1. Concatenates every file under `Letters/` into a single temp file `tmpTextFile.txt`.
2. Globs `*.otf` from `./src/`.
3. For each font × each of `ttf` / `woff` / `woff2`, shells out to `pyftsubset` with `--layout-features='*' --no-hinting` (and `--with-zopfli --desubroutinize` for woff/woff2), writing `<name>.min.<ext>` into `./dist/`.
4. Deletes `tmpTextFile.txt` after the last extension of the last font.

There is no `package.json`, no test suite, and no lint script. `.prettierrc` (`singleQuote`, `trailingComma: all`) is the only style config.

## Repo layout — what's tracked vs generated

- `Letters/` — **source of truth for which glyphs survive subsetting.** Edit these `.txt` files (one per glyph group) to change coverage. Any character added here will be retained; anything not listed will be dropped from the output font.
- `src/` — gitignored. The user drops the upstream `.otf` files here before running the build. Do not commit fonts here.
- `dist/` — gitignored. Build output; do not commit.
- `docs/` — the GitHub Pages demo site (https://hiz8.github.io/Noto-Serif-CJK-JP.min/). `docs/fonts/` contains a *checked-in copy* of the latest built minified fonts so the demo can load them. When you rebuild and want the demo to reflect new output, copy the relevant files from `dist/` into `docs/fonts/`. `docs/en/index.html` is the English variant of the demo.

## Editing the character set

The README's "Packaging Letters" section mirrors the contents of `Letters/`. If you change a `Letters/*.txt` file, update the corresponding code block in `README.md` so the documented coverage matches reality. The size table in the README is also hand-maintained — if a subsetting-rule change moves the output sizes meaningfully, refresh that table too.

## Gotchas

- `build.js` writes a temp file (`tmpTextFile.txt`) at the repo root and unlinks it only after the last `pyftsubset` call. A failure mid-build can leave it behind — safe to delete manually.
- The build's exception handler references an undefined `err` (`console.error(err)` inside the `catch (e)`), so a `pyftsubset` failure prints `ReferenceError` instead of the real error. Run the failing `pyftsubset` command by hand to see the actual diagnostic.
- `--layout-features='*'` keeps all OpenType features (kerning, alternates, etc.); dropping it would shrink files further at the cost of typographic features. This is intentional.
