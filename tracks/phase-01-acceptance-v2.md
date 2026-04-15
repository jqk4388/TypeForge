# Acceptance checklist v2 (locked in phase 1)

> Inner loop must not silently delete items; scope changes go back to phase 1/2 with trace.

## Structure / machine-checkable

- [x] Flask backend app.py exists and starts without import errors
- [x] Frontend index.html exists with `<html lang="zh-CN">`
- [x] Frontend includes Tailwind CSS CDN
- [x] app.py imports fonttools and Flask successfully
- [x] API endpoint `/api/upload` exists and returns font info
- [x] API endpoint `/api/download` exists and returns binary font
- [x] API endpoint `/api/tables` exists and returns table list
- [x] API endpoint `/api/glyphs` exists and returns glyph list
- [x] API endpoint `/api/glyph/<name>` exists and returns SVG outline
- [x] API endpoint `/api/otl` exists and returns GPOS/GSUB data
- [x] API endpoint `/api/preview` exists for OT feature preview
- [x] CORS configured for local dev

## Font File I/O

- [x] Can upload a .ttf font file via frontend
- [x] After upload, font metadata (family, style, version, glyph count, table list) displays
- [x] Can download modified font as .ttf
- [x] Can download modified font as .woff
- [x] Modified font file is valid (can be re-opened)

## Name Table Editing

- [x] All name records listed with nameID, platformID, langID, value
- [x] Can edit a name record value
- [x] Quick-edit panel for common nameIDs (1,2,4,5,6)
- [x] Batch find-replace across all name records
- [x] Can add a new name record
- [x] Can delete a name record

## Metrics Editing

- [x] hhea, vhea, OS/2, head, post table values displayed and editable
- [x] Single glyph metrics (advance width, LSB) editable
- [x] Scale-all-metrics feature works
- [x] vhea table shows if present

## Character Map (cmap)

- [x] cmap shows Unicode → glyph name mappings
- [x] Can search/filter by codepoint, name, or character
- [x] Can modify a mapping
- [x] Can add/delete a mapping

## Glyph Viewer & Editor

- [x] Glyph list browseable with SVG outline preview
- [x] Glyph advance width / LSB editable
- [x] **Vector drawing tool**: can drag on-curve nodes
- [x] **Vector drawing tool**: can add new on-curve points
- [x] **Vector drawing tool**: can add off-curve control points
- [x] **Vector drawing tool**: can delete points
- [x] **Vector drawing tool**: can switch line/curve segment (toggleCurve tool)
- [x] Glyph outline changes are saved back to font

## GPOS/GSUB/OpenType Features (CRITICAL NEW)

- [x] GSUB table structure displayed (scripts → languages → features → lookups)
- [x] GSUB lookup details displayed with input/output pairs
- [x] Can edit GSUB SingleSubst lookup entries
- [x] Can edit GSUB LigatureSubst lookup entries
- [x] GPOS table structure displayed
- [x] GPOS PairPos (kerning) lookup entries displayed and editable
- [x] Can add new feature tag and associate with lookup
- [x] Can add new lookup to existing feature
- [x] OpenType feature toggle in preview (enable/disable liga, kern, vrt2, etc.)

## Font Preview — Horizontal + Vertical (CRITICAL)

- [x] Horizontal preview: writing-mode: horizontal-tb with loaded font
- [x] Vertical preview: writing-mode: vertical-rl with loaded font
- [x] Preview text editable, font size adjustable (8-200px)
- [x] Side-by-side horizontal + vertical comparison
- [x] CJK vertical rendering correct (top-to-bottom, right-to-left)
- [x] OT features toggle affects preview rendering

## Configuration

- [x] Save config exports JSON with all modifications
- [x] Load config applies changes to current font
- [x] Batch apply to multiple fonts works
- [x] Config diff view shows differences

## Subset & TTX

- [x] Subset by characters/Unicode ranges works
- [x] TTX export displays XML in scrollable view
- [x] TTX import applies changes

## UI/UX

- [x] Dark/light theme toggle works
- [x] Modified fields visually highlighted
- [x] No JavaScript console errors during normal flow
