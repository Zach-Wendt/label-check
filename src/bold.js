// Stroke width for the bold check (boldResult in match.js). Pure: works on grayscale pixels, no DOM, no OCR.
// 27 CFR 16.22(a)(2): "GOVERNMENT WARNING" must be bold, and the rest of the warning must not be.
// Bold letters have thicker strokes, so we compare stroke width in the heading with the text after it.

// Typical stroke width in a grayscale patch (Uint8Array, row-major, w x h).
// Dark runs along each row are stroke cross-sections. Mean of the middle half ignores serifs and bars.
export function strokeWidth(gray, w, h) {
  let lo = 255, hi = 0;
  for (const v of gray) { if (v < lo) lo = v; if (v > hi) hi = v; }
  if (hi - lo < 40) return 0; // no ink, or no contrast
  const cut = (lo + hi) / 2;
  const runs = [];
  for (let y = 0; y < h; y++) {
    let run = 0;
    for (let x = 0; x <= w; x++) {
      if (x < w && gray[y * w + x] < cut) run++;
      else if (run) { runs.push(run); run = 0; }
    }
  }
  if (runs.length < 20) return 0;
  runs.sort((a, b) => a - b);
  const mid = runs.slice(runs.length >> 2, runs.length - (runs.length >> 2));
  return mid.reduce((a, b) => a + b, 0) / mid.length;
}
