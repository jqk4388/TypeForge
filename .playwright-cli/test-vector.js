const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  const logs = [];
  page.on('console', msg => {
    const t = msg.text();
    logs.push(t);
    if (t.includes('[Vector]') || t.includes('Error') || t.includes('error')) {
      console.log('  LOG:', t);
    }
  });

  const errors = [];
  page.on('pageerror', err => errors.push(err.message));

  console.log('=== 1. Navigate & Upload ===');
  await page.goto('http://localhost:5000', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(500);

  const fileInput = await page.$('#fontInput');
  await fileInput.setInputFiles('c:/Windows/Fonts/arial.ttf');
  await page.waitForTimeout(2000);

  console.log('=== 2. Switch to vector panel ===');
  await page.click('[data-panel="vector"]');
  await page.waitForTimeout(300);

  console.log('=== 3. Select and load glyph "A" ===');
  // Find "A" in select options
  const hasA = await page.$eval('#vecGlyphSelect', el => {
    for (const opt of el.options) { if (opt.value === 'A' || opt.textContent.trim() === 'A') return true; }
    return false;
  });
  console.log('Has glyph A:', hasA);

  if (hasA) {
    await page.selectOption('#vecGlyphSelect', 'A');
    await page.click('#vecLoadBtn');
    await page.waitForTimeout(1500);
  }

  // Check state
  const vecName = await page.$eval('#vecGlyphName', el => el.textContent).catch(() => '-');
  const vecPoints = await page.$eval('#vecPointCount', el => el.textContent).catch(() => '-');
  const vecContours = await page.$eval('#vecContourCount', el => el.textContent).catch(() => '-');
  console.log('Glyph:', vecName, 'Points:', vecPoints, 'Contours:', vecContours);

  // Check canvas size
  const canvasState = await page.evaluate(() => {
    const canvas = document.getElementById('vecCanvas');
    const rect = canvas.getBoundingClientRect();
    return {
      cssW: rect.width,
      cssH: rect.height,
      physW: canvas.width,
      physH: canvas.height
    };
  });
  console.log('Canvas:', JSON.stringify(canvasState));
  if (canvasState.cssW < 500) {
    console.error('FAIL: Canvas too small!');
  }

  // Check zoom/center
  let viewState = await page.evaluate(() => {
    // Try to get Paper.js view state through window
    const canvas = document.getElementById('vecCanvas');
    if (canvas._paperScope) {
      return { zoom: canvas._paperScope.view.zoom, centerX: canvas._paperScope.view.center.x };
    }
    // Try paper global
    try {
      const scopes = paper.PaperScope._scopes;
      if (scopes && scopes.length > 0) {
        const v = scopes[scopes.length - 1].view;
        return { zoom: v.zoom, centerX: v.center.x, centerY: v.center.y };
      }
    } catch(e) {}
    return { zoom: 'unknown' };
  });
  console.log('View before zoom:', JSON.stringify(viewState));

  // === Test scroll zoom ===
  console.log('=== 4. Test scroll zoom (zoom in) ===');
  const canvasBox = await page.locator('#vecCanvas').boundingBox();
  if (canvasBox) {
    const cx = canvasBox.x + canvasBox.width / 2;
    const cy = canvasBox.y + canvasBox.height / 2;

    // Zoom in 5 times
    for (let i = 0; i < 5; i++) {
      await page.mouse.move(cx, cy);
      await page.mouse.wheel(0, -120);
      await page.waitForTimeout(100);
    }

    let afterZoomIn = await page.evaluate(() => {
      try {
        const scopes = paper.PaperScope._scopes;
        const v = scopes[scopes.length - 1].view;
        return { zoom: v.zoom, center: { x: v.center.x, y: v.center.y } };
      } catch(e) { return { error: e.message }; }
    });
    console.log('After zoom in:', JSON.stringify(afterZoomIn));

    // Take screenshot
    await page.screenshot({ path: '.playwright-cli/vector-zoomed-in.png' });

    // Zoom out 10 times
    console.log('=== 5. Test scroll zoom (zoom out) ===');
    for (let i = 0; i < 10; i++) {
      await page.mouse.move(cx, cy);
      await page.mouse.wheel(0, 120);
      await page.waitForTimeout(100);
    }

    let afterZoomOut = await page.evaluate(() => {
      try {
        const scopes = paper.PaperScope._scopes;
        const v = scopes[scopes.length - 1].view;
        return { zoom: v.zoom, center: { x: v.center.x, y: v.center.y } };
      } catch(e) { return { error: e.message }; }
    });
    console.log('After zoom out:', JSON.stringify(afterZoomOut));
    await page.screenshot({ path: '.playwright-cli/vector-zoomed-out.png' });

    // Fit view
    console.log('=== 6. Test fit view ===');
    await page.click('#vecFitBtn');
    await page.waitForTimeout(300);
    let afterFit = await page.evaluate(() => {
      try {
        const scopes = paper.PaperScope._scopes;
        const v = scopes[scopes.length - 1].view;
        return { zoom: v.zoom, center: { x: v.center.x, y: v.center.y } };
      } catch(e) { return { error: e.message }; }
    });
    console.log('After fit:', JSON.stringify(afterFit));
    await page.screenshot({ path: '.playwright-cli/vector-fit.png' });

    // Test zoom at different mouse positions (corner zoom)
    console.log('=== 7. Test corner zoom (should zoom toward corner) ===');
    const cornerX = canvasBox.x + canvasBox.width * 0.2;
    const cornerY = canvasBox.y + canvasBox.height * 0.2;
    await page.mouse.move(cornerX, cornerY);
    await page.mouse.wheel(0, -240);
    await page.waitForTimeout(200);
    let afterCornerZoom = await page.evaluate(() => {
      try {
        const scopes = paper.PaperScope._scopes;
        const v = scopes[scopes.length - 1].view;
        return { zoom: v.zoom, center: { x: v.center.x, y: v.center.y } };
      } catch(e) { return { error: e.message }; }
    });
    console.log('After corner zoom:', JSON.stringify(afterCornerZoom));
    await page.screenshot({ path: '.playwright-cli/vector-corner-zoom.png' });
  }

  console.log('\n=== Summary ===');
  console.log('Canvas size:', canvasState.cssW, 'x', canvasState.cssH);
  console.log('JS errors:', errors.length);
  if (errors.length > 0) errors.forEach(e => console.log('  ERR:', e));
  console.log('Test:', errors.length === 0 && canvasState.cssW >= 500 ? 'PASS' : 'FAIL');

  await browser.close();
  process.exit(errors.length > 0 || canvasState.cssW < 500 ? 1 : 0);
})();
