// Generates PNG app icons using headless Chromium's canvas. Run: node tools/make-icons.mjs (needs playwright)
import { chromium } from 'playwright';
import fs from 'node:fs';
const out = new URL('../icons/', import.meta.url).pathname;
const browser = await chromium.launch();
const page = await browser.newPage();
const sizes = [['icon-192.png', 192, false], ['icon-512.png', 512, false], ['icon-maskable-512.png', 512, true], ['apple-touch-icon.png', 180, false], ['favicon-32.png', 32, false]];
for (const [name, size, maskable] of sizes) {
  const data = await page.evaluate(([S, maskable]) => {
    const c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
    const g = x.createRadialGradient(S * .5, S * .35, 0, S * .5, S * .5, S * .75); g.addColorStop(0, '#0d2238'); g.addColorStop(1, '#03060c');
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    // grid
    x.strokeStyle = 'rgba(0,229,255,0.10)'; x.lineWidth = Math.max(1, S / 256);
    for (let i = 1; i < 8; i++) { x.beginPath(); x.moveTo(i * S / 8, 0); x.lineTo(i * S / 8, S); x.moveTo(0, i * S / 8); x.lineTo(S, i * S / 8); x.stroke(); }
    const k = maskable ? 0.62 : 0.78, w = S * k, h = w * 0.62, X = (S - w) / 2, Y = (S - h) / 2;
    x.shadowColor = '#00e5ff'; x.shadowBlur = S / 22; x.strokeStyle = '#00e5ff'; x.lineWidth = Math.max(2, S / 28);
    x.strokeRect(X, Y, w, h);
    x.lineWidth = Math.max(1, S / 70); x.globalAlpha = .75;
    x.beginPath(); x.moveTo(S / 2, Y); x.lineTo(S / 2, Y + h); x.moveTo(X, S / 2); x.lineTo(X + w, S / 2); x.stroke(); x.globalAlpha = 1;
    x.lineWidth = Math.max(2, S / 40); x.beginPath(); x.arc(S / 2, S / 2, h * .2, 0, Math.PI * 2); x.stroke();
    x.shadowColor = '#ff3df2'; x.strokeStyle = '#ff3df2'; x.lineWidth = Math.max(2, S / 40);
    x.strokeRect(X + w * .62, Y + h * .12, w * .28, h * .28);
    return c.toDataURL('image/png').split(',')[1];
  }, [size, maskable]);
  fs.writeFileSync(out + name, Buffer.from(data, 'base64')); console.log('wrote', name);
}
await browser.close();
