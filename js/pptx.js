// ShowCrew PixelMap — PowerPoint template (.pptx) with the slide size set and one labeled guide rectangle per segment.
// Uses PptxGenJS 4.0.1 (MIT, vendored in vendor/, includes JSZip), loaded on demand and precached by the service worker for offline use.
// Positions are given in inches; PptxGenJS converts them to EMU (914 400 per inch) — exact when 1 px is a whole number of EMU (e.g. 1/3 scale = 3175 EMU/px).
const SRC = './vendor/pptxgen-4.0.1.bundle.js';
let loading = null;
function loadLib() {
  if (globalThis.PptxGenJS) return Promise.resolve(globalThis.PptxGenJS);
  return loading || (loading = new Promise((res, rej) => {
    const sc = document.createElement('script'); sc.src = SRC; sc.async = true;
    sc.onload = () => (globalThis.PptxGenJS ? res(globalThis.PptxGenJS) : rej(new Error('PptxGenJS did not load')));
    sc.onerror = () => { loading = null; rej(new Error('Could not load the PowerPoint library (open the app once online)')); };
    document.head.appendChild(sc);
  }));
}
const hex = c => c.replace('#', '').toUpperCase();
const f3 = v => String(Math.round(v * 1000) / 1000);

/** { job, s (screen), p (slide plan from slides.js), rects [{name,x,y,w,h,kind}], fit (segFit), summary (text) } → Blob */
export async function buildPptx({ job, s, p, rects, fit, summary }) {
  const PptxGenJS = await loadLib();
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'PIXELMAP', width: p.slideW, height: p.slideH });
  pptx.layout = 'PIXELMAP';
  pptx.author = 'ShowCrew PixelMap'; pptx.company = 'ShowCrew Tools'; pptx.title = `${job.name} — ${s.name} ${s.w}x${s.h}`;
  const k = p.inPerPx, slideHpt = p.slideHpt;
  const sl = pptx.addSlide(); sl.background = { color: '0B1220' };
  // unused areas first (underneath)
  if (fit && !fit.exact) {
    for (const u of fit.unused) sl.addShape(pptx.ShapeType.rect, { x: u.x0 * k, y: u.y0 * k, w: Math.max(u.w * k, 0.01), h: u.h * k, objectName: `Unused ${u.w}x${u.h} px`,
      fill: { color: 'FFB020', transparency: 55 }, line: { color: 'FFB020', width: 0.5 } });
  }
  for (const r of rects) {
    const seg = r.kind !== 'box', col = seg ? 'FFB020' : 'FF3DF2';
    const fs = Math.max(6, Math.min(48, r.h * k * 72 * 0.13, r.w * k * 72 / Math.max(10, r.name.length + 4) * 1.6));
    sl.addText([
      { text: r.name, options: { bold: true, breakLine: true } },
      { text: `${r.w}×${r.h} px @ ${r.x}, ${r.y}`, options: { fontSize: fs * 0.7, breakLine: true } },
      { text: `${f3(r.x * k)}", ${f3(r.y * k)}" · ${f3(r.w * k)}" × ${f3(r.h * k)}"`, options: { fontSize: fs * 0.6 } },
    ], { shape: pptx.ShapeType.rect, x: r.x * k, y: r.y * k, w: r.w * k, h: r.h * k, objectName: `${seg ? 'Segment' : 'PiP'} ${r.name}`,
      fill: { color: col, transparency: seg ? 88 : 80 }, line: { color: col, width: Math.max(0.75, Math.min(3, slideHpt / 200)) },
      color: 'FFFFFF', fontFace: 'Arial', fontSize: fs, align: 'center', valign: 'middle', margin: 0 });
  }
  sl.addText(`${s.name} ${s.w}×${s.h} · slide ${f3(p.slideW)} × ${f3(p.slideH)} in · 1 in = ${f3(p.pxPerIn)} px · ShowCrew PixelMap guide — delete before show`,
    { x: 0, y: 0, w: p.slideW, h: Math.min(p.slideH * 0.08, 0.6), fontSize: Math.max(6, Math.min(14, slideHpt * 0.035)), color: '7FD8EA', fontFace: 'Arial', margin: 2, objectName: 'PixelMap note' });
  sl.addNotes(summary || '');
  pptx.addSlide().background = { color: '000000' };
  return pptx.write({ outputType: 'blob' });
}
