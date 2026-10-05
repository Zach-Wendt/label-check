// Build: bundle the app and worker, copy the runtime files we host ourselves.
import { build } from "esbuild";
import { cpSync, mkdirSync } from "node:fs";

await build({
  entryPoints: ["src/app.js", "src/worker.js"],
  bundle: true,
  format: "esm",
  minify: true,
  // The CPU-only build. The default build also asks for a 28 MB WebGPU file.
  alias: { "onnxruntime-web": "onnxruntime-web/wasm" },
  outdir: "public",
  logLevel: "info",
});

mkdirSync("public/ort", { recursive: true });
// shortcut: CPU wasm only (14 MB). Copy the .jsep files too if you turn on WebGPU.
for (const f of ["ort-wasm-simd-threaded.wasm", "ort-wasm-simd-threaded.mjs"]) {
  cpSync(`node_modules/onnxruntime-web/dist/${f}`, `public/ort/${f}`);
}
cpSync("node_modules/ppu-paddle-ocr/coi-serviceworker.js", "public/coi-serviceworker.js");
