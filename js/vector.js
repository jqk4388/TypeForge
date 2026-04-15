/**
 * TypeForge Pro — Vector Editor v8
 *
 * 核心改进 (v8):
 * 1. 统一使用 svgPath 渲染：从 Paper.js Path segments 提取可编辑点
 *    - 三次贝塞尔曲线正确显示
 *    - 拖拽控制点时曲线实时跟随
 * 2. 复杂字形不再用 TrueType points 二次贝塞尔渲染（连线错乱问题）
 * 3. 保存时将 Paper.js segments 转回 fontTools 兼容格式
 * 4. off-curve 手柄线：渲染 off-curve → on-curve 之间的蓝色连接线
 * 5. 缩放：以鼠标位置为中心，平滑因子 1.08，范围 0.01-128
 * 6. 中键拖拽：button === 1 判断，阻止默认中键行为
 * 7. 空格拖拽：保留
 */
import { $, $$, state, api, toast } from './state.js';

let vecState = {
  glyphName: '',
  svgPath: '',
  bounds: null,
  advanceWidth: 0,
  leftSideBearing: 0,
  points: [],
  endPts: [],
  components: [],
  history: [],
  historyIdx: -1,
  tool: 'select',
  paperScope: null,
  pointItems: [],       // Paper.js items for editable control points (circles)
  mainPathItems: [],    // Paper.js Path items for glyph outline
  handleLineItems: [],   // Paper.js Path items for handle lines (off→on connections)
  refPath: null,
  initialized: false,
  pendingGlyph: null,
  initAttempts: 0,
  // v8: segment-based editing
  useSegments: false,    // true when editing via Paper.js path segments
  segmentPaths: [],      // Paper.js Path objects whose segments we edit
};

/* ══════════════════════════════════════════════════════════════════
   Public API
   ══════════════════════════════════════════════════════════════════ */

export function initVector() {
  $$('.vec-tool').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.vec-tool').forEach(b => b.classList.remove('act'));
      btn.classList.add('act');
      vecState.tool = btn.dataset.tool;
      updateToolCursor();
    });
  });

  $('#vecLoadBtn')?.addEventListener('click', () => {
    const name = $('#vecGlyphSelect')?.value;
    if (name) loadVecGlyph(name);
  });

  $('#vecSaveBtn')?.addEventListener('click', saveVecGlyph);
  $('#vecUndoBtn')?.addEventListener('click', undoVec);
  $('#vecFitBtn')?.addEventListener('click', fitView);
  $('#vecRefBtn')?.addEventListener('click', loadRefGlyph);

  $('#vecAdvance')?.addEventListener('change', async () => {
    if (!state.SID || !vecState.glyphName) return;
    try {
      await api(`/glyph/${state.SID}/${encodeURIComponent(vecState.glyphName)}/metrics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ advanceWidth: +$('#vecAdvance').value })
      });
      toast('Advance width 已更新');
    } catch (e) { toast(e.message, 'err'); }
  });

  // 防抖 resize
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (vecState.initialized && vecState.glyphName) handleResize();
    }, 200);
  });
}

export async function loadVecGlyph(name) {
  if (!state.SID) return;
  try {
    const res = await api(`/glyph/${state.SID}/${encodeURIComponent(name)}`);
    if (!res.ok) throw new Error('Failed to load glyph');
    const data = await res.json();

    vecState.glyphName = name;
    vecState.svgPath = data.path || '';
    vecState.bounds = data.bounds || null;
    vecState.advanceWidth = data.advanceWidth || 0;
    vecState.leftSideBearing = data.leftSideBearing || 0;
    vecState.points = data.points || [];
    vecState.endPts = data.endPtsOfContours || [];
    vecState.components = data.components || [];
    vecState.useSegments = false;
    vecState.segmentPaths = [];
    vecState.history = [JSON.parse(JSON.stringify({ points: vecState.points, endPts: vecState.endPts }))];
    vecState.historyIdx = 0;
    vecState.refPath = null;

    $('#vecGlyphName').textContent = name;
    $('#vecAdvance').value = vecState.advanceWidth;
    $('#vecLSB').textContent = vecState.leftSideBearing;
    $('#vecPointCount').textContent = vecState.points.length;
    $('#vecContourCount').textContent = vecState.endPts.length || (data.numberOfContours || 0);

    if (vecState.components.length > 0) {
      const compInfo = vecState.components.map(c => `${c.glyphName} (${c.x || 0}, ${c.y || 0})`).join(', ');
      $('#vecPointInfo').innerHTML = `<div style="color:var(--warn)">复合字形: ${vecState.components.length} 个组件</div><div style="font-size:11px">${compInfo}</div>`;
    }

    vecState.initAttempts = 0;
    if (!ensurePaperInit()) {
      vecState.pendingGlyph = name;
      setTimeout(() => ensurePaperInit(), 50);
    } else {
      renderVecEditor();
      requestAnimationFrame(() => fitView());
    }
  } catch (e) {
    console.error('[Vector] Load glyph failed:', e);
    toast('加载字形失败: ' + e.message, 'err');
  }
}

export function onVectorPanelVisible() {
  if (!vecState.initialized) {
    vecState.initAttempts = 0;
    setTimeout(() => {
      if (vecState.pendingGlyph || vecState.glyphName) {
        const name = vecState.pendingGlyph || vecState.glyphName;
        vecState.pendingGlyph = null;
        loadVecGlyph(name);
      } else {
        ensurePaperInit();
      }
    }, 150);
  } else if (vecState.glyphName) {
    handleResize();
  }
}

/* ══════════════════════════════════════════════════════════════════
   Paper.js 初始化
   ══════════════════════════════════════════════════════════════════
   关键：不手动设置 canvas.width/height/style，让 Paper.js 自主管理。
   setup(canvas) 会读取 getBoundingClientRect()，自动处理 DPR。
   我们只在之后设 viewSize 确保逻辑尺寸正确。
   */
function ensurePaperInit() {
  const canvas = $('#vecCanvas');
  if (!canvas) { console.warn('[Vector] Canvas not found'); return false; }

  const rect = canvas.getBoundingClientRect();
  const parentRect = canvas.parentElement?.getBoundingClientRect();
  console.log('[Vector] Canvas rect:', rect.width, 'x', rect.height, 'parent:', parentRect?.width, 'x', parentRect?.height);

  // 确定目标尺寸：优先用父容器尺寸（canvas 默认 300x150 是不对的）
  let targetW = rect.width;
  let targetH = rect.height;
  if (parentRect && parentRect.width > targetW) {
    targetW = parentRect.width;
    targetH = parentRect.height;
  }

  if (targetW < 50 || targetH < 50) {
    vecState.initAttempts++;
    if (vecState.initAttempts < 15) setTimeout(() => ensurePaperInit(), 100);
    return false;
  }

  // 已初始化 → 仅同步尺寸
  if (vecState.initialized && vecState.paperScope) {
    handleResize();
    return true;
  }

  try {
    if (typeof paper === 'undefined') {
      toast('Paper.js 未加载', 'err'); return false;
    }

    // ── 初始化 Paper.js ─────────────────────────────────────────
    const ps = new paper.PaperScope();

    // 关键：在 setup() 之前，让 canvas 的 CSS 尺寸与父容器一致
    // Paper.js setup() 会读取 getBoundingClientRect() 来确定逻辑视图大小
    // 并自动处理 DPR（设置 canvas.width/height 为 CSS 尺寸 × DPR）
    canvas.style.width = targetW + 'px';
    canvas.style.height = targetH + 'px';

    ps.setup(canvas);
    vecState.paperScope = ps;

    // setup() 后验证 viewSize — Paper.js 应该已读取 CSS 尺寸
    const actualViewSize = ps.view.viewSize;
    console.log(`[Vector] init — viewSize ${actualViewSize.width}×${actualViewSize.height} (target ${targetW}×${targetH}), DPR ${window.devicePixelRatio || 1}`);

    // 如果 viewSize 不对（Paper.js 缓存了旧 rect），强制修正
    if (Math.abs(actualViewSize.width - targetW) > 2 || Math.abs(actualViewSize.height - targetH) > 2) {
      ps.view.viewSize = new ps.Size(targetW, targetH);
      console.log(`[Vector] viewSize forced to ${targetW}×${targetH}`);
    }

    // ── 缩放常量 ────────────────────────────────────────────────
    const MIN_ZOOM = 0.01;
    const MAX_ZOOM = 128;
    const ZOOM_FACTOR = 1.08; // 每次缩放 8%，更平滑

    // ── 交互状态 ────────────────────────────────────────────────
    let spaceDown = false;
    let panDrag = null;
    let hitResult = null;
    let dragItem = null;

    function applyCursor() {
      if (!canvas) return;
      if (panDrag) { canvas.style.cursor = 'grabbing'; return; }
      if (spaceDown) { canvas.style.cursor = 'grab'; return; }
      switch (vecState.tool) {
        case 'select':     canvas.style.cursor = 'default'; break;
        case 'addOn': case 'addOff': canvas.style.cursor = 'crosshair'; break;
        case 'delete':     canvas.style.cursor = 'not-allowed'; break;
        case 'toggleCurve': canvas.style.cursor = 'pointer'; break;
        default:           canvas.style.cursor = 'default';
      }
    }

    // ── 空格键 pan ──────────────────────────────────────────────
    window.addEventListener('keydown', e => {
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault();
        if (!spaceDown) { spaceDown = true; applyCursor(); }
      }
    });
    window.addEventListener('keyup', e => {
      if (e.code === 'Space') { spaceDown = false; panDrag = null; applyCursor(); }
    });

    const tool = new ps.Tool();

    // ── mousedown ───────────────────────────────────────────────
    tool.onMouseDown = function(event) {
      if (!vecState.paperScope) return;

      // 中键 或 空格+左键 → 启动 pan
      if (event.event.button === 1 || (spaceDown && event.event.button === 0)) {
        event.event.preventDefault();
        panDrag = {
          startProject: event.point.clone(),
          startCenter: ps.view.center.clone()
        };
        canvas.style.cursor = 'grabbing';
        return;
      }

      // 只响应左键（其他按钮忽略）
      if (event.event.button !== 0) return;

      const zoom = ps.view.zoom || 1;
      const threshold = Math.max(8, 16 / zoom);

      if (vecState.tool === 'select') {
        hitResult = null;
        for (let i = vecState.pointItems.length - 1; i >= 0; i--) {
          const item = vecState.pointItems[i];
          if (item && event.point.getDistance(item.position) < threshold) {
            hitResult = { idx: i, item, data: item.data };
            dragItem = item;
            updateVecPointInfo(i);
            break;
          }
        }
      } else if (vecState.tool === 'delete') {
        let minD = Infinity, minI = -1, minData = null;
        for (let i = 0; i < vecState.pointItems.length; i++) {
          const item = vecState.pointItems[i];
          if (item) {
            const d = event.point.getDistance(item.position);
            if (d < minD) { minD = d; minI = i; minData = item.data; }
          }
        }
        if (minD < threshold && minI >= 0) deletePoint(minI, minData);
      } else if (vecState.tool === 'toggleCurve') {
        // toggleCurve only works in TrueType mode
        if (!vecState.useSegments) {
          let minD = Infinity, minI = -1;
          for (let i = 0; i < vecState.pointItems.length; i++) {
            const item = vecState.pointItems[i];
            if (item) {
              const d = event.point.getDistance(item.position);
              if (d < minD) { minD = d; minI = i; }
            }
          }
          if (minD < threshold && minI >= 0) {
            vecState.points[minI].onCurve = !vecState.points[minI].onCurve;
            pushHistory();
            renderVecEditor();
          }
        }
      } else if (vecState.tool === 'addOn' || vecState.tool === 'addOff') {
        const x = Math.round(event.point.x);
        const y = Math.round(-event.point.y);
        vecState.points.push({ x, y, onCurve: vecState.tool === 'addOn' });
        if (vecState.endPts.length > 0) {
          vecState.endPts[vecState.endPts.length - 1] = vecState.points.length - 1;
        } else {
          vecState.endPts.push(vecState.points.length - 1);
        }
        pushHistory();
        renderVecEditor();
        $('#vecPointCount').textContent = vecState.points.length;
      }
    };

    // ── mouseDrag ───────────────────────────────────────────────
    tool.onMouseDrag = function(event) {
      // Pan
      if (panDrag) {
        const delta = panDrag.startProject.subtract(event.point);
        ps.view.center = panDrag.startCenter.add(delta);
        return;
      }

      // 点拖拽
      if (vecState.tool === 'select' && dragItem && hitResult) {
        const d = hitResult.data;

        if (vecState.useSegments && d.type === 'anchor') {
          // ── Segments 模式：拖拽锚点 ──────────────────────────
          const path = vecState.segmentPaths[d.pathIdx];
          if (path && path.segments[d.segIdx]) {
            const seg = path.segments[d.segIdx];
            // 移动 segment 的锚点 + 两个 handle 一起
            const delta = event.delta;
            seg.point = seg.point.add(delta);
            // Handle circles follow
            updateHandleCirclesForSegment(ps, d.pathIdx, d.segIdx);
            ps.view.update();
            updateSegmentPointInfo(d);
          }
        } else if (vecState.useSegments && (d.type === 'handleIn' || d.type === 'handleOut')) {
          // ── Segments 模式：拖拽手柄 ─────────────────────────
          const path = vecState.segmentPaths[d.pathIdx];
          if (path && path.segments[d.segIdx]) {
            const seg = path.segments[d.segIdx];
            if (d.type === 'handleIn') {
              seg.handleIn = seg.handleIn.add(event.delta);
            } else {
              seg.handleOut = seg.handleOut.add(event.delta);
            }
            // Update handle circle positions + handle lines
            updateHandleCirclesForSegment(ps, d.pathIdx, d.segIdx);
            ps.view.update();
            updateSegmentPointInfo(d);
          }
        } else if (!vecState.useSegments && d.type === 'ttPoint') {
          // ── TrueType 模式：拖拽点 ────────────────────────────
          dragItem.position = dragItem.position.add(event.delta);
          const idx = d.idx;
          vecState.points[idx].x = Math.round(dragItem.position.x);
          vecState.points[idx].y = Math.round(-dragItem.position.y);
          updateVecPointInfo(idx);
          // 实时更新轮廓路径 + 手柄线
          updateGlyphOutlineLive(ps);
        }
      }
    };

    // ── mouseUp ─────────────────────────────────────────────────
    tool.onMouseUp = function() {
      if (panDrag) {
        panDrag = null;
        applyCursor();
        return;
      }
      if (vecState.tool === 'select' && dragItem && hitResult) {
        if (vecState.useSegments) {
          pushSegmentHistory();
        } else {
          pushHistory();
        }
      }
      dragItem = null;
      hitResult = null;
    };

    // ── 滚轮缩放（以鼠标位置为中心） ──────────────────────────
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      if (!vecState.paperScope) return;

      const factor = e.deltaY > 0 ? (1 / ZOOM_FACTOR) : ZOOM_FACTOR;
      const newZoom = ps.view.zoom * factor;
      if (newZoom < MIN_ZOOM || newZoom > MAX_ZOOM) return;

      // e.offsetX/Y 是相对于 canvas 元素的 CSS 像素坐标
      // viewToProject 将其转为项目坐标（正确处理 zoom/center）
      const mouseProject = ps.view.viewToProject(
        new ps.Point(e.offsetX, e.offsetY)
      );

      // 以鼠标位置为中心缩放
      ps.view.scale(factor, mouseProject);
    }, { passive: false });

    // ── 阻止中键默认行为 ──────────────────────────────────────
    canvas.addEventListener('mousedown', e => {
      if (e.button === 1) {
        e.preventDefault();
        e.stopPropagation();
      }
    });
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    // ── 辅助线层：用 view.transform 而非重新创建 ──────────────
    // Paper.js 的 view 变换由 matrix 管理，所有项目内容自动跟随
    // 无需手动处理

    vecState.initialized = true;
    vecState.initAttempts = 0;
    updateToolCursor();
    console.log('[Vector] v6 ready (Paper.js managed, smooth zoom, middle-button pan)');
    return true;
  } catch (e) {
    console.error('[Vector] Paper.js init failed:', e);
    toast('矢量编辑器初始化失败: ' + e.message, 'err');
    return false;
  }
}

/* ══════════════════════════════════════════════════════════════════
   Resize 处理
   ══════════════════════════════════════════════════════════════════ */
function handleResize() {
  const canvas = $('#vecCanvas');
  if (!canvas || !vecState.paperScope) return;
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 50 || rect.height < 50) return;

  const ps = vecState.paperScope;

  // 保存当前视图变换
  const oldZoom = ps.view.zoom;
  const oldCenter = ps.view.center.clone();

  // 重新设置视图尺寸（Paper.js 会自动更新 canvas 物理像素）
  ps.view.viewSize = new ps.Size(rect.width, rect.height);

  // 恢复变换（viewSize 变化会重置 zoom/center）
  ps.view.zoom = oldZoom;
  ps.view.center = oldCenter;
  ps.view.update();
}

/* ══════════════════════════════════════════════════════════════════
   渲染
   ══════════════════════════════════════════════════════════════════ */
function renderVecEditor() {
  const ps = vecState.paperScope;
  if (!ps || !vecState.initialized) return;

  ps.project.clear();

  const em = 1000;
  const zoom = ps.view.zoom || 1;

  // strokeWidth 工具函数：clamp 最小值，高倍缩放也能看到
  const sw = (base) => Math.max(base / zoom, 0.3);

  // 重置路径和手柄线引用
  vecState.mainPathItems = [];
  vecState.handleLineItems = [];
  vecState.segmentPaths = [];
  vecState.pointItems = [];

  // ── 背景网格 ─────────────────────────────────────────────────
  for (let i = 0; i <= em; i += 100) {
    const isMajor = (i % 500 === 0);
    const gridColor = isMajor ? 'rgba(128,128,128,0.2)' : 'rgba(128,128,128,0.08)';
    const gridSW = isMajor ? 0.8 : 0.4;
    new ps.Path.Line({
      from: [0, -i], to: [em, -i],
      strokeColor: gridColor, strokeWidth: sw(gridSW)
    });
    new ps.Path.Line({
      from: [i, 0], to: [i, -em],
      strokeColor: gridColor, strokeWidth: sw(gridSW)
    });
  }

  // ── 基线 ─────────────────────────────────────────────────────
  new ps.Path.Line({
    from: [-50, 0], to: [em + 50, 0],
    strokeColor: '#4caf50', strokeWidth: sw(1.2)
  });

  // ── Advance width ────────────────────────────────────────────
  const aw = vecState.advanceWidth || 500;
  new ps.Path.Line({
    from: [aw, 50], to: [aw, -em - 50],
    strokeColor: '#4caf50', strokeWidth: sw(0.6),
    dashArray: [sw(4), sw(4)]
  });

  // ── 度量参考线 ───────────────────────────────────────────────
  const metrics = state.fontInfo?.metrics || {};
  const hhea = metrics.hhea || {};

  if (hhea.ascent) {
    new ps.Path.Line({
      from: [-20, -hhea.ascent], to: [em + 20, -hhea.ascent],
      strokeColor: 'rgba(153,153,153,0.5)', strokeWidth: sw(0.5),
      dashArray: [sw(4), sw(4)]
    });
    new ps.PointText({
      point: [em + 5, -hhea.ascent + 4],
      content: `ascent: ${hhea.ascent}`,
      fillColor: '#888', fontSize: Math.max(10 / zoom, 8)
    });
  }
  if (hhea.descent) {
    new ps.Path.Line({
      from: [-20, -hhea.descent], to: [em + 20, -hhea.descent],
      strokeColor: 'rgba(153,153,153,0.5)', strokeWidth: sw(0.5),
      dashArray: [sw(4), sw(4)]
    });
    new ps.PointText({
      point: [em + 5, -hhea.descent + 4],
      content: `descent: ${hhea.descent}`,
      fillColor: '#888', fontSize: Math.max(10 / zoom, 8)
    });
  }

  // ── 字形轮廓 ─────────────────────────────────────────────────
  let hasPath = false;
  if (vecState.svgPath) {
    hasPath = drawGlyphFromSVGSegments(ps);
  }
  if (!hasPath && vecState.points.length > 0 && vecState.endPts.length > 0) {
    drawGlyphFromPoints(ps);
    renderHandleLines(ps, sw);
  }

  // ── 参考字形 ─────────────────────────────────────────────────
  if (vecState.refPath && vecState.refPath.path) {
    try {
      const refMainPath = new ps.Path();
      refMainPath.pathData = vecState.refPath.path;
      refMainPath.scale(1, -1, new ps.Point(0, 0));
      refMainPath.fillColor = new ps.Color(1, 0.3, 0.3, 0.08);
      refMainPath.strokeColor = 'rgba(255,80,80,0.4)';
      refMainPath.strokeWidth = sw(1);
      refMainPath.dashArray = [sw(3), sw(3)];
    } catch (e) { /* ignore */ }
  }

  // ── 控制点（segments 模式 vs points 模式） ──────────────────
  if (vecState.useSegments) {
    renderSegmentControlPoints(ps, sw);
  } else {
    renderTrueTypeControlPoints(ps, sw);
  }

  ps.view.update();
}

/* ══════════════════════════════════════════════════════════════════
   SVG path 渲染 — segments 模式 (v8)
   
   将 svgPath 拆分为多个子路径（按 M 命令分割），
   每个子路径是一个独立的 Paper.js Path。
   然后从 segments 提取控制点，拖拽时直接修改 segment，曲线自动跟随。
   ══════════════════════════════════════════════════════════════════ */
function drawGlyphFromSVGSegments(ps) {
  if (!vecState.svgPath) return false;
  const pathStr = vecState.svgPath;
  if (!pathStr || pathStr.length < 3) return false;

  try {
    // 按 M 命令拆分为多个子路径
    const subPaths = splitSVGPathByMoveTo(pathStr);
    if (subPaths.length === 0) return false;

    vecState.useSegments = true;
    vecState.segmentPaths = [];

    for (const subPathStr of subPaths) {
      if (subPathStr.length < 3) continue;
      try {
        const p = new ps.Path();
        p.pathData = subPathStr;
        p.scale(1, -1, new ps.Point(0, 0));
        p.fillColor = new ps.Color(0.486, 0.361, 0.988, 0.15);
        p.strokeColor = '#7c5cfc';
        p.strokeWidth = 1.5;
        vecState.segmentPaths.push(p);
        vecState.mainPathItems.push(p);
      } catch (e) {
        console.warn('[Vector] Sub-path parse failed:', e.message);
      }
    }

    return vecState.segmentPaths.length > 0;
  } catch (e) {
    console.warn('[Vector] SVG segment init failed:', e.message);
    vecState.useSegments = false;
    return false;
  }
}

/** Split a compound SVG path into individual sub-paths by M commands */
function splitSVGPathByMoveTo(d) {
  const result = [];
  let current = '';
  const len = d.length;

  for (let i = 0; i < len; i++) {
    const ch = d[i];
    // Detect M or m (but not if preceded by a digit - part of a number)
    if ((ch === 'M' || ch === 'm') && (i === 0 || /[\s,;Zz]/.test(d[i - 1]))) {
      if (current.length > 2) result.push(current);
      current = ch;
    } else {
      current += ch;
    }
  }
  if (current.length > 2) result.push(current);
  return result;
}

/** Render control points from Paper.js path segments */
function renderSegmentControlPoints(ps, sw) {
  vecState.pointItems = [];

  for (let pi = 0; pi < vecState.segmentPaths.length; pi++) {
    const path = vecState.segmentPaths[pi];
    if (!path || !path.segments) continue;

    for (let si = 0; si < path.segments.length; si++) {
      const seg = path.segments[si];
      const anchor = seg.point;

      // 锚点 (on-curve)
      const onR = Math.max(5 / (ps.view.zoom || 1), 2);
      const anchorCircle = new ps.Path.Circle({
        center: anchor,
        radius: onR,
        fillColor: '#7c5cfc',
        strokeColor: '#fff',
        strokeWidth: Math.max(1 / (ps.view.zoom || 1), 0.5)
      });
      // Store metadata for drag handling
      anchorCircle.data = {
        type: 'anchor',
        pathIdx: pi,
        segIdx: si
      };
      vecState.pointItems.push(anchorCircle);

      // 控制手柄 (off-curve handles)
      if (seg.handleIn && !seg.handleIn.isZero()) {
        const inPos = anchor.add(seg.handleIn);
        const offR = Math.max(4 / (ps.view.zoom || 1), 2);
        const handleCircle = new ps.Path.Circle({
          center: inPos,
          radius: offR,
          fillColor: '#f59e0b',
          strokeColor: '#fff',
          strokeWidth: Math.max(0.8 / (ps.view.zoom || 1), 0.4)
        });
        handleCircle.data = {
          type: 'handleIn',
          pathIdx: pi,
          segIdx: si
        };
        vecState.pointItems.push(handleCircle);

        // 手柄线
        const line = new ps.Path.Line({
          from: anchor,
          to: inPos,
          strokeColor: 'rgba(124, 92, 252, 0.4)',
          strokeWidth: sw(0.6)
        });
        vecState.handleLineItems.push(line);
      }

      if (seg.handleOut && !seg.handleOut.isZero()) {
        const outPos = anchor.add(seg.handleOut);
        const offR = Math.max(4 / (ps.view.zoom || 1), 2);
        const handleCircle = new ps.Path.Circle({
          center: outPos,
          radius: offR,
          fillColor: '#f59e0b',
          strokeColor: '#fff',
          strokeWidth: Math.max(0.8 / (ps.view.zoom || 1), 0.4)
        });
        handleCircle.data = {
          type: 'handleOut',
          pathIdx: pi,
          segIdx: si
        };
        vecState.pointItems.push(handleCircle);

        // 手柄线
        const line = new ps.Path.Line({
          from: anchor,
          to: outPos,
          strokeColor: 'rgba(124, 92, 252, 0.4)',
          strokeWidth: sw(0.6)
        });
        vecState.handleLineItems.push(line);
      }
    }
  }
}

/** Render control points from TrueType point array */
function renderTrueTypeControlPoints(ps, sw) {
  vecState.pointItems = [];
  const zoom = ps.view.zoom || 1;

  vecState.points.forEach((p, i) => {
    const onCurveR = 5;
    const offCurveR = 4;
    const r = Math.max((p.onCurve ? onCurveR : offCurveR) / zoom, 2);
    const circle = new ps.Path.Circle({
      center: [p.x, -p.y],
      radius: r,
      fillColor: p.onCurve ? '#7c5cfc' : '#f59e0b',
      strokeColor: '#fff',
      strokeWidth: Math.max(1 / zoom, 0.5)
    });
    circle.data = { type: 'ttPoint', idx: i };
    vecState.pointItems.push(circle);
  });
}

function parseSVGPath(d) {
  const segments = [];
  const commands = d.match(/[MLQCZmlqcz][^MLQCZmlqcz]*/g) || [];
  for (const cmd of commands) {
    const type = cmd[0];
    const nums = cmd.slice(1).trim().split(/[\s,]+/).filter(s => s).map(Number);
    if (type === 'M' && nums.length >= 2) segments.push({ type: 'M', x: nums[0], y: nums[1] });
    else if (type === 'L' && nums.length >= 2) segments.push({ type: 'L', x: nums[0], y: nums[1] });
    else if (type === 'Q' && nums.length >= 4) segments.push({ type: 'Q', cx: nums[0], cy: nums[1], x: nums[2], y: nums[3] });
    else if (type === 'C' && nums.length >= 6) segments.push({ type: 'C', c1x: nums[0], c1y: nums[1], c2x: nums[2], c2y: nums[3], x: nums[4], y: nums[5] });
    else if (type === 'Z' || type === 'z') segments.push({ type: 'Z' });
  }
  return segments;
}

/* ══════════════════════════════════════════════════════════════════
   从点数据绘制 (TrueType 隐含 on-curve 点算法 v2)
   
   TrueType 规范：
   - 两个相邻 on-curve 之间的 off-curve 作为二次贝塞尔控制点
   - 连续 off-curve 序列：每对之间取中点作为隐含 on-curve 锚点
   - 如果轮廓以 off-curve 开头，回绕到末尾找前一个点建立连接
   ══════════════════════════════════════════════════════════════════ */
function drawGlyphFromPoints(ps) {
  if (!vecState.points.length || !vecState.endPts.length) return;

  for (let ci = 0; ci < vecState.endPts.length; ci++) {
    const start = ci === 0 ? 0 : vecState.endPts[ci - 1] + 1;
    const end = vecState.endPts[ci] + 1;
    const contourPts = vecState.points.slice(start, end);
    if (contourPts.length < 2) continue;

    const n = contourPts.length;

    // Step 1: 找到第一个 on-curve 点作为起始点
    let firstOnCurve = -1;
    for (let k = 0; k < n; k++) {
      if (contourPts[k].onCurve) { firstOnCurve = k; break; }
    }

    // 如果没有任何 on-curve 点（纯 off-curve 轮廓），
    // 所有相邻 off-curve 对之间取中点作为隐含 on-curve
    if (firstOnCurve === -1) {
      drawPureOffCurveContour(ps, contourPts);
      continue;
    }

    const path = new ps.Path();
    path.closed = true;

    // 从第一个 on-curve 点开始遍历
    let i = firstOnCurve;
    // moveTo 第一个 on-curve 点
    path.add([contourPts[i].x, -contourPts[i].y]);
    i = (i + 1) % n;

    while (i !== firstOnCurve) {
      const pt = contourPts[i];

      if (pt.onCurve) {
        // on-curve → 直线到该点
        path.lineTo([pt.x, -pt.y]);
        i = (i + 1) % n;
      } else {
        // off-curve → 收集连续的 off-curve 序列
        const offCurves = [];
        let j = i;
        while (!contourPts[j].onCurve && j !== firstOnCurve) {
          offCurves.push(contourPts[j]);
          j = (j + 1) % n;
        }

        // j 现在指向下一个 on-curve 点
        const anchorPt = contourPts[j];

        // 插值隐含 on-curve 点
        // 段0: 当前 on-curve → 第一个隐含 on-curve (offCurves[0] 与 offCurves[1] 的中点)
        // 段k: 隐含 on-curve[k] → 隐含 on-curve[k+1] (offCurves[k+1] 与 offCurves[k+2] 的中点)
        // 最后一段: 最后隐含 on-curve → anchorPt
        if (offCurves.length === 1) {
          // 单个 off-curve: 直接连到下一个 on-curve 点
          path.quadraticCurveTo(
            [offCurves[0].x, -offCurves[0].y],
            [anchorPt.x, -anchorPt.y]
          );
        } else {
          // 多个 off-curve: 在每对之间插入隐含中点
          // 第一个控制段: 当前位置 → (offCurves[0] + offCurves[1]) / 2
          const midX1 = (offCurves[0].x + offCurves[1].x) / 2;
          const midY1 = (offCurves[0].y + offCurves[1].y) / 2;
          path.quadraticCurveTo([offCurves[0].x, -offCurves[0].y], [midX1, -midY1]);

          // 中间控制段
          for (let k = 1; k < offCurves.length - 1; k++) {
            const midX = (offCurves[k].x + offCurves[k + 1].x) / 2;
            const midY = (offCurves[k].y + offCurves[k + 1].y) / 2;
            path.quadraticCurveTo([offCurves[k].x, -offCurves[k].y], [midX, -midY]);
          }

          // 最后控制段: 最后一个 off-curve → anchorPt
          path.quadraticCurveTo(
            [offCurves[offCurves.length - 1].x, -offCurves[offCurves.length - 1].y],
            [anchorPt.x, -anchorPt.y]
          );
        }

        i = (j + 1) % n;
      }
    }

    path.fillColor = new ps.Color(0.486, 0.361, 0.988, 0.15);
    path.strokeColor = '#7c5cfc';
    path.strokeWidth = 1.5;
    vecState.mainPathItems.push(path);
  }
}

/**
 * 纯 off-curve 轮廓：所有相邻对之间取中点作为隐含 on-curve 锚点
 */
function drawPureOffCurveContour(ps, contourPts) {
  const n = contourPts.length;
  if (n < 2) return;

  const path = new ps.Path();
  path.closed = true;

  // 隐含 on-curve 点列表
  const anchors = [];
  for (let k = 0; k < n; k++) {
    const next = (k + 1) % n;
    anchors.push({
      x: (contourPts[k].x + contourPts[next].x) / 2,
      y: (contourPts[k].y + contourPts[next].y) / 2,
    });
  }

  // 从第一个隐含 on-curve 点开始
  path.add([anchors[0].x, -anchors[0].y]);
  for (let k = 0; k < n; k++) {
    const nextAnchor = anchors[(k + 1) % n];
    path.quadraticCurveTo(
      [contourPts[k].x, -contourPts[k].y],
      [nextAnchor.x, -nextAnchor.y]
    );
  }

  path.fillColor = new ps.Color(0.486, 0.361, 0.988, 0.15);
  path.strokeColor = '#7c5cfc';
  path.strokeWidth = 1.5;
  vecState.mainPathItems.push(path);
}

/* ══════════════════════════════════════════════════════════════════
   手柄线渲染（off-curve → 相邻 on-curve 连接）
   ══════════════════════════════════════════════════════════════════ */
function renderHandleLines(ps, sw) {
  vecState.handleLineItems = [];
  if (!vecState.points.length || !vecState.endPts.length) return;

  for (let ci = 0; ci < vecState.endPts.length; ci++) {
    const start = ci === 0 ? 0 : vecState.endPts[ci - 1] + 1;
    const end = vecState.endPts[ci] + 1;
    const contourPts = vecState.points.slice(start, end);
    if (contourPts.length < 2) continue;

    for (let i = 0; i < contourPts.length; i++) {
      const pt = contourPts[i];
      if (pt.onCurve) continue;

      // 找 off-curve 前一个 on-curve
      let prevIdx = (i - 1 + contourPts.length) % contourPts.length;
      while (prevIdx !== i && !contourPts[prevIdx].onCurve) {
        prevIdx = (prevIdx - 1 + contourPts.length) % contourPts.length;
      }
      if (contourPts[prevIdx].onCurve && prevIdx !== i) {
        const line = new ps.Path.Line({
          from: [contourPts[prevIdx].x, -contourPts[prevIdx].y],
          to: [pt.x, -pt.y],
          strokeColor: 'rgba(124, 92, 252, 0.4)',
          strokeWidth: sw(0.6)
        });
        vecState.handleLineItems.push(line);
      }

      // 找 off-curve 后一个 on-curve
      let nextIdx = (i + 1) % contourPts.length;
      while (nextIdx !== i && !contourPts[nextIdx].onCurve) {
        nextIdx = (nextIdx + 1) % contourPts.length;
      }
      if (contourPts[nextIdx].onCurve && nextIdx !== i && nextIdx !== prevIdx) {
        const line = new ps.Path.Line({
          from: [pt.x, -pt.y],
          to: [contourPts[nextIdx].x, -contourPts[nextIdx].y],
          strokeColor: 'rgba(124, 92, 252, 0.4)',
          strokeWidth: sw(0.6)
        });
        vecState.handleLineItems.push(line);
      }
    }
  }
}

/* ══════════════════════════════════════════════════════════════════
   拖拽时实时更新轮廓 + 手柄线 + 控制点位置
   ══════════════════════════════════════════════════════════════════ */
/** Update outline live during TrueType point drag (segments mode handles its own updates) */
function updateGlyphOutlineLive(ps) {
  if (vecState.useSegments) return; // Segments mode updates path directly

  // 删除旧的路径和手柄线
  for (const p of vecState.mainPathItems) { p.remove(); }
  for (const h of vecState.handleLineItems) { h.remove(); }
  vecState.mainPathItems = [];
  vecState.handleLineItems = [];

  // 重新绘制路径（TrueType points 模式）
  if (vecState.points.length > 0 && vecState.endPts.length > 0) {
    drawGlyphFromPoints(ps);
  }

  // 重新绘制手柄线
  const zoom = ps.view.zoom || 1;
  const sw = (base) => Math.max(base / zoom, 0.3);
  renderHandleLines(ps, sw);

  ps.view.update();
}

/* ══════════════════════════════════════════════════════════════════
   Fit View — 用 zoom/center 直接设置，不多次 scale
   ══════════════════════════════════════════════════════════════════ */
function fitView() {
  const ps = vecState.paperScope;
  if (!ps) return;
  const viewRect = ps.view.element.getBoundingClientRect();
  if (viewRect.width < 50 || viewRect.height < 50) return;

  const bounds = vecState.bounds || [0, -800, 500, 0];
  const glyphW = bounds[2] - bounds[0] || 500;
  const glyphH = Math.abs(bounds[3] - bounds[1]) || 800;

  // 计算合适的缩放比例
  const scale = Math.min(
    viewRect.width / (glyphW + 200),
    viewRect.height / (glyphH + 200)
  ) * 0.85;

  // 字形中心（Y 已翻转）
  const centerX = (bounds[0] + bounds[2]) / 2;
  const centerY = -(bounds[1] + bounds[3]) / 2;

  // 直接设置 zoom 和 center
  ps.view.zoom = scale;
  ps.view.center = new ps.Point(centerX, centerY);
  ps.view.update();
}

/* ══════════════════════════════════════════════════════════════════
   工具函数
   ══════════════════════════════════════════════════════════════════ */

function updateVecPointInfo(idx) {
  if (idx < 0 || idx >= vecState.points.length) {
    $('#vecPointInfo').textContent = '无'; return;
  }
  const p = vecState.points[idx];
  $('#vecPointInfo').innerHTML =
    `索引: ${idx}<br>类型: ${p.onCurve ? 'on-curve (锚点)' : 'off-curve (控制点)'}<br>x: ${p.x}, y: ${p.y}`;
}

function pushHistory() {
  vecState.history = vecState.history.slice(0, vecState.historyIdx + 1);
  vecState.history.push(JSON.parse(JSON.stringify({ points: vecState.points, endPts: vecState.endPts })));
  vecState.historyIdx = vecState.history.length - 1;
  if (vecState.history.length > 50) { vecState.history.shift(); vecState.historyIdx--; }
}

async function loadRefGlyph() {
  if (!state.SID) return;
  const name = prompt('参考字形名称:', '');
  if (!name) return;
  try {
    const res = await api(`/glyph/${state.SID}/${encodeURIComponent(name)}`);
    const data = await res.json();
    vecState.refPath = data;
    renderVecEditor();
    toast(`参考字形: ${name}`);
  } catch (e) { toast('字形未找到', 'err'); }
}

async function saveVecGlyph() {
  if (!state.SID || !vecState.glyphName) return;
  try {
    if (vecState.useSegments) {
      // Segments 模式：将 Paper.js paths 转为 SVG path data 发给后端
      const pathData = collectSegmentPathsData();
      await api(`/glyph/${state.SID}/${encodeURIComponent(vecState.glyphName)}/outline-svg`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ svgPathData: pathData })
      });
    } else {
      // TrueType 模式
      await api(`/glyph/${state.SID}/${encodeURIComponent(vecState.glyphName)}/outline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points: vecState.points, endPtsOfContours: vecState.endPts })
      });
    }
    toast('字形轮廓已保存');
    try { await api('/cache/clear?prefix=glyph'); } catch (e) { /* ignore */ }
  } catch (e) { toast(e.message, 'err'); }
}

function updateToolCursor() {
  const canvas = $('#vecCanvas');
  if (!canvas) return;
  switch (vecState.tool) {
    case 'select':     canvas.style.cursor = 'default'; break;
    case 'addOn': case 'addOff': canvas.style.cursor = 'crosshair'; break;
    case 'delete':     canvas.style.cursor = 'not-allowed'; break;
    case 'toggleCurve': canvas.style.cursor = 'pointer'; break;
    default:           canvas.style.cursor = 'default';
  }
}

/* ══════════════════════════════════════════════════════════════════
   v8 Segments 模式辅助函数
   ══════════════════════════════════════════════════════════════════ */

/** Update handle circles + lines for a given segment after drag */
function updateHandleCirclesForSegment(ps, pathIdx, segIdx) {
  const path = vecState.segmentPaths[pathIdx];
  if (!path) return;
  const seg = path.segments[segIdx];
  if (!seg) return;
  const zoom = ps.view.zoom || 1;
  const sw = (base) => Math.max(base / zoom, 0.3);

  // Find and update handle circles/lines that belong to this segment
  for (const item of vecState.pointItems) {
    if (!item || !item.data) continue;
    if (item.data.pathIdx !== pathIdx || item.data.segIdx !== segIdx) continue;

    if (item.data.type === 'handleIn' && seg.handleIn && !seg.handleIn.isZero()) {
      item.position = seg.point.add(seg.handleIn);
    } else if (item.data.type === 'handleOut' && seg.handleOut && !seg.handleOut.isZero()) {
      item.position = seg.point.add(seg.handleOut);
    } else if (item.data.type === 'anchor') {
      item.position = seg.point;
    }
  }

  // Rebuild handle lines for this segment
  // Remove old lines connected to this segment, then add new ones
  // For performance, just rebuild all handle lines
  for (const line of vecState.handleLineItems) line.remove();
  vecState.handleLineItems = [];

  // Re-render all handle lines
  for (const pItem of vecState.pointItems) {
    if (!pItem || !pItem.data) continue;
    if (pItem.data.type !== 'handleIn' && pItem.data.type !== 'handleOut') continue;
    const pi = pItem.data.pathIdx;
    const si = pItem.data.segIdx;
    const p = vecState.segmentPaths[pi];
    if (!p || !p.segments[si]) continue;
    const anchorPt = p.segments[si].point;
    const line = new ps.Path.Line({
      from: anchorPt,
      to: pItem.position,
      strokeColor: 'rgba(124, 92, 252, 0.4)',
      strokeWidth: sw(0.6)
    });
    vecState.handleLineItems.push(line);
  }
}

/** Show info for a segment-based control point */
function updateSegmentPointInfo(data) {
  const path = vecState.segmentPaths[data.pathIdx];
  if (!path || !path.segments[data.segIdx]) return;
  const seg = path.segments[data.segIdx];
  let info = `路径 ${data.pathIdx}, 段 ${data.segIdx}<br>`;
  if (data.type === 'anchor') {
    info += `类型: 锚点 (on-curve)<br>`;
    info += `x: ${Math.round(seg.point.x)}, y: ${Math.round(-seg.point.y)}`;
    if (seg.handleIn && !seg.handleIn.isZero()) {
      info += `<br>入柄: (${Math.round(seg.handleIn.x)}, ${Math.round(-seg.handleIn.y)})`;
    }
    if (seg.handleOut && !seg.handleOut.isZero()) {
      info += `<br>出柄: (${Math.round(seg.handleOut.x)}, ${Math.round(-seg.handleOut.y)})`;
    }
  } else if (data.type === 'handleIn') {
    info += `类型: 入柄 (in)<br>`;
    info += `锚点: (${Math.round(seg.point.x)}, ${Math.round(-seg.point.y)})<br>`;
    info += `柄: (${Math.round(seg.handleIn.x)}, ${Math.round(-seg.handleIn.y)})`;
  } else {
    info += `类型: 出柄 (out)<br>`;
    info += `锚点: (${Math.round(seg.point.x)}, ${Math.round(-seg.point.y)})<br>`;
    info += `柄: (${Math.round(seg.handleOut.x)}, ${Math.round(-seg.handleOut.y)})`;
  }
  $('#vecPointInfo').innerHTML = info;
}

/** Collect SVG path data from all segment paths for saving */
function collectSegmentPathsData() {
  const paths = [];
  for (const p of vecState.segmentPaths) {
    if (!p) continue;
    // The path was scaled (1, -1) when created; need to reverse for font coordinates
    const cloned = p.clone();
    cloned.scale(1, -1, new ps.Point(0, 0));
    paths.push(cloned.pathData);
  }
  return paths.join(' ');
}

/** Push segment state for undo */
function pushSegmentHistory() {
  // Store the current path data as a snapshot
  const snapshot = collectSegmentPathsData();
  vecState.history = vecState.history.slice(0, vecState.historyIdx + 1);
  vecState.history.push({ type: 'segments', svgPathData: snapshot });
  vecState.historyIdx = vecState.history.length - 1;
  if (vecState.history.length > 50) { vecState.history.shift(); vecState.historyIdx--; }
}

/** Undo for segment mode */
function undoSegment() {
  if (vecState.historyIdx > 0) {
    vecState.historyIdx--;
    const prev = vecState.history[vecState.historyIdx];
    if (prev.type === 'segments') {
      vecState.svgPath = prev.svgPathData;
      renderVecEditor();
    } else {
      vecState.points = JSON.parse(JSON.stringify(prev.points));
      vecState.endPts = [...prev.endPts];
      renderVecEditor();
      $('#vecPointCount').textContent = vecState.points.length;
    }
  } else if (vecState.glyphName) {
    loadVecGlyph(vecState.glyphName);
  }
}

/** Delete a point in segment mode */
function deletePointByData(data) {
  if (!data) return;
  if (data.type === 'anchor' && vecState.useSegments) {
    const path = vecState.segmentPaths[data.pathIdx];
    if (path && path.segments[data.segIdx]) {
      path.segments[data.segIdx].remove();
      renderVecEditor();
      pushSegmentHistory();
    }
  }
}

/** Override deletePoint to support both modes */
function deletePoint(idx, data) {
  if (vecState.useSegments) {
    deletePointByData(data || vecState.pointItems[idx]?.data);
  } else {
    vecState.points.splice(idx, 1);
    for (let j = 0; j < vecState.endPts.length; j++) {
      if (idx <= vecState.endPts[j]) vecState.endPts[j]--;
    }
    vecState.endPts = vecState.endPts.filter(e => e >= 0);
    if (vecState.endPts.length > 0) {
      vecState.endPts[vecState.endPts.length - 1] = vecState.points.length - 1;
    }
    pushHistory();
    renderVecEditor();
    $('#vecPointCount').textContent = vecState.points.length;
  }
}

/** Override undoVec to support both modes */
function undoVec() {
  if (vecState.useSegments) {
    undoSegment();
  } else {
    if (vecState.historyIdx > 0) {
      vecState.historyIdx--;
      const prev = vecState.history[vecState.historyIdx];
      vecState.points = JSON.parse(JSON.stringify(prev.points));
      vecState.endPts = [...prev.endPts];
      renderVecEditor();
      $('#vecPointCount').textContent = vecState.points.length;
    } else if (vecState.glyphName) {
      loadVecGlyph(vecState.glyphName);
    }
  }
}
