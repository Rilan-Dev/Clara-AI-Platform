// Probe font loading in Playwright for the guide HTML
const { chromium } = require('/home/z/.npm-global/lib/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('requestfailed', r => errors.push(r.url().slice(0, 80) + ' :: ' + (r.failure() || {}).errorText));
  page.on('response', r => { if (r.url().includes('fonts.g')) console.log('FONT RESP:', r.status(), r.url().slice(0, 90)); });
  await page.goto('file:///home/z/my-project/scripts/modeb-guide.html', { waitUntil: 'networkidle', timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  const info = await page.evaluate(() => {
    const loaded = [...document.fonts].map(f => f.family + ' ' + f.weight + ' ' + f.status);
    const bodyFont = getComputedStyle(document.body).fontFamily;
    const title = document.querySelector('.cover .title');
    return { count: document.fonts.size, loaded: loaded.slice(0, 20), bodyFont, titleFont: title ? getComputedStyle(title).fontFamily : null };
  });
  console.log(JSON.stringify(info, null, 1));
  console.log('FAILED REQUESTS:', errors.slice(0, 10));
  await browser.close();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
