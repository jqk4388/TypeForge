# Phase 1: FontForge Web — fonttools 字体编辑 Web 界面

## 1. Feature List (功能列表)

### A. 字体文件管理
- A1. 上传字体文件（TTF/OTF/WOFF/WOFF2）
- A2. 下载修改后的字体文件（TTF/OTF/WOFF/WOFF2 格式可选）
- A3. 同时加载多个字体文件，在侧栏切换
- A4. 字体基本信息展示（文件名、格式、字重、字符数等）

### B. 字体元数据编辑 (name table)
- B1. 查看/编辑 name 表所有记录（nameID 0-255）
- B2. 常用 nameID 快捷编辑：字体族名(1)、子族名(2)、唯一标识(3)、全名(4)、版本(5)、PostScript名(6)、商标(7)、厂商(8)、设计师(9)、描述(10)、许可证(11/13)、许可证URL(12/14)
- B3. 多平台(nameID + platformID + encodingID + langID)记录管理
- B4. 批量替换：在所有 name 记录中查找替换字符串

### C. 度量值编辑 (Metrics)
- C1. 水平度量 (hhea table): ascent, descent, lineGap
- C2. 垂直度量 (vhea table): vertTypoAscender, vertTypoDescender, vertTypoLineGap
- C3. OS/2 table: sTypoAscender, sTypoDescender, sTypoLineGap, winAscent, winDescent
- C4. head table: unitsPerEm, xMin, yMin, xMax, yMax
- C5. post table: underlinePosition, underlineThickness, isFixedPitch
- C6. 批量缩放：按比例缩放所有度量值

### D. 字符映射编辑 (cmap table)
- D1. 查看 cmap 表：Unicode → Glyph name 映射列表
- D2. 搜索/筛选字符（按 Unicode 码位、Glyph name、字符本身）
- D3. 重新映射：修改指定 Unicode 对应的 Glyph
- D4. 添加/删除映射条目

### E. 字形查看 (Glyph Viewer)
- E1. 字形列表浏览（按 Unicode 顺序 / 按 Glyph name 排序）
- E2. 单个字形 SVG 轮廓预览（通过 opentype.js 或手动解析）
- E3. 字形基本信息：advance width, leftSideBearing, 轮廓点数
- E4. 字形度量编辑：advance width, leftSideBearing

### F. 字体预览 (核心功能 — 横排 + 竖排)
- F1. **横排预览**：使用 `writing-mode: horizontal-tb` 渲染自定义文本
- F2. **竖排预览**：使用 `writing-mode: vertical-rl` 渲染自定义文本
- F3. 预览文本可自定义输入（支持中文、日文、韩文、英文等）
- F4. 预览字号可调（8px - 200px 滑块）
- F5. 预览行距可调
- F6. 预览背景色可切换（白/黑/灰/自定义）
- F7. 横排竖排**同屏对比**模式：左右并排同时显示
- F8. 预览中使用 @font-face 动态加载编辑中的字体
- F9. 实时更新：修改度量值后预览即时刷新

### G. 配置保存与批量应用
- G1. 保存当前所有修改为一个 JSON 配置文件
- G2. 加载 JSON 配置文件并应用到当前字体
- G3. 批量应用：选择多个字体文件，一键应用配置
- G4. 配置模板：预置常用配置模板（如：中文竖排优化、等宽修正等）
- G5. 配置 diff：对比当前字体值与配置值的差异

### H. 字体子集化 (Subset)
- H1. 输入要保留的字符/Unicode 范围
- H2. 执行子集化并导出

### I. TTX 互操作
- I1. 导出字体为 TTX (XML) 格式查看
- I2. 从 TTX 导入（高级用户用）

### J. UI/UX
- J1. 深色/浅色主题切换
- J2. 响应式布局（桌面优先，平板可用）
- J3. 操作历史（Undo/Redo）
- J4. 修改标记：已修改的字段高亮显示
- J5. 快捷键支持

## 2. Tech Stack (技术栈)

- **前端框架**: 纯 HTML/CSS/JS 单文件应用（无构建步骤）
- **字体解析**: opentype.js (CDN) — 浏览器端解析字体二进制
- **UI 组件**: Tailwind CSS (CDN)
- **代码高亮**: 无（TTX 查看用 `<pre>` 格式化）
- **状态管理**: 原生 JS (class-based store)
- **文件处理**: File API + ArrayBuffer + Blob download
- **字体预览**: CSS @font-face + writing-mode + opentype.js glyph rendering

> 注意：原需求提到 fonttools，但 fonttools 是 Python 库无法在浏览器端运行。
> 方案选择：使用 **opentype.js** 作为浏览器端字体解析/修改引擎，
> 它覆盖了 fonttools 最常用的功能（name/metrics/cmap/glyph 编辑）。
> 对于 fonttools 独有的高级功能（如 GPOS/GSUB 表编辑），
> 通过导出 TTX → Python 后处理的方式提供扩展路径。

## 3. Output Shape (输出形态)

- **单文件 HTML 应用** (index.html)
- 内联所有 CSS 和 JavaScript
- 通过 CDN 加载 opentype.js 和 Tailwind CSS
- 直接在浏览器打开即可使用，无需服务器

## 4. Quality Bar (质量标准)

- 核心路径可用：上传字体 → 编辑 → 预览 → 下载，流程顺畅无报错
- 横排和竖排预览效果正确，CJK 字符竖排方向正确
- 配置保存/加载/批量应用功能完整
- 度量值修改后导出的字体在本地验证有效
- UI 不卡顿：大字体（>10000 glyphs）列表渲染 <2s
- 无 JavaScript 运行时错误

## 5. Scope Decisions (范围界定)

**纳入**:
- name/hhea/vhea/OS2/head/post/cmap 表的查看和编辑
- 字形列表和度量编辑
- 横排+竖排预览
- 配置保存/加载/批量应用
- 字体子集化
- TTX 导出查看

**不纳入** (v1):
- GPOS/GSUB 高级排版表编辑（需要 fonttools Python 后端）
- 字形轮廓路径编辑（需要完整的矢量编辑器，超出 Web 工具范围）
- 变量字体 (variable fonts) 编辑
- 字体合并功能
