import { checkLabel, MATCH, CHECK, NO_MATCH, CANT_READ } from "./match.js";
import { parseCsv, rowToForm, toCsv } from "./csv.js";

const $ = (id) => document.getElementById(id);

// Form box id -> the row name checkLabel gives it.
const FIELDS = {
  brand: "Brand name",
  classType: "Class / type",
  abv: "Alcohol",
  volume: "Net contents",
  producer: "Producer and address",
  country: "Country of origin",
};
const KEY = Object.fromEntries(Object.entries(FIELDS).map(([k, name]) => [name, k]));
const SAMPLE = { brand: "OLD TOM DISTILLERY", classType: "Kentucky Straight Bourbon Whiskey", abv: "45", volume: "750 mL" };

let photos = []; // { file, url }
let csvRows = []; // form rows from the CSV
let results = []; // { name, items, form, text, overall, rows, note, seconds }

// --- Reader (OCR worker) --------------------------------------------------
const worker = new Worker("worker.js", { type: "module" });
const waiting = new Map();
let nextId = 1;
worker.onmessage = ({ data }) => {
  if (data.ready) return say("Ready. Add a label photo to begin.");
  if (data.fatal) return say(`Could not start the reader. ${data.fatal}`, true);
  const done = waiting.get(data.id);
  waiting.delete(data.id);
  data.error ? done?.reject(new Error(data.error)) : done?.resolve(data);
};
const read = (buffer) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    waiting.set(id, { resolve, reject });
    worker.postMessage({ id, buffer }, [buffer]);
  });

// Shrink big phone photos. Small images read as well and run much faster.
// shortcut: no straighten or glare fix. A poor photo gives "Can't read".
async function shrink(file, max = 1600) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = new OffscreenCanvas(Math.round(bmp.width * k), Math.round(bmp.height * k));
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  return (await c.convertToBlob({ type: "image/png" })).arrayBuffer();
}

// --- Products -------------------------------------------------------------
// One product can have several photos (front, back, neck). A CSV row names them: "front.png; back.png".
// Without a CSV, the boxes describe one application, so all photos are one product.
function products() {
  const left = new Map(photos.map((p) => [p.file.name.toLowerCase(), p]));
  const out = [];
  for (const form of csvRows) {
    const items = form.file.split(";").map((n) => left.get(n.trim().toLowerCase())).filter(Boolean);
    for (const p of items) left.delete(p.file.name.toLowerCase());
    if (items.length) out.push({ items, form });
  }
  const rest = [...left.values()];
  const note = "This photo is not in the CSV file. The boxes above were used.";
  if (csvRows.length) for (const p of rest) out.push({ items: [p], form: formValues(), note });
  else if (rest.length) out.push({ items: rest, form: formValues() });
  return out;
}

// --- Screen ---------------------------------------------------------------
function say(text, bad = false) {
  $("status").textContent = text;
  $("status").className = bad ? "bad" : "";
}

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const formValues = () => Object.fromEntries(Object.keys(FIELDS).map((k) => [k, $(k).value]));

const LOOK = {
  [MATCH]: ["ok", "✔"],
  [CHECK]: ["warn", "?"],
  [NO_MATCH]: ["bad", "✖"],
  [CANT_READ]: ["warn", "!"],
};
const badge = (s, stamp = "") => `<span class="badge ${LOOK[s][0]} ${stamp}"><span aria-hidden="true">${LOOK[s][1]}</span> ${s}</span>`;

function showPhotos(skipped = []) {
  const n = photos.length;
  const names = photos.slice(0, 3).map((p) => p.file.name).join(", ") + (n > 3 ? ` and ${n - 3} more` : "");
  const count = products().length;
  const go = count > 1 ? `Check ${count} labels` : "Check label";
  const together = n > 1 && !csvRows.length ? " They are checked together as one product (front, back, neck). For many products, add a CSV file in step 2." : "";
  const msg = n ? `Added ${plural(n, "photo")}: ${names}. Select “${go}”.${together}` : "No photos yet.";
  $("photo-count").textContent = msg + (skipped.length ? ` Skipped ${plural(skipped.length, "file")} that are not photos: ${skipped.join(", ")}.` : "");
  $("photo-count").className = n ? "added" : "";
  $("photo-list").innerHTML = photos
    .map((p) => `<li><img src="${p.url}" alt=""><span>${esc(p.file.name)}</span></li>`)
    .join("");
  $("go").disabled = n === 0;
  $("go").textContent = go;
}

function render() {
  const count = (s) => results.filter((r) => r.overall === s).length;
  const cantRead = count(CANT_READ);
  $("summary").textContent = results.length
    ? `${plural(results.length, "label")}: ${count(MATCH)} Match, ${count(CHECK)} Check this, ${count(NO_MATCH)} No match${cantRead ? `, ${cantRead} Can't read` : ""}.`
    : "";
  $("download").hidden = results.length === 0;
  // Problems first, so the agent sees them at the top.
  const order = { [NO_MATCH]: 0, [CANT_READ]: 1, [CHECK]: 2, [MATCH]: 3 };
  $("results").innerHTML = [...results]
    .sort((a, b) => order[a.overall] - order[b.overall])
    .map(card)
    .join("");
}

function card(r) {
  const rows = r.rows
    .map((x) => `<tr><td>${esc(x.name)}</td><td>${esc(KEY[x.name] ? r.form[KEY[x.name]] : "Required wording")}</td><td>${badge(x.status)}</td><td>${esc(x.note)}</td></tr>`)
    .join("");
  return `<details class="card" ${r.overall === MATCH ? "" : "open"}>
    <summary>${badge(r.overall, "stamp")} <strong>${esc(r.name)}</strong> <small>${r.seconds.toFixed(1)} s</small></summary>
    <div class="body">
      <div class="shots">${r.items.map((p) => `<a href="${p.url}" target="_blank" rel="noopener"><img src="${p.url}" alt="Label photo ${esc(p.file.name)}. Select to enlarge."></a>`).join("")}</div>
      <div class="side">
        ${r.note ? `<p>${esc(r.note)}</p>` : ""}
        ${rows ? `<table><thead><tr><th>Item</th><th>Application says</th><th>Result</th><th>Note</th></tr></thead><tbody>${rows}</tbody></table>` : ""}
        ${r.text ? `<details><summary>Text the reader found</summary><pre>${esc(r.text)}</pre></details>` : ""}
      </div>
    </div></details>`;
}

// --- Run ------------------------------------------------------------------
async function run() {
  $("go").disabled = true;
  results = [];
  render();
  const list = products();
  for (const [i, { items, form, note }] of list.entries()) {
    const name = items.map((p) => p.file.name).join(" + ");
    say(`Checking ${i + 1} of ${list.length}: ${name}`);
    const t0 = performance.now();
    let result, text = "";
    try {
      const reads = [];
      for (const p of items) reads.push(await read(await shrink(p.file)));
      text = reads.map((r) => r.text).join("\n");
      // The warning is on one photo; use the bold measure from that one.
      result = checkLabel(form, text, reads.map((r) => r.bold).find(Number.isFinite) ?? null);
    } catch {
      result = { overall: CANT_READ, rows: [], note: "Could not open this photo. Add a clearer photo." };
    }
    if (note) result.note = [result.note, note].filter(Boolean).join(" ");
    results.push({ name, items, form, text, ...result, seconds: (performance.now() - t0) / 1000 });
    render();
  }
  say(`Done. ${plural(list.length, "label")} checked.`);
  $("go").disabled = false;
}

function downloadCsv() {
  const rows = [["file", "overall", "item", "application says", "result", "note"]];
  for (const r of results) {
    if (!r.rows.length) rows.push([r.name, r.overall, "", "", "", r.note]);
    for (const x of r.rows) rows.push([r.name, r.overall, x.name, r.form[KEY[x.name]], x.status, x.note]);
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([toCsv(rows)], { type: "text/csv" }));
  a.download = "label-results.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// --- Wire up --------------------------------------------------------------
function addPhotos(files) {
  for (const p of photos) URL.revokeObjectURL(p.url);
  const all = [...files];
  photos = all.filter((f) => f.type.startsWith("image/")).map((file) => ({ file, url: URL.createObjectURL(file) }));
  results = [];
  render();
  showPhotos(all.filter((f) => !f.type.startsWith("image/")).map((f) => f.name));
}

$("photos").onchange = (e) => addPhotos(e.target.files);
$("csv").onchange = async (e) => {
  const file = e.target.files[0];
  csvRows = file ? parseCsv(await file.text()).map(rowToForm).filter((r) => r.file) : [];
  $("csv-count").textContent = file ? `${plural(csvRows.length, "row")} read.` : "";
  showPhotos();
};
$("go").onclick = run;
$("download").onclick = downloadCsv;
$("sample").onclick = async () => {
  for (const k of Object.keys(FIELDS)) $(k).value = SAMPLE[k] ?? "";
  const blob = await (await fetch("samples/old-tom-good.png")).blob();
  addPhotos([new File([blob], "old-tom-good.png", { type: "image/png" })]);
  say("Sample added.");
};
const drop = $("drop");
drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("over"); };
drop.ondragleave = () => drop.classList.remove("over");
drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove("over"); addPhotos(e.dataTransfer.files); };

showPhotos();
say("Getting ready. This takes a few seconds the first time.");
