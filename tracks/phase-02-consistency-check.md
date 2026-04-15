# Phase 2: Multi-Prompt Schemes

## Scheme A — 用户原话 (Baseline)

**Dimension**: 基准（用户原始措辞）

**Prompt**:
帮我做一个字体编辑修改网站，就是给python的fonttools工具写一个好用的界面，实现其修改字体的所有功能，而且要能保存配置复制应用到多个字体，重点要支持横排和竖排的字体预览

---

## Scheme B — 功能+技术详述 (Dimension 1: Abstraction L3)

**Dimension**: 抽象层次 L3（功能+技术栈）

**Prompt**:
Build a single-file HTML web application that serves as a browser-based font editing interface powered by opentype.js (since fonttools is Python-only). The app must support:

1. Font file management: upload TTF/OTF/WOFF files, download modified fonts in multiple formats
2. Metadata editing: full name table editor with quick-edit for common nameIDs (1,2,4,5,6), multi-platform record management, batch find-replace
3. Metrics editing: hhea (ascent/descent/lineGap), vhea (vertTypoAscender/Descender/LineGap), OS/2 (sTypo*/win*), head (unitsPerEm, bbox), post (underline*); with batch scale feature
4. Character map: view/search/filter cmap (Unicode→glyph), add/modify/delete mappings
5. Glyph viewer: browse glyph list, SVG outline preview, edit advance width and LSB
6. **Dual-mode preview (CRITICAL)**: horizontal (`writing-mode: horizontal-tb`) and vertical (`writing-mode: vertical-rl`) text preview side-by-side, with editable preview text, adjustable font size (8-200px), switchable backgrounds
7. Configuration system: save all modifications as JSON, load and apply configs, batch-apply to multiple fonts, preset templates, config diff view
8. Subsetting: input characters/ranges, export subset font
9. TTX export: XML view of font tables

Tech: opentype.js (CDN), Tailwind CSS (CDN), pure vanilla JS, single HTML file, dark/light theme, undo/redo, modified-field highlighting.

---

## Scheme C — 工具开发者视角 (Dimension 4: Role — Senior Tool Developer)

**Dimension**: 角色（资深字体工具开发者）

**Prompt**:
You are a senior font tool developer who has built professional font editing applications for 15 years. Your task is to create a single-file HTML font editing web app that typography professionals will actually want to use daily.

The app must handle the complete font modification workflow:
- Load fonts (TTF/OTF/WOFF), inspect all key tables (name, hhea, vhea, OS/2, head, post, cmap), edit values, and export modified fonts.
- The signature feature is **dual writing-mode preview**: show the font in both horizontal (horizontal-tb) and vertical (vertical-rl) layouts simultaneously, because CJK font designers constantly need to verify both orientations. Preview must support custom text, adjustable size, and background switching.
- Configuration persistence is critical for production workflows: save edit configs as JSON, load them back, batch-apply across multiple font files, and diff current values against saved configs. This saves hours of repetitive work.
- Include subsetting and TTX export for advanced users.

Prioritize: workflow efficiency, clear visual feedback on what changed, dark/light themes, undo support. Use opentype.js for font parsing, Tailwind for styling. Single HTML file, no build step.

---

## Scheme–Dimension Table

| Scheme | Track Dir | Phase-2 Dimension | Note |
|--------|-----------|-------------------|------|
| A | prompt-a | Baseline (user original) | User's exact wording |
| B | prompt-b | Abstraction L3 (features+tech) | Detailed spec with technical specifics |
| C | prompt-c | Role (senior tool dev) | Emphasizes UX and professional workflow |

## Scheme consistency check

Feature list: font upload/download, name table editing (full + quick + batch), metrics editing (hhea/vhea/OS2/head/post + scale), cmap editing, glyph viewer (SVG preview + metrics), horizontal+vertical preview (side-by-side, custom text, size, background), config save/load/batch-apply/diff/presets, subsetting, TTX export, dark/light theme, undo/redo, modified-field highlighting

Stack: opentype.js (CDN), Tailwind CSS (CDN), vanilla JS, single HTML file

Output: Single-file HTML web application

Scheme A features: font editing + config save/batch-apply + horizontal/vertical preview → match ✓
Scheme B features: all 9 feature groups + UX items → match ✓
Scheme C features: complete workflow + dual preview + config persistence + subsetting + TTX → match ✓

Scheme A stack: fonttools→opentype.js implied → match ✓
Scheme B stack: opentype.js + Tailwind + vanilla JS + single HTML → match ✓
Scheme C stack: opentype.js + Tailwind + single HTML → match ✓

Scheme A output: "website" → match ✓
Scheme B output: "single-file HTML web application" → match ✓
Scheme C output: "single-file HTML font editing web app" → match ✓

All schemes satisfy the same acceptance items ✓

Result: pass
