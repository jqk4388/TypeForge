# Phase 1: TypeForge Pro v2 — fonttools 全功能字体编辑 Web 界面

## 1. Feature List (功能列表)

### A. 字体文件管理
- A1. 上传字体文件（TTF/OTF/WOFF/WOFF2）
- A2. 下载修改后的字体文件（TTF/OTF/WOFF 格式可选）
- A3. 同时加载多个字体文件，侧栏切换
- A4. 字体基本信息全览（所有表、表头摘要、统计信息）

### B. 字体元数据编辑 (name table)
- B1. 查看/编辑 name 表所有记录（nameID 0-255，全平台/语言组合）
- B2. 常用 nameID 快捷编辑
- B3. 批量查找替换
- B4. 添加/删除 name 记录

### C. 度量值编辑 (Metrics)
- C1. hhea/hmtx 表：ascent, descent, lineGap, advanceWidthMax
- C2. vhea/vmtx 表：vertTypoAscender, vertTypoDescender, vertTypoLineGap
- C3. OS/2 表全部字段（sTypo*, winAscent/Descent, xHeight, capHeight, weightClass, widthClass 等）
- C4. head 表：unitsPerEm, xMin/yMin/xMax/yMax, macStyle, flags
- C5. post 表：underlinePosition, underlineThickness, isFixedPitch
- C6. 批量缩放：按比例缩放所有度量值
- C7. 单个字形度量编辑：advance width, LSB, TSB

### D. 字符映射编辑 (cmap table)
- D1. 查看 cmap 全表
- D2. 搜索/筛选（按 Unicode、Glyph name、字符）
- D3. 修改/添加/删除映射

### E. 字形查看与编辑 (Glyph)
- E1. 字形列表浏览（支持按 Unicode/GID/名称排序筛选）
- E2. 字形 SVG 轮廓渲染（贝塞尔曲线精确绘制）
- E3. 字形度量信息显示与编辑
- E4. **简易矢量绘图工具**：
  - E4a. 路径节点拖拽编辑
  - E4b. 添加/删除 on-curve 点和 off-curve 控制点
  - E4c. 线段和曲线切换
  - E4d. 复制/粘贴字形轮廓
  - E4e. 参考字形叠加显示

### F. GPOS/GSUB/OpenType 特性编辑（核心新增）
- F1. GSUB 表浏览：查看所有查找表(Lookup)和特性(Feature)
- F2. GSUB 查找表编辑：支持 SingleSubst, MultipleSubst, AlternateSubst, LigatureSubst, ChainContextSubst, ReverseChainSingleSubst
- F3. GPOS 表浏览：查看所有查找表和特性
- F4. GPOS 查找表编辑：支持 SinglePos, PairPos, CursivePos, MarkBasePos, MarkLigPos, MarkMarkPos, ContextPos, ChainContextPos
- F5. 特性-查找表关联管理
- F6. 脚本/语言系统管理
- F7. 特性标签编辑（如 liga, calt, vert, vrt2, kern 等）
- F8. OpenType 特性预览：输入文本，选择启用的特性，渲染对比

### G. 字体预览（横排 + 竖排）
- G1. 横排预览：writing-mode: horizontal-tb
- G2. 竖排预览：writing-mode: vertical-rl
- G3. 可自定义预览文本、字号(8-200px)、行距、背景色
- G4. 同屏对比模式
- G5. OpenType 特性开关预览（liga, kern, vrt2 等）
- G6. 预览实时更新

### H. GDEF/GVAR/其他高级表
- H1. GDEF 表浏览：字形类别、附加点定义
- H2. 变量字体轴浏览（fvar 表）
- H3. 实例管理（fvar named instances）
- H4. STAT 表浏览编辑
- H5. MVAR 表浏览
- H6. CPAL/COLR 颜色字体表浏览

### I. 配置保存与批量应用
- I1. 保存当前所有修改为 JSON 配置
- I2. 加载 JSON 配置应用
- I3. 批量应用多字体
- I4. 预置模板
- I5. 配置 diff 对比

### J. 子集化与 TTX
- J1. 按字符/Unicode 范围子集化
- J2. TTX XML 导出/导入
- J3. 任意表的二进制 dump 查看

### K. UI/UX
- K1. 深色/浅色主题
- K2. 响应式布局
- K3. 操作历史（Undo/Redo）
- K4. 修改高亮
- K5. 快捷键

## 2. Tech Stack (技术栈)

- **后端**: Python 3 + Flask + fonttools (+ brotli for WOFF2)
- **前端**: HTML/CSS/JS 单页应用（Tailwind CSS CDN）
- **字形渲染**: SVG (后端提取字形轮廓，前端 SVG 渲染 + 矢量编辑)
- **通信**: REST API (JSON)
- **文件处理**: 后端 fonttools 完整读写，前端 fetch 上传下载

## 3. Output Shape

- **后端**: Flask 应用 (app.py)，fonttools API 服务
- **前端**: index.html 单文件 SPA
- **启动方式**: `pip install fonttools flask brotli && python app.py`
- **访问**: http://localhost:5000

## 4. Quality Bar

- 上传 TTF → 查看全表信息 → 编辑 → 预览 → 下载，全流程无报错
- GPOS/GSUB 表可正确浏览和修改，修改后导出的字体 OTL 功能正常
- 矢量编辑器可拖拽节点修改字形轮廓，保存后字形正确
- 横排竖排预览 + OT 特性切换正确渲染
- 配置批量应用正常工作
- API 响应 < 3s（大字体解析允许 < 10s）

## 5. Scope Decisions

**纳入**:
- fonttools 支持的所有表浏览和编辑
- 简易矢量绘图工具（节点拖拽、添加删除、曲线编辑）
- GPOS/GSUB 全类型查找表编辑
- OpenType 特性管理
- 横排+竖排预览
- 配置管理
- 子集化、TTX 互操作

**不纳入** (v2):
- 变量字体轴编辑（仅浏览）
- 颜色字体编辑（仅浏览）
- 字体合并
- 自动 kern 生成
