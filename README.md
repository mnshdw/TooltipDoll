# Tooltip Doll

A lightweight inspector and editor for Battle Brothers `::Const.Strings` tooltip text. Load a `.nut` file, edit the human-friendly text, and preview the parchment-styled tooltip with BBCode formatting.

## Features

- Parses `::Const.Strings.*` assignments from any Squirrel `.nut` file
- Replaces `\n` with real line breaks and renders `[b]`, `[i]`, `[u]`, `[color=#hex]` BBCode
- Approximates in-game styling with the original tooltip parchment art
- Highlights entries that use unknown `::Const.UI.Color.*` tokens
- Generates updated assignments you can copy or download back into your mod file
- Works entirely offline in a modern browser

## Usage

1. Open `index.html` in a browser (Chrome recommended).
2. Use **Load .nut** to choose a file like `perk_strings.nut`.
3. Select any string from the list to edit the friendly text and see the live preview.
4. Copy individual assignments or click **Download updated file** to export the whole file with your changes.

> **Note:** Unknown color constants fall back to a neutral hue and are listed in the notes panel so you can map them manually.

## Development

The page uses vanilla HTML/CSS/JS and references Google Fonts. Tooltip artwork is copied from the base game assets (`tooltip_255_top.png`, `tooltip_255_bottom.png`).
