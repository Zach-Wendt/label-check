// OCR worker. Runs the models off the main thread so the page stays quick.
// All files load from our own site. No outside calls.
import * as ort from "onnxruntime-web";
import { PaddleOcrService } from "ppu-paddle-ocr/web";
import { strokeWidth } from "./bold.js";

const base = new URL("./", self.location.href).href;
ort.env.wasm.wasmPaths = `${base}ort/`;

// shortcut: CPU (wasm) only. WebGPU needs a 28 MB extra file. Add it if speed falls short.
// shortcut: tiny model for size. If reads are poor, host a larger model (PP-OCRv6 small) in public/models.
let ready;
const start = () =>
  (ready ??= (async () => {
    const service = new PaddleOcrService({
      model: {
        detection: `${base}models/det_v6_tiny.ort`,
        recognition: `${base}models/rec_v6_tiny.ort`,
        charactersDictionary: `${base}models/dict_v6_tiny.txt`,
      },
      session: { executionProviders: ["wasm"] },
      processing: { engine: "canvas-native" },
    });
    await service.initialize();
    self.postMessage({ ready: true });
    return service;
  })());

start().catch((e) => self.postMessage({ fatal: String(e?.message ?? e) }));

self.onmessage = async ({ data: { id, buffer } }) => {
  try {
    const service = await start();
    const img = levels(await createImageBitmap(new Blob([buffer])));
    let { text, lines } = await service.recognize(await png(img));
    let bold = boldRatio(img, lines);
    // Cans often print the warning sideways. If no warning words were found, read the photo turned both ways.
    if (!WARNING_WORDS.test(text)) {
      for (const deg of [90, -90]) {
        const t = turn(img, deg);
        const r = await service.recognize(await png(t));
        if (WARNING_WORDS.test(r.text)) { text += "\n" + r.text; bold = boldRatio(t, r.lines); break; }
      }
    }
    self.postMessage({ id, text, bold });
  } catch (e) {
    self.postMessage({ id, error: String(e?.message ?? e) });
  }
};

const WARNING_WORDS = /GOVERNMENT|SURGEON|PREGNANCY/i;

// Gray copy of the photo with its tones spread to full black and white.
// Pale print on a pale label (common on cans) becomes dark enough to read.
function levels(bmp) {
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  const g = c.getContext("2d");
  g.drawImage(bmp, 0, 0);
  const im = g.getImageData(0, 0, c.width, c.height);
  const d = im.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) hist[(d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 | 0]++;
  // Darkest and lightest 1% set the range.
  const cut = (d.length / 4) * 0.01;
  let lo = 0, hi = 255;
  for (let n = 0; n + hist[lo] < cut; lo++) n += hist[lo];
  for (let n = 0; n + hist[hi] < cut; hi--) n += hist[hi];
  const k = 255 / Math.max(1, hi - lo);
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.max(0, Math.min(255, (((d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000) - lo) * k));
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  return c;
}

// The photo turned by 90 or -90 degrees.
function turn(src, deg) {
  const c = new OffscreenCanvas(src.height, src.width);
  const g = c.getContext("2d");
  g.translate(c.width / 2, c.height / 2);
  g.rotate((deg * Math.PI) / 180);
  g.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}

const png = async (c) => (await c.convertToBlob({ type: "image/png" })).arrayBuffer();

// Gray pixels of one box of the image.
function gray(bmp, x, y, w, h) {
  [x, y, w, h] = [x, y, w, h].map(Math.round);
  if (w < 4 || h < 4) return null;
  const c = new OffscreenCanvas(w, h).getContext("2d");
  c.drawImage(bmp, x, y, w, h, 0, 0, w, h);
  const d = c.getImageData(0, 0, w, h).data;
  const g = new Uint8Array(w * h);
  for (let i = 0; i < g.length; i++) g[i] = (d[i * 4] * 299 + d[i * 4 + 1] * 587 + d[i * 4 + 2] * 114) / 1000;
  return { g, w, h };
}

// Stroke width of "GOVERNMENT WARNING" divided by stroke width of the warning text after it.
// The reader gives one box per line, so the heading's place in the line is estimated from its letters.
// shortcut: estimate by letter count. Capitals are wider, so we stay well inside each part.
function boldRatio(bmp, lines) {
  const items = lines.flat();
  const i = items.findIndex((r) => /GOVERNMENT/i.test(r.text));
  if (i < 0) return null;
  const { text, box } = items[i];
  const t = text.toUpperCase();
  const start = t.indexOf("GOVERNMENT") / t.length;
  const end = (t.includes("WARNING") ? t.indexOf("WARNING") + 7 : t.indexOf("GOVERNMENT") + 10) / t.length;
  const head = gray(bmp, box.x + box.width * start, box.y, box.width * (end - start) * 0.95, box.height);
  const after = Math.min(1, end * 1.45 + 0.03);
  const next = items[i + 1]?.box;
  const body = (1 - after) * box.width > box.width * 0.15
    ? gray(bmp, box.x + box.width * after, box.y, box.width * (1 - after), box.height)
    : next && gray(bmp, next.x, next.y, next.width, next.height);
  if (!head || !body) return null;
  const b = strokeWidth(body.g, body.w, body.h);
  return b ? strokeWidth(head.g, head.w, head.h) / b : null;
}
