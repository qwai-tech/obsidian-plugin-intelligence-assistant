// Playwright screenshot capture for promotional materials
// Run: node docs/promotional/screenshots/capture.js

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const htmlPath = path.resolve(__dirname, 'mockup.html');
const outDir = path.resolve(__dirname, 'output');
fs.mkdirSync(outDir, { recursive: true });

const scenes = [
  {
    id: 'scene-chat',
    file: '01-agent-mode.png',
    label: 'Agent mode with tool call trace',
  },
  {
    id: 'scene-quick-actions',
    file: '02-quick-actions.png',
    label: 'Quick Actions context menu',
  },
  {
    id: 'scene-providers',
    file: '03-multi-provider.png',
    label: 'Multi-provider configuration',
  },
  {
    id: 'scene-rag',
    file: '04-rag-citations.png',
    label: 'RAG with vault citations',
  },
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1400, height: 900 });

  const fileUrl = 'file://' + htmlPath;
  await page.goto(fileUrl, { waitUntil: 'networkidle' });

  for (const scene of scenes) {
    const el = page.locator(`#${scene.id}`);
    await el.waitFor({ state: 'visible' });
    const outPath = path.join(outDir, scene.file);
    await el.screenshot({ path: outPath });
    console.log(`✅  ${scene.file}  —  ${scene.label}`);
  }

  await browser.close();
  console.log(`\nAll screenshots saved to: ${outDir}`);
})();
