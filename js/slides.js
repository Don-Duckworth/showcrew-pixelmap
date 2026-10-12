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
export const KEYNOTE = { MAX_PT: 8192, OLD_MAX_PT: 4000, MIN_PT: 200, EMU_PER_PT: 12700, OOXML_MAX_PT: 4032 };

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

/**
 * PowerPoint slide size → screen pixels (v1.5).
 * by 'ppi': px = inches × ppi (PowerPoint's own mapping is 96 px/in — its default picture export).
 * by 'width': the slide is exported at a target pixel width (e.g. Mac File ▸ Export ▸ PNG width, or the output raster):
 *             ppi = width ÷ slide inches, height follows the slide's aspect.
 * Returns the exact (fractional) pixels and whole-pixel values (rounded half up), plus the ppi used.
 */
export function slideToPx(sw, sh, unit = 'in', by = 'ppi', value = PPT.PX_PER_IN) {
  const toIn = v => (unit === 'cm' ? v / PPT.CM_PER_IN : v);
  const wIn = toIn(+sw), hIn = toIn(+sh), v = +value;
  if (!(wIn > 0 && hIn > 0 && v > 0)) return null;
  const ppi = by === 'width' ? v / wIn : v;
  const exW = wIn * ppi, exH = hIn * ppi;
  const rnd = x => Math.max(1, Math.round(x + 1e-9));
  return { wIn, hIn, ppi, exW, exH, w: by === 'width' ? Math.round(v) : rnd(exW), h: rnd(exH),
    outOfRange: wIn > PPT.MAX_IN + 1e-9 || hIn > PPT.MAX_IN + 1e-9 || wIn < PPT.MIN_IN - 1e-9 || hIn < PPT.MIN_IN - 1e-9 };
}
/** "55.561x5.28" (or "141.125x13.411cm") for screen names. */
export const slideLabel = (w, h, unit = 'in') => `${f3(+w)}x${f3(+h)}${unit === 'cm' ? 'cm' : ''}`;

// ---------- v1.6: full-screen playback fit on a target output resolution ----------
// Slide Show on a W×H output: PowerPoint (and Keynote) scale the slide UNIFORMLY to fit inside the output and center it —
// no stretching, no cropping. Different aspect → black bars: left/right (pillarbox) or top/bottom (letterbox).
// Exact bar sizes can be fractional; the renderer rounds them to whole pixels and doesn't say which side gets an odd pixel,
// so odd totals are reported as "one side n, the other n+1" and fractional ones as "about".
export const f2 = v => { const x = Math.round(v * 100) / 100; return Math.abs(x - Math.round(x)) < 1e-9 ? String(Math.round(x)) : x.toFixed(2).replace(/0+$/, ''); };
export const COMMON_OUTPUTS = [[1280, 720], [1920, 1080], [1920, 1200], [2560, 1440], [3840, 2160], [4096, 2160]];
const EPS = 1e-6;

/** Describe one bar axis. total = exact px of black on that axis (both sides together). */
export function barsText(total, axis) {
  const where = axis === 'tb' ? 'top and bottom' : 'left and right', W = axis === 'tb' ? 'Black top and bottom' : 'Black left and right';
  if (!(total > EPS)) return { none: true, text: 'No black bars — the slide fills the output exactly', where, approx: false };
  const each = total / 2, Tr = Math.round(total), whole = Math.abs(total - Tr) < 0.01;
  if (total < 0.5) return { none: true, subpixel: true, where, approx: true, text: `No black bars (only ${f2(total)} px left over in total — less than one pixel row, at most a faint edge)` };
  if (whole && Tr % 2 === 0) return { none: false, where, approx: false, each: Tr / 2, total: Tr, text: `${W}: ${Tr / 2} px each (${Tr} px total)` };
  if (whole) return { none: false, where, approx: true, odd: true, each, total: Tr, lo: (Tr - 1) / 2, hi: (Tr + 1) / 2,
    text: `${W}: about ${f2(each)} px each (${Tr} px total, odd) — one side gets ${(Tr - 1) / 2} px and the other ${(Tr + 1) / 2} px; PowerPoint doesn't document which side gets the extra pixel` };
  const ae = Math.round(each);
  return { none: false, where, approx: true, each, total, totalRounded: Tr,
    text: `${W}: about ${ae >= 1 ? ae + ' px' : 'less than 1 px'} each (exact ${f3(each)} px each, ${f3(total)} px total${Tr !== total ? ` ≈ ${Tr} px once rounded to whole pixels` : ''})` };
}

/** Fit a slide (inches) full screen into an outW×outH output. */
export function playbackFit(slideWIn, slideHIn, outW, outH) {
  const sw = +slideWIn, sh = +slideHIn, W = +outW, H = +outH;
  if (!(sw > 0 && sh > 0 && W > 0 && H > 0)) return null;
  const byW = W / sw, byH = H / sh, k = Math.min(byW, byH);
  const imgW = Math.abs(byW - k) < 1e-12 ? W : sw * k, imgH = Math.abs(byH - k) < 1e-12 ? H : sh * k;
  const totX = Math.max(0, W - imgW), totY = Math.max(0, H - imgH);
  const axis = totY > EPS ? 'tb' : totX > EPS ? 'lr' : null, bars = barsText(axis === 'tb' ? totY : totX, axis || 'tb');
  const kind = bars.none ? 'none' : axis === 'tb' ? 'letterbox' : 'pillarbox';
  return {
    slideWIn: sw, slideHIn: sh, outW: W, outH: H, pxPerIn: k, scale96: k / PPT.PX_PER_IN, fitBy: byW <= byH ? 'width' : 'height',
    imgW, imgH, offX: totX / 2, offY: totY / 2, totX, totY, axis, kind, bars,
    headline: kind === 'none' ? bars.text : `${kind === 'letterbox' ? 'Letterbox' : 'Pillarbox'} — ${bars.text}`,
    areaText: `${f2(imgW)} × ${f2(imgH)} px`, coverPct: imgW * imgH / (W * H) * 100,
  };
}

/**
 * Where screen rects (native screen px) land in output px after playbackFit(), assuming the deck is laid out across the
 * whole slide in proportion to the screen (as the PixelMap template / "scale" duplicate do): x/screenW of the slide width, etc.
 * "native" = the rect's own position, scaled to the output if the output size isn't the screen size.
 * Edges that move ≥ 1 px are flagged.
 */
export function landRects(fit, screenW, screenH, rects) {
  const sx = fit.outW / screenW, sy = fit.outH / screenH;
  return rects.map(r => {
    const n = { x0: r.x * sx, x1: (r.x + r.w) * sx, y0: r.y * sy, y1: (r.y + r.h) * sy };
    const o = { x0: fit.offX + r.x / screenW * fit.imgW, x1: fit.offX + (r.x + r.w) / screenW * fit.imgW, y0: fit.offY + r.y / screenH * fit.imgH, y1: fit.offY + (r.y + r.h) / screenH * fit.imgH };
    const shift = { x0: o.x0 - n.x0, x1: o.x1 - n.x1, y0: o.y0 - n.y0, y1: o.y1 - n.y1 };
    const NAMES = { x0: 'left', x1: 'right', y0: 'top', y1: 'bottom' };
    const flags = Object.keys(shift).filter(e => Math.abs(shift[e]) >= 1 - 1e-9).map(e => ({ edge: NAMES[e], shift: shift[e] }));
    const maxShift = Math.max(...Object.values(shift).map(Math.abs));
    return { name: r.name, kind: r.kind, native: n, out: o, w: o.x1 - o.x0, h: o.y1 - o.y0, shift, maxShift, flags, moved: flags.length > 0 };
  });
}

// ---------- v1.8: Keynote, full treatment ----------
// Facts (checked Oct 2026):
//  • Slide size: Document sidebar ▸ Document tab ▸ Slide Size ▸ Custom Slide Size, type width × height, OK. (Apple, "Change the slide size in
//    Keynote on Mac" https://support.apple.com/guide/keynote/change-the-slide-size-tan929f13a1f/mac and "Set up your presentation in Keynote"
//    https://support.apple.com/en-us/119885.) Keynote measures slides in points and treats 1 pt as 1 slide pixel (Wide = 1920 × 1080).
//  • Limits: Apple publishes none. COMMUNITY-REPORTED: max 8192 × 8192 (Eric Alba, LinkedIn, Oct 2023, macOS Sonoma; Stoatworks "Wallslide"
//    measured 200–8192 pt by asking Keynote until it refused, https://wallslide.stoatworks-labs.com/). Keynote '08 era: 4000.
//  • Export: File ▸ Export To ▸ Movie has a Resolution pop-up with Custom (enter width/height); File ▸ Export To ▸ Images lets you pick slides and
//    format (Apple, "Export to PowerPoint or another file format", https://support.apple.com/guide/keynote/export-to-powerpoint-or-another-file-format-tana0d19882a/mac)
//    — the guide lists no size field for Images; images come out at the slide size (Apple Community answers).
//  • Playback: Keynote '08 guide (Apple): a slide smaller than the display plays at its original size, centered, with a black border unless
//    "Scale slides up to fit display" is on. Current Keynote scales the slide uniformly to fit the presentation display (black bars when the aspect differs).
//  • .key can't be generated offline: since Keynote 6 (2013) it's an undocumented zip of Snappy-compressed protobuf (IWA) files.
//    Keynote opens .pptx and keeps the slide size; 1 in = 72 pt, so 1 pt = 12 700 EMU and a W-pt slide is W × 12 700 EMU wide (exact).
//    PowerPoint's / the OOXML schema's slide limit is 56 in = 4032 pt (51 206 400 EMU); a Keynote size above that is outside the schema.
//  • Theme: View ▸ Edit Slide Layouts (add the guide image to a layout), then File ▸ Save Theme ▸ Add to Theme Chooser.
//    https://support.apple.com/guide/keynote/add-and-edit-slide-layouts-tan7a2b69972/mac · https://support.apple.com/guide/keynote/tanb343cb739/mac

function kOpt(key, label, w, h, k, extra = {}) {
  const ptW = w * k, ptH = h * k, wholeW = Math.max(1, Math.round(ptW)), wholeH = Math.max(1, Math.round(ptH)), exact = isInt(ptW) && isInt(ptH);
  const backW = wholeW / k, backH = wholeH / k;
  return { key, label, k, ptW, ptH, wholeW, wholeH, exact, backW, backH, errPx: Math.max(Math.abs(backW - w), Math.abs(backH - h)),
    scaleText: k === 1 ? '1:1' : extra.N ? `1/${extra.N}` : extra.M ? `×${extra.M}` : `×${f3(k)}`,
    emuW: wholeW * KEYNOTE.EMU_PER_PT, emuH: wholeH * KEYNOTE.EMU_PER_PT, overOoxml: wholeW > KEYNOTE.OOXML_MAX_PT || wholeH > KEYNOTE.OOXML_MAX_PT,
    fits: wholeW <= KEYNOTE.MAX_PT && wholeH <= KEYNOTE.MAX_PT && wholeW >= KEYNOTE.MIN_PT && wholeH >= KEYNOTE.MIN_PT, ...extra };
}
/**
 * Keynote options for a W×H px screen (max 8192, min 200 pt — community-reported):
 *  native — 1:1 when it fits;  exact — 1/N where W/N and H/N are whole points (up to 4, smallest first);
 *  max — the largest size that keeps the exact aspect (longest side 8192), with whole-pt rounding and its error back at native;
 *  up — ×M when a side is under 200 pt;  fitN — smallest 1/N that fits when no 1/N divides evenly (not whole, flagged).
 */
export function keynoteOptions(w, h) {
  const MAX = KEYNOTE.MAX_PT, MIN = KEYNOTE.MIN_PT, big = Math.max(w, h), small = Math.min(w, h), out = { w, h, options: [] };
  out.fitsNative = big <= MAX && small >= MIN; out.tooBig = big > MAX; out.tooSmall = small < MIN;
  out.impossible = big / small > MAX / MIN + 1e-9;
  if (out.impossible) return out;
  if (out.fitsNative) out.options.push(kOpt('native', '1:1 native', w, h, 1));
  if (!out.tooSmall) {
    const n0 = Math.max(2, Math.ceil(big / MAX - 1e-9)); let found = 0;
    for (let N = n0; N <= 64 && found < 4 && small / N >= MIN - 1e-9; N++) if (w % N === 0 && h % N === 0) { out.options.push(kOpt('exact' + N, `1/${N} exact`, w, h, 1 / N, { N })); found++; }
    if (out.tooBig && !found) { const N = n0; if (small / N >= MIN) out.options.push(kOpt('fit' + N, `1/${N} (not whole)`, w, h, 1 / N, { N })); }
  }
  if (out.tooBig) { const k = MAX / big, o = kOpt('max', 'Largest (8192 side)', w, h, k); o.fits = o.wholeH >= MIN && o.wholeW >= MIN; if (o.fits) out.options.push(o); }
  if (out.tooSmall) { const M = Math.ceil(MIN / small - 1e-9); if (big * M <= MAX) out.options.push(kOpt('up', `×${M} (side under 200 pt)`, w, h, M, { M })); }
  const rec = out.options.find(o => o.key === 'native') || out.options.find(o => o.N && o.exact && o.fits) || out.options.find(o => o.key === 'max') || out.options[0];
  if (rec) rec.recommended = true;
  return out;
}
/** A screen rect (px) in Keynote's Arrange inspector units (pt; X/Y = top-left from the slide's top-left) for option o. */
export const keyRect = (o, r) => ({ name: r.name, x: r.x * o.k, y: r.y * o.k, w: r.w * o.k, h: r.h * o.k });
/** The user's current Keynote slide (W × H pt) vs the screen. */
export function keyCompare(w, h, cur) {
  if (!cur || !(cur.w > 0 && cur.h > 0)) return null;
  const slideAspect = cur.w / cur.h, screenAspect = w / h, diffPct = (slideAspect / screenAspect - 1) * 100;
  return { cw: +cur.w, ch: +cur.h, slideAspect, screenAspect, diffPct, match: Math.abs(diffPct) < 0.01, keepWidthH: cur.w * h / w, keepHeightW: cur.h * w / h,
    scale: Math.min(w / cur.w, h / cur.h), tooBig: Math.max(cur.w, cur.h) > KEYNOTE.MAX_PT, tooSmall: Math.min(cur.w, cur.h) < KEYNOTE.MIN_PT };
}
/** Keynote summary rows (CSV/TXT). */
export function keySummaryRows(s, o, rects) {
  const rows = [['Item', 'X pt', 'Y pt', 'W pt', 'H pt', 'X px', 'Y px', 'W px', 'H px']];
  rows.push(['Slide', '0', '0', String(o.wholeW), String(o.wholeH), '0', '0', String(s.w), String(s.h)]);
  for (const r of rects) { const q = keyRect(o, r); rows.push([r.name, f3(q.x), f3(q.y), f3(q.w), f3(q.h), f3(r.x), f3(r.y), f3(r.w), f3(r.h)]); }
  return rows;
}
