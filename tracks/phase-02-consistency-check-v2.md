# Phase 2: Scheme consistency check

## Feature list (common scope)
- Font file I/O (upload/download TTF/OTF/WOFF/WOFF2)
- Full font info display (all tables, statistics)
- Name table full CRUD + batch replace
- Metrics editing (hhea/vhea/OS2/head/post + per-glyph + scale)
- cmap editing (view/search/modify/add/delete)
- Glyph viewer + SVG outline + simple vector drawing tool
- GPOS/GSUB/OpenType feature browsing and editing
- OpenType feature toggle preview
- Horizontal + vertical font preview (side-by-side)
- Config save/load/batch apply/diff
- Subset + TTX export/import
- Dark/light theme, undo/redo, modified highlighting

## Stack (common)
- Backend: Python 3 + Flask + fonttools (+ brotli)
- Frontend: Single-file HTML SPA + Tailwind CSS CDN
- Communication: REST JSON API
- Glyph rendering: SVG (backend fonttools → SVG path, frontend canvas/SVG editing)

## Output type (common)
- Flask app (app.py) + Frontend (index.html)
- Start: `pip install fonttools flask brotli && python app.py`

## Acceptance checklist (common)
- See tracks/phase-01-acceptance-v2.md (all schemes must satisfy same items)

## Scheme–dimension table

| Scheme | Track dir | Dimension | Key differentiator | Note |
|--------|-----------|-----------|-------------------|------|
| A (original) | prompt-a-v2 | 1: abstraction L3 (features + tech) | User's original wording: full fonttools backend, all features | Baseline |
| B (robustness) | prompt-b-v2 | 2: quality emphasis — robustness | Same scope, emphasis on error handling, validation, edge cases | Robust-first |
| C (decomposition) | prompt-c-v2 | 5: decomposition — by feature module | Same scope, phrasing organized by self-contained modules | Modular |

## Per-scheme feature match

### Scheme A features:
All features from spec v2 → match ✓

### Scheme B features:
All features from spec v2 → match ✓
(Emphasis on: API error handling, input validation, graceful degradation for missing tables)

### Scheme C features:
All features from spec v2 → match ✓
(Emphasis on: modular architecture, each panel self-contained)

## Result: pass

All schemes cover identical feature scope, tech stack, output type, and acceptance criteria. Differences are phrasing/emphasis only.
