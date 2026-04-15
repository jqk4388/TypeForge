/**
 * TypeForge Pro — Vector Editor v6
 *
 * 核心修复：
 * 1. Paper.js 初始化：完全自主管理 canvas，不再手动干预 DPR
 * 2. 缩放：以鼠标位置为中心，平滑因子 1.08，范围 0.01-128
 * 3. 中键拖拽：button === 1 判断，阻止默认中键行为
 * 4. 空格拖拽：保留
 * 5. 消除重影：viewSize 只在初始化时设一次，resize 时重设
 * 6. 控制点/网格线：clamp 最小粗细，高倍缩放也可见
 * 7. fitView：改用 zoom/center 直接计算，不多次 scale
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
  pointItems: [],
  refPath: null,
  initialized: false,
  pendingGlyph: null,
  initAttempts: 0,
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
            hitResult = { idx: i, item };
            dragItem = item;
            updateVecPointInfo(i);
            break;
          }
        }
      } else if (vecState.tool === 'delete') {
        let minD = Infinity, minI = -1;
        for (let i = 0; i < vecState.pointItems.length; i++) {
          const item = vecState.pointItems[i];
          if (item) {
            const d = event.point.getDistance(item.position);
            if (d < minD) { minD = d; minI = i; }
          }
        }
        if (minD < threshold && minI >= 0) deletePoint(minI);
      } else if (vecState.tool === 'toggleCurve') {
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
        dragItem.position = dragItem.position.add(event.delta);
        const idx = hitResult.idx;
        vecState.points[idx].x = Math.round(dragItem.position.x);
        vecState.points[idx].y = Math.round(-dragItem.position.y);
        updateVecPointInfo(idx);
      }
    };

    // ── mouseUp ─────────────────────────────────────────────────
    tool.onMouseUp = function() {
      if (panDrag) {
        panDrag = null;
        applyCursor();
        return;
      }
      if (vecState.tool === 'select' && dragItem && hitResult) pushHistory();
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
    hasPath = drawGlyphFromSVG(ps);
  }
  if (!hasPath && vecState.points.length > 0 && vecState.endPts.length > 0) {
    drawGlyphFromPoints(ps);
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

  // ── 控制点 ───────────────────────────────────────────────────
  vecState.pointItems = [];
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
    vecState.pointItems.push(circle);
  });

  ps.view.update();
}

/* ══════════════════════════════════════════════════════════════════
   SVG path 渲染
   ══════════════════════════════════════════════════════════════════ */
function drawGlyphFromSVG(ps) {
  if (!vecState.svgPath) return false;

  // 方法1：pathData
  try {
    const mainPath = new ps.Path();
    mainPath.pathData = vecState.svgPath;
    mainPath.scale(1, -1, new ps.Point(0, 0));
    mainPath.fillColor = new ps.Color(0.486, 0.361, 0.988, 0.15);
    mainPath.strokeColor = '#7c5cfc';
    mainPath.strokeWidth = 1.5;
    console.log('[Vector] Path via pathData, segs:', mainPath.segments?.length);
    return true;
  } catch (e1) {
    console.warn('[Vector] pathData failed:', e1.message);
  }

  // 方法2：手动解析
  try {
    const segments = parseSVGPath(vecState.svgPath);
    if (segments.length > 0) {
      const path = new ps.Path();
      path.closed = true;
      for (const seg of segments) {
        if (seg.type === 'M') path.moveTo([seg.x, -seg.y]);
        else if (seg.type === 'L') path.lineTo([seg.x, -seg.y]);
        else if (seg.type === 'Q') path.quadraticCurveTo([seg.cx, -seg.cy], [seg.x, -seg.y]);
        else if (seg.type === 'C') path.cubicCurveTo([seg.c1x, -seg.c1y], [seg.c2x, -seg.c2y], [seg.x, -seg.y]);
        else if (seg.type === 'Z') path.closePath();
      }
      path.fillColor = new ps.Color(0.486, 0.361, 0.988, 0.15);
      path.strokeColor = '#7c5cfc';
      path.strokeWidth = 1.5;
      console.log('[Vector] Path via manual parsing');
      return true;
    }
  } catch (e2) {
    console.warn('[Vector] Manual parsing failed:', e2.message);
  }

  return false;
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
   从点数据绘制
   ══════════════════════════════════════════════════════════════════ */
function drawGlyphFromPoints(ps) {
  if (!vecState.points.length || !vecState.endPts.length) return;

  for (let ci = 0; ci < vecState.endPts.length; ci++) {
    const start = ci === 0 ? 0 : vecState.endPts[ci - 1] + 1;
    const end = vecState.endPts[ci] + 1;
    const contourPts = vecState.points.slice(start, end);
    if (contourPts.length < 2) continue;

    const path = new ps.Path();
    path.closed = true;

    let i = 0;
    while (i < contourPts.length) {
      const pt = contourPts[i];
      if (pt.onCurve) {
        path.add([pt.x, -pt.y]);
        i++;
      } else {
        const next = contourPts[(i + 1) % contourPts.length];
        if (!next.onCurve) {
          const midX = (pt.x + next.x) / 2;
          const midY = (pt.y + next.y) / 2;
          path.add(new ps.Segment(
            [midX, -midY],
            [pt.x - midX, -(pt.y - midY)],
            null
          ));
          i++;
        } else {
          path.add(new ps.Segment(
            [next.x, -next.y],
            [pt.x - next.x, -(pt.y - next.y)],
            null
          ));
          i += 2;
        }
      }
    }

    path.fillColor = new ps.Color(0.486, 0.361, 0.988, 0.15);
    path.strokeColor = '#7c5cfc';
    path.strokeWidth = 1.5;
  }
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

function undoVec() {
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

function deletePoint(idx) {
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
    await api(`/glyph/${state.SID}/${encodeURIComponent(vecState.glyphName)}/outline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points: vecState.points, endPtsOfContours: vecState.endPts })
    });
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
