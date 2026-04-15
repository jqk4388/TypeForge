# Acceptance checklist (locked in phase 1)

> Inner loop must not silently delete items; scope changes go back to phase 1/2 with trace.

## Structure / machine-checkable

- [ ] Deliverable is single-file HTML with root `<html lang="zh-CN">`
- [ ] File contains opentype.js CDN reference (script tag or import)
- [ ] File contains Tailwind CSS CDN reference
- [ ] No external local file dependencies (all inline or CDN)
- [ ] HTML validates: opening/closing tags match, no duplicate IDs

## File I/O

- [ ] Can upload a .ttf font file via file input
- [ ] After upload, font metadata (family name, style, version, glyph count) displays correctly
- [ ] Can download the modified font as .ttf
- [ ] Can download the modified font as .woff2 (or at least .woff)
- [ ] Modified font file is valid (can be opened in system font viewer)

## Name Table Editing

- [ ] Name table records are listed with nameID, platformID, langID, and value
- [ ] Can edit a name record value and see the change reflected in the list
- [ ] Quick-edit panel for common nameIDs (1,2,4,5,6) exists
- [ ] Batch find-replace across all name records works

## Metrics Editing

- [ ] hhea table values (ascent, descent, lineGap) are displayed and editable
- [ ] OS/2 table values (sTypoAscender, sTypoDescender, sTypoLineGap, winAscent, winDescent) are displayed and editable
- [ ] vhea table values (vertTypoAscender, vertTypoDescender, vertTypoLineGap) are displayed and editable if present
- [ ] head table unitsPerEm is displayed (read-only or editable with warning)
- [ ] post table values (underlinePosition, underlineThickness) are displayed and editable
- [ ] "Scale all metrics" feature: input a percentage, all numeric metrics scale proportionally

## Character Map (cmap)

- [ ] cmap table shows list of Unicode → glyph name mappings
- [ ] Can search/filter by Unicode codepoint, glyph name, or character
- [ ] Can modify a mapping (change glyph for a given Unicode)
- [ ] Can add a new mapping entry
- [ ] Can delete a mapping entry

## Glyph Viewer

- [ ] Glyph list is browseable (scrollable, with Unicode index or glyph name)
- [ ] Clicking a glyph shows its SVG outline preview
- [ ] Glyph advance width is displayed and editable
- [ ] Glyph leftSideBearing is displayed and editable

## Font Preview — Horizontal + Vertical (CRITICAL)

- [ ] Horizontal preview: text renders using `writing-mode: horizontal-tb` with the loaded font
- [ ] Vertical preview: text renders using `writing-mode: vertical-rl` with the loaded font
- [ ] Preview text is editable (user can type custom text)
- [ ] Preview font size is adjustable via slider or input (8px–200px)
- [ ] Preview background is switchable (at least white/black)
- [ ] Side-by-side comparison mode: horizontal and vertical previews shown simultaneously
- [ ] CJK characters render correctly in vertical mode (top-to-bottom, right-to-left)
- [ ] Preview updates live when metrics or name values change

## Configuration Save / Apply

- [ ] "Save Config" exports all current modifications as a JSON file
- [ ] "Load Config" imports a JSON config and applies changes to the current font
- [ ] "Batch Apply": can select multiple font files and apply a saved config to all
- [ ] At least one preset config template exists (e.g., "CJK vertical metrics fix")
- [ ] Config diff view: shows differences between current font values and loaded config values

## Subset

- [ ] Can input characters or Unicode ranges for subsetting
- [ ] Subset font downloads correctly with only specified glyphs

## TTX Export

- [ ] "Export TTX" generates XML representation of the font
- [ ] TTX output is displayed in a scrollable `<pre>` block

## UI/UX

- [ ] Dark/light theme toggle exists and works
- [ ] Modified fields are visually highlighted (different background/border)
- [ ] Undo/Redo works for at least name and metric edits
- [ ] No JavaScript console errors during normal usage flow
