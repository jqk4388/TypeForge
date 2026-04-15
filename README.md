# TypeForge Pro v2

基于 **Flask + fonttools** 的全功能字体编辑器，支持 fonttools 的所有功能。

## 快速启动

```bash
pip install fonttools flask brotli flask-cors
python app.py
# 打开 http://localhost:5000
```

## 项目结构

```
├── app.py              # Flask + fonttools 后端（30+ API 端点）
├── index.html          # 前端入口（HTML 结构）
├── css/
│   └── style.css       # 全局样式（主题变量、组件样式、OTL树形、字形网格）
├── js/
│   ├── app.js          # 应用入口（初始化、字体上传/下载、拖放）
│   ├── state.js        # 全局状态 + API helper + 平台/语言查找
│   ├── theme.js        # 明暗主题切换
│   ├── navigation.js   # 面板导航
│   ├── overview.js     # 字体总览面板
│   ├── names.js        # 名称表编辑（人性化语言名）
│   ├── metrics.js      # 度量值编辑（❓帮助图标）
│   ├── cmap.js         # 字符映射编辑
│   ├── glyphs.js       # 字形浏览（缩略图网格 + 大图预览）
│   ├── vector.js       # 矢量编辑器（Paper.js）
│   ├── otl.js          # OpenType 特性（可折叠树 + 中文标签）
│   ├── preview.js      # 字体预览（横排+竖排 + OT特性开关）
│   ├── config.js       # 配置管理（保存/加载/差异/批量/预置模板）
│   └── tools.js        # 工具箱（子集化、TTX导出、表浏览）
└── README.md
```

## 功能面板

| 面板 | 功能 | 改进 |
|------|------|------|
| 📋 总览 | 字体信息、表列表、名称摘要 | — |
| 🏷️ 名称表 | 全记录 CRUD、快捷编辑、批量替换 | ✅ **语言编码人性化**（"简体中文(中国)" 代替 "0x0804"） |
| 📏 度量值 | hhea/vhea/OS2/head/post 全字段编辑 | ✅ **❓帮助图标**（悬停显示中文参数解释） |
| 🔤 字符映射 | cmap 全表浏览搜索、映射修改 | — |
| ✏️ 字形浏览 | SVG轮廓预览、advance/LSB编辑 | ✅ **缩略图网格**（卡片式展示，懒加载SVG，大图预览模态框） |
| 🖌️ 矢量编辑 | 节点拖拽、添加/删除、曲线切换 | ✅ **Paper.js 引擎**（专业矢量编辑，滚轮缩放，实时拖拽） |
| ⚙️ OpenType | GSUB/GPOS/GDEF/fvar | ✅ **可折叠树形UI** + **中文标签**（"连字替换" 代替 "LigatureSubst"） |
| 👁️ 预览 | 横排+竖排、OT特性开关 | ✅ 特性标签显示中文名 |
| 📦 配置 | 保存/加载/差异/批量/模板 | — |
| 🔧 工具 | 子集化、TTX导出、表浏览 | — |

## 后端 API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/upload` | POST | 上传字体文件 |
| `/api/download/<sid>` | GET | 下载字体（?format=ttf/woff） |
| `/api/name/<sid>` | GET/POST | 读取/修改名称记录 |
| `/api/name/<sid>/delete` | POST | 删除名称记录 |
| `/api/name/<sid>/batch-replace` | POST | 批量替换名称 |
| `/api/metrics/<sid>` | GET | 读取度量值 |
| `/api/metrics/<sid>/<table>` | POST | 修改度量值 |
| `/api/metrics/<sid>/scale` | POST | 批量缩放度量值 |
| `/api/cmap/<sid>` | GET | 读取字符映射 |
| `/api/cmap/<sid>` | POST | 添加/修改映射 |
| `/api/cmap/<sid>/delete` | POST | 删除映射 |
| `/api/glyphs/<sid>` | GET | 字形列表 |
| `/api/glyph/<sid>/<name>` | GET | 单字形详情 |
| `/api/glyph/<sid>/<name>/metrics` | POST | 修改字形度量 |
| `/api/glyph/<sid>/<name>/outline` | POST | 修改字形轮廓 |
| `/api/otl/<sid>/<table>` | GET | 读取 OTL 表 |
| `/api/otl/<sid>/<table>/feature` | POST | 添加特性 |
| `/api/otl/<sid>/<table>/add-lookup` | POST | 添加 Lookup |
| `/api/otl-lookup-detail/<sid>/<table>/<idx>` | GET | Lookup 详情 |
| `/api/otl-features/<sid>` | GET | 所有特性标签 |
| `/api/gdef/<sid>` | GET | GDEF 表 |
| `/api/fvar/<sid>` | GET | fvar 表 |
| `/api/preview/<sid>` | GET | 预览字体文件 |
| `/api/config/<sid>` | GET | 导出配置 |
| `/api/config/<sid>/apply` | POST | 应用配置 |
| `/api/config/<sid>/diff` | POST | 配置差异对比 |
| `/api/batch-apply` | POST | 批量应用配置 |
| `/api/subset/<sid>` | POST | 子集化 |
| `/api/ttx/<sid>` | GET | TTX XML 导出 |
| `/api/tables/<sid>` | GET | 字体表列表 |
| `/api/platform-info` | GET | 平台/语言/特性名称查找 |

## 关键技术

- **fonttools** — Python 字体解析库，支持所有 OpenType 表
- **Flask** — Python Web 框架，提供 REST API
- **Paper.js** — 矢量绘图引擎，用于字形编辑
- **ES Modules** — 前端模块化架构
- **CSS Custom Properties** — 明暗主题切换
