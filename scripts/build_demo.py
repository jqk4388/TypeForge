#!/usr/bin/env python3
"""
TypeForge Pro — Build static demo for GitHub Pages
Copies frontend assets to dist/ with a landing page.
"""

import os
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, 'dist')


def build():
    if os.path.exists(DIST):
        shutil.rmtree(DIST)
    os.makedirs(DIST)

    # Copy static assets
    for item in ['css', 'js', 'README.md']:
        src = os.path.join(ROOT, item)
        dst = os.path.join(DIST, item)
        if os.path.isdir(src):
            shutil.copytree(src, dst)
        elif os.path.isfile(src):
            shutil.copy2(src, dst)

    # Generate a static landing page
    index_html = '''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>TypeForge Pro v2 — fonttools 字体编辑器</title>
<link rel="stylesheet" href="css/style.css">
</head>
<body data-theme="dark">
<div style="max-width:720px;margin:80px auto;padding:0 24px;text-align:center">
  <h1 style="font-size:36px;font-weight:800;margin-bottom:8px;background:linear-gradient(135deg,#7c5cfc,#2dd4a0);-webkit-background-clip:text;-webkit-text-fill-color:transparent">TypeForge Pro v2</h1>
  <p style="font-size:16px;color:var(--tx-2);margin-bottom:32px">全功能 OpenType 字体编辑器 — 基于 fonttools + Flask</p>

  <div style="background:var(--bg-1);border:1px solid var(--bd);border-radius:12px;padding:24px;text-align:left;margin-bottom:24px">
    <h2 style="font-size:18px;font-weight:700;margin-bottom:12px">功能特性</h2>
    <ul style="font-size:14px;color:var(--tx-1);line-height:2;list-style:none;padding:0">
      <li>📋 字体总览 — 表结构、名称、度量、统计</li>
      <li>🏷️ 名称表编辑 — 增加、修改、批量替换 name 记录</li>
      <li>📏 度量值编辑 — hhea / OS/2 / head / post 五大表</li>
      <li>🔤 字符映射 — cmap 浏览、搜索、添加、删除</li>
      <li>✏️ 字形浏览 — 虚拟滚动网格、多选、批量编辑、导出 SVG/PNG</li>
      <li>🖌️ 矢量编辑 — Paper.js 驱动的贝塞尔曲线编辑器</li>
      <li>⚙️ OpenType 特性 — GPOS/GSUB/GDEF/fvar 完整管理</li>
      <li>👁️ 字体预览 — 横排/竖排、OT 特性开关、变量字体轴</li>
      <li>📦 配置管理 — 保存/加载配置、模板预设、批量应用</li>
      <li>🔧 工具箱 — 子集化、TTX 导出/导入、表浏览</li>
    </ul>
  </div>

  <div style="background:var(--bg-1);border:1px solid var(--bd);border-radius:12px;padding:24px;text-align:left;margin-bottom:24px">
    <h2 style="font-size:18px;font-weight:700;margin-bottom:12px">快速启动</h2>
    <pre style="font-size:13px;color:var(--tx-1);background:var(--bg-0);padding:16px;border-radius:8px;overflow-x:auto"><code># 克隆仓库
git clone https://github.com/YOUR_USERNAME/typeforge-pro.git
cd typeforge-pro

# 安装依赖
pip install fonttools flask flask-cors cairosvg

# 启动服务
python app.py

# 打开浏览器
# http://localhost:5000</code></pre>
  </div>

  <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
    <a href="https://github.com/YOUR_USERNAME/typeforge-pro" style="display:inline-flex;align-items:center;gap:6px;padding:10px 20px;background:var(--bg-1);border:1px solid var(--bd);border-radius:8px;color:var(--tx-0);text-decoration:none;font-size:14px;font-weight:600">
      <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
      GitHub
    </a>
  </div>

  <p style="margin-top:40px;font-size:12px;color:var(--tx-3)">
    TypeForge Pro v2 &mdash; MIT License &mdash; Built with fonttools + Flask + Paper.js
  </p>
</div>
</body>
</html>'''

    with open(os.path.join(DIST, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(index_html)

    print(f"Built static demo in {DIST}/")
    print("  - index.html  (landing page)")
    print(f"  - css/        ({len(os.listdir(os.path.join(DIST, 'css')))} files)")
    print(f"  - js/         ({len(os.listdir(os.path.join(DIST, 'js')))} files)")
    print(f"  - README.md")


if __name__ == '__main__':
    build()
