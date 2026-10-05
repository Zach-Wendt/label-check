// End-to-end check in a real browser. Loads the page, runs every sample, prints results and timings.
// Run: npm run build && node scripts/e2e.mjs        (TEXT=1 also prints what the reader saw)
// Other labels: SAMPLES=<folder> CSV=<file> node scripts/e2e.mjs
import puppeteer from "puppeteer-core";
import { readdirSync } from "node:fs";

process.env.PORT ??= "8099";
await import("./serve.mjs");

const BROWSER = process.env.BROWSER ?? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const browser = await puppeteer.launch({ executablePath: BROWSER, headless: true });
const page = await browser.newPage();
page.on("console", (m) => ["error", "warning"].includes(m.type()) && console.log("[browser]", m.text()));
page.on("pageerror", (e) => console.log("[page error]", e.message));
page.on("requestfailed", (r) => console.log("[request failed]", r.url()));
page.on("response", (r) => r.status() >= 400 && console.log("[http", r.status() + "]", r.url()));

const t0 = Date.now();
await page.goto(`http://localhost:${process.env.PORT}/`);
await page.waitForFunction(() => document.getElementById("status").textContent.startsWith("Ready"), { timeout: 120000 });
console.log(`Ready in ${((Date.now() - t0) / 1000).toFixed(1)} s. Isolated: ${await page.evaluate(() => crossOriginIsolated)}`);

const DIR = process.env.SAMPLES ?? "public/samples"; // folder of label photos
const CSV = process.env.CSV ?? `${DIR}/batch.csv`;
const photos = readdirSync(DIR).filter((f) => /\.(png|jpe?g)$/i.test(f)).map((f) => `${DIR}/${f}`);
await (await page.$("#photos")).uploadFile(...photos);
await (await page.$("#csv")).uploadFile(CSV);
await page.waitForFunction(() => document.getElementById("csv-count").textContent.includes("rows"));
await page.click("#go");
await page.waitForFunction(() => document.getElementById("status").textContent.startsWith("Done"), { timeout: 600000 });

const clean = (s) => s.replace(/\s+/g, " ").trim();
const out = await page.$$eval("#results details.card", (ds) =>
  ds.map((d) => ({
    head: d.querySelector("summary").textContent.replace(/\s+/g, " ").trim(),
    rows: [...d.querySelectorAll("tbody tr")].map((r) => [...r.children].map((c) => c.textContent.replace(/\s+/g, " ").trim()).join(" | ")),
    note: d.querySelector(".body > p")?.textContent ?? "",
    text: d.querySelector("pre")?.textContent ?? "",
  })),
);
for (const r of out) {
  console.log(`\n${r.head}${r.note ? "\n  " + r.note : ""}\n  ` + r.rows.join("\n  "));
  if (process.env.TEXT) console.log("  --- reader saw ---\n  " + r.text.split("\n").join("\n  "));
}
console.log("\n" + clean(await page.$eval("#summary", (e) => e.textContent)));
await browser.close();
process.exit(0);
