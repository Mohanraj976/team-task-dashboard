const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });

  const filePath = 'file://' + path.resolve(__dirname, '../index.html');

  const resources = [];
  page.on('response', async (res) => {
    const buf = await res.body().catch(() => null);
    resources.push({ url: res.url(), size: buf ? buf.length : 0, status: res.status() });
  });

  const start = Date.now();
  await page.goto(filePath, { waitUntil: 'networkidle' });
  const loadTime = Date.now() - start;

  console.log('=== LOAD ===');
  console.log('Load time (ms):', loadTime);
  const totalBytes = resources.filter(r => r.status < 400).reduce((s, r) => s + r.size, 0);
  console.log('Total transferred bytes:', totalBytes);
  resources.forEach(r => console.log('  -', path.basename(r.url), r.size, 'bytes, status', r.status));

  // Did the JSON fetch succeed, or did it fall back? (file:// often blocks fetch)
  const usedFallback = await page.evaluate(() => {
    return document.getElementById('kpi-total').textContent === '16';
  });
  console.log('\n=== DATA LOAD ===');
  console.log('Dashboard rendered 16 tasks (via fetch or fallback):', usedFallback);

  // --- Test 1: KPI cards populated ---
  const kpiTotal = await page.textContent('#kpi-total');
  const kpiDone = await page.textContent('#kpi-done');
  const kpiOverdue = await page.textContent('#kpi-overdue');
  console.log('\n=== KPI CARDS ===');
  console.log('Total:', kpiTotal, '| Done:', kpiDone, '| Overdue:', kpiOverdue);

  // --- Test 2: Search filter ---
  await page.fill('#search-input', 'checkout');
  await page.waitForTimeout(300); // debounce
  const rowsAfterSearch = await page.$$eval('#task-table-body tr', rows => rows.length);
  const announcerText = await page.textContent('#result-announcer');
  console.log('\n=== SEARCH FILTER ("checkout") ===');
  console.log('Rows shown:', rowsAfterSearch);
  console.log('Live region announced:', announcerText);

  await page.fill('#search-input', '');
  await page.waitForTimeout(300);

  // --- Test 3: Status filter ---
  await page.selectOption('#status-select', 'Overdue');
  await page.waitForTimeout(100);
  const overdueRows = await page.$$eval('#task-table-body tr', rows => rows.length);
  console.log('\n=== STATUS FILTER ("Overdue") ===');
  console.log('Rows shown:', overdueRows, '(expected 3)');
  await page.selectOption('#status-select', 'all');

  // --- Test 4: Sorting (keyboard-operated) ---
  console.log('\n=== KEYBOARD SORT TEST ===');
  const sortButton = await page.$('.sort-btn[data-key="task"]');
  await sortButton.focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  const ariaSort = await page.getAttribute('th:has(.sort-btn[data-key="task"])', 'aria-sort');
  const firstTaskAfterSort = await page.textContent('#task-table-body tr:first-child td:first-child');
  console.log('aria-sort after Enter key on "Task" header:', ariaSort);
  console.log('First row after ascending sort:', firstTaskAfterSort);

  // --- Test 5: Keyboard-only navigation through filters ---
  console.log('\n=== KEYBOARD NAVIGATION TEST ===');
  await page.evaluate(() => document.getElementById('search-input').focus());
  const tabOrder = [];
  for (let i = 0; i < 5; i++) {
    const active = await page.evaluate(() => document.activeElement.id || document.activeElement.tagName);
    tabOrder.push(active);
    await page.keyboard.press('Tab');
  }
  console.log('Tab order from search input:', tabOrder.join(' -> '));

  // --- Test 6: Reset filters button ---
  await page.selectOption('#category-select', 'Design');
  await page.click('#reset-filters');
  await page.waitForTimeout(100);
  const rowsAfterReset = await page.$$eval('#task-table-body tr', rows => rows.length);
  console.log('\n=== RESET FILTERS ===');
  console.log('Rows shown after reset (expected 16):', rowsAfterReset);

  // --- Test 7: Chart accessibility ---
  const chartAriaLabel = await page.getAttribute('#chart-container svg', 'aria-label');
  console.log('\n=== CHART ACCESSIBILITY ===');
  console.log('Chart aria-label:', chartAriaLabel);

  // --- Test 8: Responsive layout at mobile width ---
  await page.setViewportSize({ width: 375, height: 700 });
  await page.waitForTimeout(100);
  const summaryColumns = await page.evaluate(() => {
    return getComputedStyle(document.querySelector('.summary')).gridTemplateColumns.split(' ').length;
  });
  console.log('\n=== RESPONSIVE TEST (375px width) ===');
  console.log('KPI grid columns at mobile width:', summaryColumns, '(expected 2)');

  await browser.close();
})();
