// ShowCrew PixelMap — PowerPoint / Keynote slide-size math (pure, no DOM).
//
// Facts this relies on (checked Oct 2026):
//  • PowerPoint custom slide size: each side min 1 in (2.54 cm), max 56 in (142.24 cm). Design ▸ Slide Size ▸ Custom Slide Size;
//    the boxes accept a unit suffix "in", "cm" or "px" and convert to the OS measurement system.
//    https://support.microsoft.com/en-us/powerpoint/change-the-size-of-your-powerpoint-slides
//    (That page lists the px limits as "120 px / 720 px", which doesn't match its own 1 in / 56 in at any single px-per-inch value,
//     so we always give inches/cm and never rely on PowerPoint's "px" conversion.)
//    The same 56 in cap is the OOXML schema limit: ST_SlideSizeCoordinate max = 51 206 400 EMU = 56 in (914 400 EMU per inch, ECMA-376 §19.7.44).
//  • PowerPoint exports slides as pictures at 96 dpi by default: Widescreen 13.333 × 7.5 in → 1280 × 720 px. On Windows the export
//    dpi is the registry DWORD (decimal) ExportBitmapResolution under HKCU\Software\Microsoft\Office\16.0\PowerPoint\Options
//    (PowerPoint 2016/2019/2021/2024/365), then File ▸ Save As ▸ PNG. PowerPoint 2013+ has no fixed dpi limit — the bitmap may be up to
//    100 000 000 px (W×H); PowerPoint 2010 and older cap the longest edge at 3072 px.
//    https://learn.microsoft.com/en-us/office/troubleshoot/powerpoint/change-export-slide-resolution
//  • PowerPoint for Mac: File ▸ Export ▸ File Format PNG (or JPEG) lets you type the image Width / Height in pixels.
//    https://support.microsoft.com/en-us/powerpoint/export-your-powerpoint-for-mac-presentation-as-a-different-file-format
//  • 1 in = 72 pt = 2.54 cm. The Size & Position pane (Format Shape ▸ Size & Properties: Width/Height, Position Horizontal/Vertical
//    "from Top Left Corner") shows inches or cm depending on the OS region setting.
//  • Keynote: custom slide size is typed in Document ▸ Slide Size ▸ Custom Slide Size; it is in points and Keynote treats 1 pt as 1 slide
//    pixel (Wide = 1920 × 1080). Apple publishes no maximum. Users report 8192 × 8192 as the limit on current macOS Keynote
//    (Eric Alba, LinkedIn, Oct 2023; Stoatworks "Wallslide" measured 200–8192 pt by asking Keynote until it refused);
//    old Keynote ('08) capped at 4000. https://support.apple.com/guide/keynote/change-the-slide-size-tan929f13a1f/mac

export const PPT = { PX_PER_IN: 96, PT_PER_IN: 72, CM_PER_IN: 2.54, EMU_PER_IN: 914400, MAX_IN: 56, MIN_IN: 1, MAX_BITMAP_PX: 100000000, OLD_MAX_EDGE: 3072 };
export const KEYNOTE = { MAX_PT: 8192, OLD_MAX_PT: 4000 };

const isInt = v => Math.abs(v - Math.round(v)) < 1e-6;
export const r3 = v => Math.round(v * 1000) / 1000;
/** "39.389", "56", "5.331" — up to 3 decimals, trailing zeros trimmed. */
export const f3 = v => { const x = r3(v); return isInt(x) ? String(Math.round(x)) : x.toFixed(3).replace(/0+$/, ''); };

/** Slide geometry at scale k (slide size ÷ 1:1 size at 96 px/in). */
function plan(key, label, w, h, k, extra = {}) {
  const inPerPx = k / PPT.PX_PER_IN, slideW = w * inPerPx, slideH = h * inPerPx, pxPerIn = PPT.PX_PER_IN / k;
  const dpiInt = isInt(pxPerIn), dpiCeil = Math.ceil(pxPerIn - 1e-9);
  return {
    key, label, k, inPerPx, pxPerIn, slideW, slideH,
    slideWcm: slideW * PPT.CM_PER_IN, slideHcm: slideH * PPT.CM_PER_IN, slideWpt: slideW * PPT.PT_PER_IN, slideHpt: slideH * PPT.PT_PER_IN,
    slideWemu: Math.round(slideW * PPT.EMU_PER_IN), slideHemu: Math.round(slideH * PPT.EMU_PER_IN),
    emuPerPx: PPT.EMU_PER_IN * inPerPx, emuExact: isInt(PPT.EMU_PER_IN * inPerPx),
    // export back to native pixels
    default96: [Math.round(slideW * 96), Math.round(slideH * 96)],             // what File ▸ Save As PNG gives with no registry change
    winDpi: dpiInt ? Math.round(pxPerIn) : pxPerIn, winExact: dpiInt,            // ExportBitmapResolution must be a whole number
    winCeilDpi: dpiCeil, winCeilPx: [Math.round(slideW * dpiCeil), Math.round(slideH * dpiCeil)],
    bitmapOk: w * h <= PPT.MAX_BITMAP_PX,
    macExport: [w, h],
    ...extra,
  };
}

/**
 * PowerPoint options for a W×H px screen.
 *  native — 1:1 at 96 px/in (only when both sides fit 1–56 in)
 *  exact  — too big: build at 1/N (smallest whole N that fits) → Windows export at 96·N dpi gives exactly W×H
 *  max    — too big: the largest slide that keeps the exact aspect ratio (longest side = 56 in)
 *  up     — too small (< 1 in): build at ×M, export at 96/M dpi
 */
export function pptOptions(w, h) {
  const nW = w / PPT.PX_PER_IN, nH = h / PPT.PX_PER_IN, ratio = Math.max(w, h) / Math.min(w, h);
  const out = { w, h, nativeW: nW, nativeH: nH, ratio, tooBig: Math.max(nW, nH) > PPT.MAX_IN + 1e-9, tooSmall: Math.min(nW, nH) < PPT.MIN_IN - 1e-9, options: [] };
  out.fits = !out.tooBig && !out.tooSmall;
  out.impossible = ratio > PPT.MAX_IN / PPT.MIN_IN + 1e-9;   // aspect > 56:1 can't be kept inside 1–56 in
  if (out.impossible) return out;
  const okSize = p => p.slideW <= PPT.MAX_IN + 1e-9 && p.slideH <= PPT.MAX_IN + 1e-9 && p.slideW >= PPT.MIN_IN - 1e-9 && p.slideH >= PPT.MIN_IN - 1e-9;
  if (out.fits) out.options.push(plan('native', '1:1 (96 px/in)', w, h, 1, { recommended: true }));
  if (out.tooBig) {
    for (let N = Math.ceil(Math.max(w, h) / (PPT.PX_PER_IN * PPT.MAX_IN) - 1e-9); N <= 64; N++) {
      const p = plan('exact', `1/${N} scale — exact export`, w, h, 1 / N, { N, recommended: true });
      if (okSize(p)) { out.options.push(p); break; }
      if (p.slideW < PPT.MIN_IN || p.slideH < PPT.MIN_IN) break;
    }
    const k = PPT.MAX_IN * PPT.PX_PER_IN / Math.max(w, h);
    const p = plan('max', 'Largest (56 in side)', w, h, k);
    if (okSize(p)) out.options.push(p);
  }
  if (out.tooSmall) {
    const M = Math.ceil(PPT.PX_PER_IN / Math.min(w, h) - 1e-9), p = plan('up', `×${M} scale (screen < 1 in at 96 px/in)`, w, h, M, { M, recommended: true });
    if (okSize(p)) out.options.push(p);
  }
  if (out.options.length && !out.options.some(o => o.recommended)) out.options[0].recommended = true;
  return out;
}

/** A rect (px, top-left based) on the slide: inches, cm, points, EMU. */
export function onSlide(p, r) {
  const c = v => ({ in: v * p.inPerPx, cm: v * p.inPerPx * PPT.CM_PER_IN, pt: v * p.inPerPx * PPT.PT_PER_IN, emu: Math.round(v * p.inPerPx * PPT.EMU_PER_IN) });
  return { name: r.name, px: { x: r.x, y: r.y, w: r.w, h: r.h }, left: c(r.x), top: c(r.y), width: c(r.w), height: c(r.h) };
}

/** Keynote: 1 pt = 1 slide px. If W or H > 8192, use the smallest 1/N (preferring whole-point results) that fits. */
export function keynotePlan(w, h) {
  const need = Math.ceil(Math.max(w, h) / KEYNOTE.MAX_PT - 1e-9);
  let N = need;
  if (N > 1) { for (let n = need; n <= need * 4; n++) if (isInt(w / n) && isInt(h / n)) { N = n; break; } }
  return { N, k: 1 / N, fits: need <= 1, ptW: w / N, ptH: h / N, whole: isInt(w / N) && isInt(h / N), oldLimitOk: Math.max(w, h) / N <= KEYNOTE.OLD_MAX_PT };
}
export const keynoteRect = (kp, r) => ({ name: r.name, x: r.x * kp.k, y: r.y * kp.k, w: r.w * kp.k, h: r.h * kp.k });

/** Plain-text / CSV summary. unit: 'in' | 'cm'. */
export function summaryRows(s, p, kp, rects, unit = 'in') {
  const u = unit === 'cm' ? 'cm' : 'in';
  const rows = [['Item', 'Left ' + u, 'Top ' + u, 'Width ' + u, 'Height ' + u, 'Left pt', 'Top pt', 'Width pt', 'Height pt', 'X px', 'Y px', 'W px', 'H px', 'Keynote X', 'Keynote Y', 'Keynote W', 'Keynote H']];
  rows.push(['Slide', '0', '0', f3(u === 'cm' ? p.slideWcm : p.slideW), f3(u === 'cm' ? p.slideHcm : p.slideH), '0', '0', f3(p.slideWpt), f3(p.slideHpt), '0', '0', String(s.w), String(s.h), '0', '0', f3(kp.ptW), f3(kp.ptH)]);
  for (const r of rects) {
    const o = onSlide(p, r), k = keynoteRect(kp, r);
    rows.push([r.name, f3(o.left[u]), f3(o.top[u]), f3(o.width[u]), f3(o.height[u]), f3(o.left.pt), f3(o.top.pt), f3(o.width.pt), f3(o.height.pt),
      f3(r.x), f3(r.y), f3(r.w), f3(r.h), f3(k.x), f3(k.y), f3(k.w), f3(k.h)]);
  }
  return rows;
}
export const toCsv = rows => rows.map(r => r.map(c => /[",\n]/.test(c) ? `"${String(c).replace(/"/g, '""')}"` : c).join(',')).join('\r\n') + '\r\n';

/**
 * Compare the slide size someone already has (cur = {w, h, unit: 'in'|'cm'}) with a W×H px screen.
 * When a slide is shown full-screen on a W×H output, PowerPoint/Keynote scale it uniformly to fit (no stretching),
 * so a slide with a different aspect ratio gets bars. Returns the fit, the bars, a matching size that keeps the
 * current width (or height), and an inPerPx/offset so screen rects can be placed on THEIR slide (onCurrent()).
 */
export function compareCurrent(w, h, cur) {
  if (!cur || !(cur.w > 0 && cur.h > 0)) return null;
  const toIn = v => (cur.unit === 'cm' ? v / PPT.CM_PER_IN : v);
  const cw = toIn(cur.w), ch = toIn(cur.h), slideAspect = cw / ch, screenAspect = w / h;
  const s = Math.min(w / cw, h / ch);                 // output px per slide inch when fitted to the W×H output
  const imgW = cw * s, imgH = ch * s, offX = (w - imgW) / 2, offY = (h - imgH) / 2;
  const diffPct = (slideAspect / screenAspect - 1) * 100;
  return {
    cw, ch, slideAspect, screenAspect, diffPct, match: Math.abs(diffPct) < 0.01,
    fitBy: w / cw <= h / ch ? 'width' : 'height', pxPerIn: s, inPerPx: 1 / s, imgW, imgH, offX, offY,
    barsPx: offY > 1e-6 ? { side: 'top/bottom', each: offY, total: h - imgH } : offX > 1e-6 ? { side: 'left/right', each: offX, total: w - imgW } : null,
    keepWidthH: cw * h / w, keepHeightW: ch * w / h,
    tooBig: cw > PPT.MAX_IN + 1e-9 || ch > PPT.MAX_IN + 1e-9, tooSmall: cw < PPT.MIN_IN - 1e-9 || ch < PPT.MIN_IN - 1e-9,
  };
}
/** Where a screen rect (px) lands on the CURRENT slide (inches/cm/pt), given compareCurrent()'s fit. */
export function onCurrent(c, r) {
  const k = c.inPerPx, cv = v => ({ in: v, cm: v * PPT.CM_PER_IN, pt: v * PPT.PT_PER_IN });
  return { name: r.name, left: cv((r.x - c.offX) * k), top: cv((r.y - c.offY) * k), width: cv(r.w * k), height: cv(r.h * k) };
}
