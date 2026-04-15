/**
 * TypeForge Pro — Vector Editor v4 (Complete Rewrite)
 * - 修复 Paper.js 在隐藏面板初始化失败的问题
 * - 改进 SVG path 渲染策略
 * - 支持复合字形显示
 * - 添加撤销/重做
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
  components: [], // 复合字形组件
  history: [],
  historyIdx: -1,
  tool: 'select',
  paperScope: null,
  glyphPathItem: null,
  pointItems: [],
  refPath: null,
  initialized: false,
  pendingGlyph: null,
  initAttempts: 0,
};

export function initVector() {
  // Tool buttons
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

  window.addEventListener('resize', () => {
    if (vecState.initialized && vecState.glyphName) {
      resizeCanvas();
    }
  });
}

/** 初始化 Paper.js — DPR感知画布 + 滚轮缩放 + 空格手型拖拽 */
function ensurePaperInit() {
  const canvas = $('#vecCanvas');
  if (!canvas) { console.warn('[Vector] Canvas not found'); return false; }

  const rect = canvas.getBoundingClientRect();
  console.log('[Vector] Canvas rect:', rect.width, 'x', rect.height);
  if (rect.width < 50 || rect.height < 50) {
    vecState.initAttempts++;
    console.log(`[Vector] Canvas not visible (attempt ${vecState.initAttempts}), waiting...`);
    if (vecState.initAttempts < 10) setTimeout(() => ensurePaperInit(), 100);
    return false;
  }

  if (vecState.initialized && vecState.paperScope) { resizeCanvas(); return true; }

  // ── DPR 感知画布 ───────────────────────────────────────────
  // canvas.width/height  = 物理像素（CSS px × DPR）
  // canvas.style  = CSS 像素尺寸（与 rect 一致）
  // view.viewSize = CSS 像素尺寸
  // → Paper.js view 坐标系与 CSS px 完全对齐，e.offsetX/Y 可直接用
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = Math.round(rect.width  * dpr);
  canvas.height = Math.round(rect.height * dpr);
  canvas.style.width  = rect.width  + 'px';
  canvas.style.height = rect.height + 'px';
  console.log('[Vector] Canvas phys:', canvas.width, 'x', canvas.height, ' DPR:', dpr);

  try {
    if (typeof paper === 'undefined') {
      toast('Paper.js 未加载', 'err'); return false;
    }

    const ps = new paper.PaperScope();
    ps.setup(canvas);
    vecState.paperScope = ps;
    ps.view.viewSize = new ps.Size(rect.width, rect.height);

    // ── 空格键手型拖拽状态 ────────────────────────────────────
    let spaceDown = false;
    let panDrag   = null;
    let hitResult = null;
    let dragItem  = null;

    function applyCursor() {
      if (!canvas) return;
      canvas.style.cursor = spaceDown ? (panDrag ? 'grabbing' : 'grab')
        : (vecState.tool === 'select'   ? 'default'
         : vecState.tool === 'addOn' || vecState.tool === 'addOff' ? 'crosshair'
         : vecState.tool === 'delete'  ? 'not-allowed'
         : vecState.tool === 'toggleCurve' ? 'pointer' : 'default');
    }

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
    const MIN_ZOOM = 0.05, MAX_ZOOM = 50;

    tool.onMouseDown = function(event) {
      if (!vecState.paperScope) return;
      if (spaceDown) {
        panDrag = { startProject: event.point.clone(), startCenter: ps.view.center.clone() };
        applyCursor(); return;
      }
      const zoom     = ps.view.zoom || 1;
      const threshold = Math.max(6, 14 / zoom);

      if (vecState.tool === 'select') {
        hitResult = null;
        for (let i = vecState.pointItems.length - 1; i >= 0; i--) {
          const item = vecState.pointItems[i];
          if (item && event.point.getDistance(item.position) < threshold) {
            hitResult = { idx: i, item }; dragItem = item; updateVecPointInfo(i); break;
          }
        }
      } else if (vecState.tool === 'delete') {
        let minD = Infinity, minI = -1;
        for (let i = 0; i < vecState.pointItems.length; i++) {
          const item = vecState.pointItems[i];
          if (item) { const d = event.point.getDistance(item.position); if (d < minD) { minD = d; minI = i; } }
        }
        if (minD < threshold && minI >= 0) deletePoint(minI);
      } else if (vecState.tool === 'toggleCurve') {
        let minD = Infinity, minI = -1;
        for (let i = 0; i < vecState.pointItems.length; i++) {
          const item = vecState.pointItems[i];
          if (item) { const d = event.point.getDistance(item.position); if (d < minD) { minD = d; minI = i; } }
        }
        if (minD < threshold && minI >= 0) {
          vecState.points[minI].onCurve = !vecState.points[minI].onCurve;
          pushHistory(); renderVecEditor();
        }
      } else if (vecState.tool === 'addOn' || vecState.tool === 'addOff') {
        const x = Math.round(event.point.x), y = Math.round(-event.point.y);
        vecState.points.push({ x, y, onCurve: vecState.tool === 'addOn' });
        if (vecState.endPts.length > 0) vecState.endPts[vecState.endPts.length - 1] = vecState.points.length - 1;
        else vecState.endPts.push(vecState.points.length - 1);
        pushHistory(); renderVecEditor();
        $('#vecPointCount').textContent = vecState.points.length;
      }
    };

    tool.onMouseDrag = function(event) {
      if (spaceDown && panDrag) {
        const delta = panDrag.startProject.subtract(event.point);
        ps.view.center = panDrag.startCenter.add(delta); applyCursor(); return;
      }
      if (vecState.tool === 'select' && dragItem && hitResult) {
        dragItem.position = dragItem.position.add(event.delta);
        const idx = hitResult.idx;
        vecState.points[idx].x = Math.round(dragItem.position.x);
        vecState.points[idx].y = Math.round(-dragItem.position.y);
        updateVecPointInfo(idx);
      }
    };

    tool.onMouseUp = function() {
      if (spaceDown && panDrag) { panDrag = null; applyCursor(); return; }
      if (vecState.tool === 'select' && dragItem && hitResult) pushHistory();
      dragItem = null; hitResult = null;
    };

    // ── 滚轮缩放（以鼠标为中心，上下限保护） ─────────────────
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      if (!vecState.paperScope) return;
      const factor  = e.deltaY > 0 ? 0.88 : 1.14;
      const newZoom  = ps.view.zoom * factor;
      if (newZoom < MIN_ZOOM || newZoom > MAX_ZOOM) return;
      // e.offsetX/Y = CSS像素，直接传给 viewToProject（viewSize 也是 CSS 像素）
      ps.view.scale(factor, ps.view.viewToProject(new ps.Point(e.offsetX, e.offsetY)));
    }, { passive: false });

    vecState.initialized  = true;
    vecState.initAttempts  = 0;
    updateToolCursor();
    console.log('[Vector] Paper.js ready (DPR-aware, pan+zoom)');
    return true;
  } catch (e) {
    console.error('[Vector] Paper.js init failed:', e);
    toast('矢量编辑器初始化失败: ' + e.message, 'err');
    return false;
  }
}

function deletePoint(idx) {
  vecState.points.splice(idx, 1);
  // 更新 endPts
  for (let j = 0; j < vecState.endPts.length; j++) {
    if (idx <= vecState.endPts[j]) {
      vecState.endPts[j]--;
    }
  }
  // 过滤掉小于0的endPts
  vecState.endPts = vecState.endPts.filter(e => e >= 0);
  if (vecState.endPts.length > 0) {
    vecState.endPts[vecState.endPts.length - 1] = vecState.points.length - 1;
  }
  pushHistory();
  renderVecEditor();
  $('#vecPointCount').textContent = vecState.points.length;
}

function resizeCanvas() {
  const canvas = $('#vecCanvas');
  if (!canvas || !vecState.paperScope) return;
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 50 || rect.height < 50) return;
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = Math.round(rect.width  * dpr);
  canvas.height = Math.round(rect.height * dpr);
  canvas.style.width  = rect.width  + 'px';
  canvas.style.height = rect.height + 'px';
  vecState.paperScope.view.viewSize = new vecState.paperScope.Size(rect.width, rect.height);
  if (vecState.glyphName) { renderVecEditor(); fitView(); }
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

    // 如果是复合字形，显示组件信息
    if (vecState.components.length > 0) {
      const compInfo = vecState.components.map(c => `${c.glyphName} (${c.x || 0}, ${c.y || 0})`).join(', ');
      $('#vecPointInfo').innerHTML = `<div style="color:var(--warn)">复合字形: ${vecState.components.length} 个组件</div><div style="font-size:11px">${compInfo}</div>`;
    }

    // 初始化 Paper.js
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
  console.log('[Vector] Panel visible');
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
    }, 100);
  } else if (vecState.glyphName) {
    resizeCanvas();
  }
}

function renderVecEditor() {
  const ps = vecState.paperScope;
  if (!ps || !vecState.initialized) return;

  ps.project.clear();
  const em = 1000;
  const zoom = ps.view.zoom || 1;

  // 背景网格
  for (let i = 0; i <= em; i += 100) {
    new ps.Path.Line({
      from: new ps.Point(0, -i),
      to: new ps.Point(em, -i),
      strokeColor: 'rgba(128,128,128,0.15)',
      strokeWidth: 0.5
    });
    new ps.Path.Line({
      from: new ps.Point(i, 0),
      to: new ps.Point(i, -em),
      strokeColor: 'rgba(128,128,128,0.15)',
      strokeWidth: 0.5
    });
  }

  // 基线和 advance width
  new ps.Path.Line({
    from: new ps.Point(-50, 0),
    to: new ps.Point(em + 50, 0),
    strokeColor: '#4caf50',
    strokeWidth: 1
  });
  const aw = vecState.advanceWidth || 500;
  new ps.Path.Line({
    from: new ps.Point(aw, 50),
    to: new ps.Point(aw, -em - 50),
    strokeColor: '#4caf50',
    strokeWidth: 0.5,
    dashArray: [4, 4]
  });

  // 度量参考线
  const metrics = state.fontInfo?.metrics || {};
  const hhea = metrics.hhea || {};
  if (hhea.ascent) {
    new ps.Path.Line({
      from: new ps.Point(-20, -hhea.ascent),
      to: new ps.Point(em + 20, -hhea.ascent),
      strokeColor: 'rgba(153,153,153,0.5)',
      strokeWidth: 0.5,
      dashArray: [4, 4]
    });
    new ps.PointText({
      point: new ps.Point(em + 5, -hhea.ascent + 4),
      content: `ascent: ${hhea.ascent}`,
      fillColor: '#888',
      fontSize: 10
    });
  }
  if (hhea.descent) {
    new ps.Path.Line({
      from: new ps.Point(-20, -hhea.descent),
      to: new ps.Point(em + 20, -hhea.descent),
      strokeColor: 'rgba(153,153,153,0.5)',
      strokeWidth: 0.5,
      dashArray: [4, 4]
    });
    new ps.PointText({
      point: new ps.Point(em + 5, -hhea.descent + 4),
      content: `descent: ${hhea.descent}`,
      fillColor: '#888',
      fontSize: 10
    });
  }

  // 绘制字形轮廓
  let hasPath = false;
  if (vecState.svgPath) {
    hasPath = drawGlyphFromSVG(ps);
  }

  if (!hasPath && vecState.points.length > 0 && vecState.endPts.length > 0) {
    drawGlyphFromPoints(ps);
  }

  // 绘制控制点
  vecState.pointItems = [];
  vecState.points.forEach((p, i) => {
    const r = (p.onCurve ? 5 : 4) / zoom;
    const circle = new ps.Path.Circle({
      center: new ps.Point(p.x, -p.y),
      radius: r,
      fillColor: p.onCurve ? '#7c5cfc' : '#f59e0b',
      strokeColor: '#fff',
      strokeWidth: 1 / zoom
    });
    vecState.pointItems.push(circle);
  });

  ps.view.update();
}

/** SVG path 渲染 */
function drawGlyphFromSVG(ps) {
  if (!vecState.svgPath) return false;

  try {
    // 方法1: 使用 Path.pathData
    const mainPath = new ps.Path();
    mainPath.pathData = vecState.svgPath;
    mainPath.scale(1, -1, new ps.Point(0, 0));
    mainPath.fillColor = new ps.Color(0.486, 0.361, 0.988, 0.15);
    mainPath.strokeColor = '#7c5cfc';
    mainPath.strokeWidth = 1.5;
    console.log('[Vector] Path rendered via pathData, segments:', mainPath.segments?.length);
    return true;
  } catch (e1) {
    console.warn('[Vector] pathData failed:', e1.message);
  }

  try {
    // 方法2: 手动解析 SVG path 命令
    const segments = parseSVGPath(vecState.svgPath);
    if (segments.length > 0) {
      const path = new ps.Path();
      path.closed = true;
      segments.forEach(seg => {
        if (seg.type === 'M') {
          path.moveTo(new ps.Point(seg.x, -seg.y));
        } else if (seg.type === 'L') {
          path.lineTo(new ps.Point(seg.x, -seg.y));
        } else if (seg.type === 'Q') {
          path.quadraticCurveTo(
            new ps.Point(seg.cx, -seg.cy),
            new ps.Point(seg.x, -seg.y)
          );
        } else if (seg.type === 'C') {
          path.cubicCurveTo(
            new ps.Point(seg.c1x, -seg.c1y),
            new ps.Point(seg.c2x, -seg.c2y),
            new ps.Point(seg.x, -seg.y)
          );
        } else if (seg.type === 'Z') {
          path.closePath();
        }
      });
      path.fillColor = new ps.Color(0.486, 0.361, 0.988, 0.15);
      path.strokeColor = '#7c5cfc';
      path.strokeWidth = 1.5;
      console.log('[Vector] Path rendered via manual parsing');
      return true;
    }
  } catch (e2) {
    console.warn('[Vector] Manual parsing failed:', e2.message);
  }

  console.warn('[Vector] All SVG rendering methods failed');
  return false;
}

/** 简化 SVG path 解析 */
function parseSVGPath(d) {
  const segments = [];
  const commands = d.match(/[MLQCZmlqcz][^MLQCZmlqcz]*/g) || [];
  
  for (const cmd of commands) {
    const type = cmd[0];
    const nums = cmd.slice(1).trim().split(/[\s,]+/).filter(s => s).map(Number);
    
    if (type === 'M' && nums.length >= 2) {
      segments.push({ type: 'M', x: nums[0], y: nums[1] });
    } else if (type === 'L' && nums.length >= 2) {
      segments.push({ type: 'L', x: nums[0], y: nums[1] });
    } else if (type === 'Q' && nums.length >= 4) {
      segments.push({ type: 'Q', cx: nums[0], cy: nums[1], x: nums[2], y: nums[3] });
    } else if (type === 'C' && nums.length >= 6) {
      segments.push({ type: 'C', c1x: nums[0], c1y: nums[1], c2x: nums[2], c2y: nums[3], x: nums[4], y: nums[5] });
    } else if (type === 'Z' || type === 'z') {
      segments.push({ type: 'Z' });
    }
  }
  
  return segments;
}

/** 从点数据绘制 */
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
        path.add(new ps.Point(pt.x, -pt.y));
        i++;
      } else {
        const next = contourPts[(i + 1) % contourPts.length];
        if (!next.onCurve) {
          // 隐含 on-curve 点
          const midX = (pt.x + next.x) / 2;
          const midY = (pt.y + next.y) / 2;
          path.add(new ps.Segment(
            new ps.Point(midX, -midY),
            new ps.Point(pt.x - midX, -(pt.y - midY)),
            null
          ));
          i++;
        } else {
          path.add(new ps.Segment(
            new ps.Point(next.x, -next.y),
            new ps.Point(pt.x - next.x, -(pt.y - next.y)),
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

function updateVecPointInfo(idx) {
  if (idx < 0 || idx >= vecState.points.length) {
    $('#vecPointInfo').textContent = '无';
    return;
  }
  const p = vecState.points[idx];
  $('#vecPointInfo').innerHTML = `索引: ${idx}<br>类型: ${p.onCurve ? 'on-curve (锚点)' : 'off-curve (控制点)'}<br>x: ${p.x}, y: ${p.y}`;
}

function pushHistory() {
  vecState.history = vecState.history.slice(0, vecState.historyIdx + 1);
  vecState.history.push(JSON.parse(JSON.stringify({ points: vecState.points, endPts: vecState.endPts })));
  vecState.historyIdx = vecState.history.length - 1;
  if (vecState.history.length > 50) {
    vecState.history.shift();
    vecState.historyIdx--;
  }
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

function fitView() {
  const ps = vecState.paperScope;
  if (!ps) return;
  const canvasRect = ps.view.element.getBoundingClientRect();
  if (canvasRect.width < 50 || canvasRect.height < 50) return;

  ps.view.matrix = new ps.Matrix();
  const bounds = vecState.bounds || [0, -800, 500, 0];
  const glyphW = bounds[2] - bounds[0] || 500;
  const glyphH = Math.abs(bounds[3] - bounds[1]) || 800;
  const scale = Math.min(
    canvasRect.width / (glyphW + 200),
    canvasRect.height / (glyphH + 200)
  ) * 0.8;
  
  const centerX = (bounds[0] + bounds[2]) / 2;
  const centerY = (bounds[1] + bounds[3]) / 2;
  ps.view.scale(scale, new ps.Point(centerX, -centerY));
  ps.view.update();
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
    try { await api('/cache/clear?prefix=glyph'); } catch(e) {}
  } catch (e) { toast(e.message, 'err'); }
}

function updateToolCursor() {
  const canvas = $('#vecCanvas');
  if (!canvas) return;
  if (vecState._getSpaceDown && vecState._getSpaceDown()) {
    canvas.style.cursor = 'grab'; return;
  }
  switch (vecState.tool) {
    case 'select': canvas.style.cursor = 'default'; break;
    case 'addOn': case 'addOff': canvas.style.cursor = 'crosshair'; break;
    case 'delete': canvas.style.cursor = 'not-allowed'; break;
    case 'toggleCurve': canvas.style.cursor = 'pointer'; break;
    default: canvas.style.cursor = 'default';
  }
}
