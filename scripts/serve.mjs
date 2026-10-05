// Local server for testing. Sends the headers that allow multi-thread wasm.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const root = "public";
const port = Number(process.env.PORT) || 8080;
const types = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".wasm": "application/wasm", ".png": "image/png", ".jpg": "image/jpeg",
  ".csv": "text/csv", ".txt": "text/plain", ".ort": "application/octet-stream",
};

createServer(async (req, res) => {
  let url = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (url.endsWith("/")) url += "index.html";
  try {
    const file = join(root, normalize(url).replace(/^(\.\.[/\\])+/, ""));
    const data = await readFile(file);
    res.writeHead(200, {
      "Content-Type": types[extname(file)] ?? "application/octet-stream",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    });
    res.end(data);
  } catch {
    res.writeHead(404).end("Not found");
  }
}).listen(port, () => console.log(`http://localhost:${port}`));
