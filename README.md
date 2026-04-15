# TypeForge Pro v2

基于 **Flask + fonttools** 的全功能浏览器端字体编辑器，支持 OpenType/TrueType 字体的查看、编辑与导出。

无需安装桌面软件，打开浏览器即可编辑 `.ttf`、`.otf`、`.woff`、`.woff2` 字体文件。

---

## 目录

- [功能特性](#功能特性)
- [快速启动](#快速启动)
- [系统要求](#系统要求)
- [项目结构](#项目结构)
- [功能面板详解](#功能面板详解)
  - [字体总览](#字体总览)
  - [名称表编辑](#名称表编辑)
  - [度量值编辑](#度量值编辑)
  - [字符映射编辑](#字符映射编辑)
  - [字形浏览](#字形浏览)
  - [矢量编辑器](#矢量编辑器)
  - [OpenType 特性](#opentype-特性)
  - [字体预览](#字体预览)
  - [配置管理](#配置管理)
  - [工具箱](#工具箱)
- [后端 API 参考](#后端-api-参考)
- [技术架构](#技术架构)
- [快捷键](#快捷键)
- [截图预览](#截图预览)
- [开发指南](#开发指南)
- [许可证](#许可证)

---

## 功能特性

| 类别 | 功能 |
|------|------|
| **字体格式** | 支持 TTF、OTF、WOFF、WOFF2 格式的读取、编辑和导出 |
| **名称表** | 全记录 CRUD、快捷编辑、批量查找替换、人性化语言标签 |
| **度量值** | hhea/vhea/OS/2/head/post 全字段编辑、批量缩放、字段中文释义 |
| **字符映射** | cmap 全表浏览搜索、添加/删除映射 |
| **字形浏览** | SVG 缩略图网格、虚拟滚动懒加载、大图预览、批量编辑度量 |
| **矢量编辑** | Paper.js 专业矢量编辑、节点拖拽、锚点/控制点操作、曲线切换 |
| **OpenType** | GSUB/GPOS 完整编辑、可折叠树形 UI、中文特性标签、Lookup 管理 |
| **字体预览** | 横排 + 竖排实时预览、OT 特性开关、自定义文本/字号/行距 |
| **配置系统** | 配置导出/导入、差异对比、批量应用到多字体、预置模板 |
| **工具** | 子集化、TTX XML 导出/下载、字体表浏览 |
| **矢量编辑器交互** | 滚轮缩放（以鼠标位置为中心）、中键拖拽画布、空格+左键平移 |
| **主题** | 亮色/暗色主题切换，CSS Custom Properties 实现 |

---

## 快速启动

### 1. 安装依赖

```bash
pip install fonttools flask brotli flask-cors
```

> - `fonttools`：核心字体解析库
> - `flask`：Web 框架，提供 API 服务
> - `brotli`：WOFF2 压缩支持
> - `flask-cors`：跨域支持

### 2. 启动服务

```bash
python app.py
```

### 3. 打开浏览器

访问 **http://localhost:5000**

### 4. 开始使用

点击顶部「打开字体」或直接将字体文件拖入页面即可。

---

## 系统要求

- **Python** 3.8+
- **浏览器**：Chrome 80+、Firefox 78+、Edge 80+（需支持 ES Modules、Canvas API）
- **操作系统**：Windows / macOS / Linux

---

## 项目结构

```
TypeForge-Pro-v2/
├── app.py                  # Flask 后端（2200+ 行），30+ REST API 端点
├── index.html              # 前端入口页面，所有面板的 HTML 结构
├── css/
│   └── style.css           # 全局样式（主题变量、组件样式、OTL 树形、字形网格）
├── js/
│   ├── app.js              # 应用入口：初始化、字体上传/下载、拖放处理
│   ├── state.js            # 全局状态管理、API helper、平台/语言查找表
│   ├── theme.js            # 明暗主题切换（CSS 变量方案）
│   ├── navigation.js       # 左侧面板导航切换
│   ├── overview.js         # 字体总览面板（字体信息、表列表、名称摘要）
│   ├── names.js            # 名称表编辑（CRUD、快捷编辑、批量替换）
│   ├── metrics.js          # 度量值编辑（5 张表全字段编辑、批量缩放）
│   ├── cmap.js             # 字符映射编辑（搜索、添加/删除映射）
│   ├── glyphs.js           # 字形浏览（缩略图网格 + 虚拟滚动 + 大图预览）
│   ├── vector.js           # 矢量编辑器（Paper.js 引擎，缩放/平移/节点编辑）
│   ├── otl.js              # OpenType 特性编辑（GSUB/GPOS/GDEF/fvar 可折叠树）
│   ├── preview.js          # 字体预览（横排 + 竖排、OT 特性开关）
│   ├── config.js           # 配置管理（保存/加载/差异/批量应用/预置模板）
│   └── tools.js            # 工具箱（子集化、TTX 导出、表浏览）
└── README.md
```

### 代码规模

| 部分 | 文件数 | 代码行数（约） |
|------|--------|----------------|
| Python 后端 (`app.py`) | 1 | 2200+ |
| 前端 JS | 14 | 3500+ |
| CSS | 1 | 800+ |
| HTML | 1 | 270 |
| **总计** | **17** | **~6800** |

---

## 功能面板详解

### 字体总览

上传字体后自动显示：
- 文件名和基本信息
- 字体包含的所有表（table）列表
- 名称表摘要（字体家族名、版本等）
- 统计信息：字形数、cmap 条目数、是否包含 GPOS/GSUB/GDEF/fvar

### 名称表编辑

完整的 `name` 表编辑器：
- **全记录 CRUD**：添加、修改、删除名称记录
- **人性化显示**：语言编码显示为可读文本（如 "简体中文(中国)" 而非 "0x0804"）
- **快捷编辑**：一键修改常用字段（字体家族名、样式名、版本等）
- **批量替换**：在所有名称记录中查找并替换文本
- **搜索过滤**：按 nameID 或值搜索

### 度量值编辑

支持 5 张核心度量表的完整编辑：

| 表 | 说明 | 关键字段 |
|----|------|----------|
| `hhea` | 水平头表 | ascent, descent, lineGap, advanceWidthMax |
| `vhea` | 垂直头表 | vertTypoAscender, vertTypoDescender, advanceHeightMax |
| `OS/2` | OS/2 及 Windows 指标 | usWeightClass, sTypoAscender, sxHeight, sCapHeight |
| `head` | 字体头 | unitsPerEm, xMin/yMin/xMax/yMax, flags |
| `post` | PostScript | italicAngle, underlinePosition, isFixedPitch |

- 每个字段旁边有 **❓ 帮助图标**，悬停显示中文参数释义
- **批量缩放**：按百分比缩放所有度量值（包括字形 advanceWidth）

### 字符映射编辑

- 显示 cmap 所有字符映射（Unicode、字符、字形名）
- 支持按 Unicode 码位、字形名、实际字符搜索
- 添加/删除字符映射

### 字形浏览

- **缩略图网格**：卡片式展示所有字形，显示 SVG 轮廓预览
- **虚拟滚动**：大量字形时按需加载 SVG，保持流畅
- **大图预览**：点击字形在右侧详情面板查看大图和度量信息
- **批量编辑**：支持 Ctrl+点击多选，批量修改 advanceWidth 和 LSB
- **新建字形**：创建空字形并添加到字体

### 矢量编辑器

基于 [Paper.js](https://paperjs.org/) 的专业矢量字形编辑器：

**编辑工具：**
- **选择**：拖拽锚点和控制点
- **+ 锚点**：在轮廓上添加新的锚点
- **+ 控制点**：添加离曲线控制点
- **删除**：移除选中的点
- **曲线⇄线段**：切换选中点的曲线/直线模式

**画布交互：**
| 操作 | 效果 |
|------|------|
| 鼠标滚轮 | 以鼠标位置为中心缩放画布 |
| 中键拖拽 | 平移画布 |
| 空格 + 左键拖拽 | 平移画布 |
| 适应按钮 | 自动居中并缩放到字形边界 |
| 保存字形 | 将编辑后的轮廓写回字体 |

**右侧信息面板：**
- 当前字形名称、advanceWidth、LSB
- 总点数、轮廓数
- 选中点的坐标和类型

### OpenType 特性

完整的 GSUB/GPOS/GDEF/fvar 表浏览器和编辑器：
- **可折叠树形 UI**：按 Script → Feature → Lookup 层级展开
- **中文特性标签**："连字替换" 代替 "LigatureSubst"，"字距调整" 代替 "kern"
- **Lookup 类型支持**：
  - SingleSubst（单一替换）
  - MultipleSubst（多重替换）
  - AlternateSubst（交替替换）
  - LigatureSubst（连字替换）
  - ContextSubst / ChainContextSubst（上下文替换）
  - 以及 GPOS 的 SinglePos、PairPos 等
- **Lookup 详情**：查看每个子表的具体映射关系
- **编辑操作**：添加 Feature、添加 Lookup、修改子表内容

### 字体预览

实时字体预览功能：
- **横排 + 竖排**：双栏对比显示
- **自定义文本**：输入任意文本进行预览
- **字号调节**：8px - 200px 滑块
- **行距调节**：1.0 - 3.0 倍行距
- **背景色**：白色/黑色/浅灰/深灰
- **OT 特性开关**：一键切换各个 OpenType 特性（liga、kern、calt 等），实时查看效果

### 配置管理

保存和复用字体编辑配置：
- **导出配置**：将当前字体的名称和度量值导出为 JSON
- **导入配置**：加载之前保存的配置文件
- **差异对比**：比较配置与当前字体值的差异
- **批量应用**：将配置同时应用到多个字体文件
- **预置模板**：
  - CJK 竖排优化
  - 等宽修正
  - Web 优化

### 工具箱

实用工具集合：

| 工具 | 说明 |
|------|------|
| **子集化** | 按字符或 Unicode 范围提取字体子集，大幅减小文件体积 |
| **TTX 导出** | 导出字体为 TTX XML 格式，支持单表或全表导出，可下载 .ttx 文件 |
| **表浏览** | 列出并查看字体中所有表的原始 XML 数据 |

---

## 后端 API 参考

所有 API 端点前缀为 `/api/`，使用 JSON 请求/响应格式。

### 基础

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/health` | GET | 健康检查，返回缓存统计 |
| `/api/cache/stats` | GET | SVG 缓存统计信息 |
| `/api/cache/clear` | POST | 清除缓存（可选 prefix 参数） |
| `/api/platform-info` | GET | 获取平台名、语言名、OT 特性名查找表 |

### 字体上传/下载

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/upload` | POST | 上传字体文件（multipart/form-data），返回 session_id |
| `/api/info/<sid>` | GET | 获取字体详细信息 |
| `/api/download/<sid>` | GET | 下载字体（?format=ttf/woff/woff2） |

### 名称表

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/name/<sid>` | GET | 读取所有名称记录 |
| `/api/name/<sid>` | POST | 设置/更新名称记录 |
| `/api/name/<sid>/delete` | POST | 删除名称记录 |
| `/api/name/<sid>/batch-replace` | POST | 批量查找替换 |

### 度量值

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/metrics/<sid>` | GET | 读取所有度量值（hhea/vhea/OS/2/head/post） |
| `/api/metrics/<sid>/<tag>` | POST | 修改指定表的度量值 |
| `/api/metrics/<sid>/scale` | POST | 批量缩放度量值 |

### 字符映射

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/cmap/<sid>` | GET | 读取字符映射表 |
| `/api/cmap/<sid>/search` | GET | 搜索映射（?q=关键词） |
| `/api/cmap/<sid>` | POST | 添加/修改映射 |
| `/api/cmap/<sid>/delete` | POST | 删除映射 |

### 字形

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/glyphs/<sid>` | GET | 字形列表（含 Unicode 映射） |
| `/api/glyphs/<sid>` | POST | 创建新字形 |
| `/api/glyph/<sid>/<name>` | GET | 字形详情（SVG 轮廓、坐标、标志位） |
| `/api/glyph/<sid>/<name>/metrics` | POST | 修改字形度量值 |
| `/api/glyph/<sid>/<name>/outline` | POST | 修改字形轮廓（从矢量编辑器） |
| `/api/glyphs-batch-svg/<sid>` | POST | 批量获取字形 SVG（缩略图用） |
| `/api/glyphs-batch-metrics/<sid>` | POST | 批量修改字形度量值 |

### OpenType 排版

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/otl/<sid>/<tag>` | GET | 读取 GSUB/GPOS 表结构 |
| `/api/otl/<sid>/<tag>/lookup/<idx>` | GET | Lookup 详情 |
| `/api/otl/<sid>/<tag>/lookup/<idx>/subtable/<st>` | POST | 编辑子表 |
| `/api/otl/<sid>/<tag>/feature` | POST | 添加 Feature |
| `/api/otl/<sid>/<tag>/add-lookup` | POST | 添加 Lookup |
| `/api/otl-lookup-detail/<sid>/<tag>/<idx>` | GET | Lookup 详情 + 关联字形 SVG |
| `/api/otl-features/<sid>` | GET | 所有 OT 特性标签列表 |
| `/api/gdef/<sid>` | GET | GDEF 表 |
| `/api/fvar/<sid>` | GET | fvar 表（可变字体轴） |

### 预览

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/preview/<sid>` | GET | 获取字体文件用于 @font-face 预览 |

### 配置

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/config/<sid>` | GET | 导出当前字体配置 |
| `/api/config/<sid>/apply` | POST | 应用配置到字体 |
| `/api/config/<sid>/diff` | POST | 配置差异对比 |
| `/api/batch-apply` | POST | 批量应用配置到多文件 |

### 工具

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/subset/<sid>` | POST | 子集化字体 |
| `/api/ttx/<sid>` | GET | 导出 TTX XML（?table=指定表） |
| `/api/ttx/<sid>/download` | GET | 下载 .ttx 文件 |
| `/api/ttx/<sid>` | POST | 导入 TTX XML |
| `/api/tables/<sid>` | GET | 字体表列表 |
| `/api/table/<sid>/<tag>` | GET | 表的原始 TTX XML 数据 |

---

## 技术架构

### 整体架构

```
┌─────────────────────────────────────────────────────┐
│                   Browser (前端)                      │
│                                                      │
│  index.html ──┬── js/app.js (入口)                   │
│               ├── js/state.js (全局状态 + API)        │
│               ├── js/*.js (各面板模块)                │
│               └── css/style.css (主题 + 组件)         │
│                                                      │
│  Paper.js (矢量编辑引擎)                              │
│  ES Modules (模块化)                                  │
│  CSS Custom Properties (主题)                         │
└──────────────────────┬──────────────────────────────┘
                       │ REST API (JSON)
                       │
┌──────────────────────┴──────────────────────────────┐
│                   Flask (后端)                        │
│                                                      │
│  app.py                                              │
│  ├── fonttools (TTFont, 字形解析, OTL 表)            │
│  ├── fontTools.subset (子集化)                        │
│  ├── SVGPathPen (字形 → SVG 路径)                     │
│  ├── LRU Cache (字形 SVG 缓存, 500 容量)             │
│  └── 临时文件系统 (session 管理)                       │
└─────────────────────────────────────────────────────┘
```

### 核心技术

| 技术 | 用途 | 说明 |
|------|------|------|
| [fonttools](https://github.com/fonttools/fonttools) | 字体解析与编辑 | Python 最强大的字体库，支持所有 OpenType 表 |
| [Flask](https://flask.palletsprojects.com/) | Web 后端 | 轻量级 Python Web 框架，提供 REST API |
| [Paper.js](https://paperjs.org/) | 矢量编辑引擎 | 专业级 Canvas 矢量图形库，用于字形轮廓编辑 |
| ES Modules | 前端模块化 | 原生 JavaScript 模块系统，无构建工具依赖 |
| CSS Custom Properties | 主题系统 | 通过 CSS 变量实现亮/暗主题无缝切换 |
| LRU Cache | 性能优化 | 服务端字形 SVG 路径缓存，避免重复计算 |

### Session 管理

- 上传字体后分配唯一 `session_id`（8 位 UUID）
- 字体对象保存在服务端内存中（`fonts` 字典）
- 临时文件存储在系统临时目录（`typeforge_*` 前缀）
- 下载时自动保存并导出

### 性能优化

- **SVG LRU 缓存**：服务端缓存字形 SVG 路径，避免重复生成（500 条目）
- **批量 SVG 接口**：`/api/glyphs-batch-svg/` 一次请求获取多个字形 SVG
- **虚拟滚动**：字形浏览面板按需加载 SVG 缩略图
- **批量度量更新**：`/api/glyphs-batch-metrics/` 一次请求修改多个字形

---

## 快捷键

| 快捷键 | 位置 | 功能 |
|--------|------|------|
| 空格 + 左键拖拽 | 矢量编辑器 | 平移画布 |
| 鼠标滚轮 | 矢量编辑器 | 缩放画布（以鼠标位置为中心） |
| 中键拖拽 | 矢量编辑器 | 平移画布 |
| Ctrl + 点击 | 字形浏览 | 多选字形 |

---

## 截图预览

> 启动 `python app.py` 后访问 http://localhost:5000 即可体验全部功能。

主要面板布局：

```
┌──────────────────────────────────────────────┐
│ ⬡ TypeForge Pro  [打开字体] [下载] [🌗主题]  │  ← 顶部栏
├────┬─────────────────────────────────────────┤
│ 📋 │                                         │
│ 🏷️ │                                         │
│ 📏 │         工作区面板                       │
│ 🔤 │      （总览/名称/度量/字形...）           │
│ ✏️ │                                         │
│ 🖌️ │                                         │
│ ⚙️ │                                         │
│ 👁️ │                                         │
│ 📦 │                                         │
│ 🔧 │                                         │
├────┴─────────────────────────────────────────┤
└──────────────────────────────────────────────┘
```

---

## 开发指南

### 调试模式

默认开启调试模式。通过环境变量控制：

```bash
# 关闭调试
TYPEFORGE_DEBUG=0 python app.py

# 开启调试（默认）
TYPEFORGE_DEBUG=1 python app.py
```

### 添加新面板

1. 在 `index.html` 的 `<main>` 中添加新的 `<div class="panel">`
2. 在 `<nav class="rail">` 中添加导航按钮
3. 创建对应的 `js/xxx.js` 模块
4. 在 `js/app.js` 中导入新模块
5. 在 `js/navigation.js` 中处理面板切换逻辑

### 添加新 API

在 `app.py` 中添加新的 Flask 路由。参考现有端点的模式：
- 使用 `get_font(session_id)` 获取字体对象
- 返回 `jsonify()` 响应
- 使用 `dbg()` / `log_info()` 记录日志

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `TYPEFORGE_DEBUG` | `1` | 调试模式开关 |
| Flask `port` | 5000 | 在 `app.py` 末尾修改 |

---

## 许可证

MIT License

---

## 致谢

- [fonttools](https://github.com/fonttools/fonttools) — 强大的 Python 字体工具库
- [Paper.js](https://paperjs.org/) — 优秀的矢量图形编辑引擎
- [Flask](https://flask.palletsprojects.com/) — 轻量级 Web 框架
