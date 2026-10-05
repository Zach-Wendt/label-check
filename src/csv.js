// Tiny CSV reader. Handles quotes and commas inside quotes.
// shortcut: no multi-line cells. Use a library if the files get fancy.
export function parseCsv(text) {
  const rows = String(text ?? "").replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  const split = (line) => {
    const out = [];
    let cell = "", quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quoted) {
        if (c === '"' && line[i + 1] === '"') { cell += '"'; i++; }
        else if (c === '"') quoted = false;
        else cell += c;
      } else if (c === '"') quoted = true;
      else if (c === ",") { out.push(cell); cell = ""; }
      else cell += c;
    }
    return [...out, cell].map((s) => s.trim());
  };
  const [head, ...body] = rows.map(split);
  if (!head) return [];
  const keys = head.map((h) => h.toLowerCase().replace(/[^a-z]/g, ""));
  return body.map((cells) => Object.fromEntries(keys.map((k, i) => [k, cells[i] ?? ""])));
}

// Map a CSV row to the form fields. Accepts common column names.
const pick = (r, ...names) => names.map((n) => r[n]).find((v) => v) ?? "";
export const rowToForm = (r) => ({
  file: pick(r, "file", "filename", "image"),
  brand: pick(r, "brand", "brandname"),
  classType: pick(r, "classtype", "class", "type"),
  abv: pick(r, "abv", "alcohol", "alcoholcontent"),
  volume: pick(r, "volume", "netcontents", "size"),
  producer: pick(r, "producer", "bottler", "producername", "address"),
  country: pick(r, "country", "countryoforigin", "origin"),
});

// Escape a cell for CSV. Prevents formula injection: cells starting with
// = + - @ tab or carriage return get a leading single quote.
function escapeCell(cell) {
  const s = String(cell ?? "");
  let out = s.replace(/"/g, '""');
  if (/^[\t\r=+\-@]/.test(s)) out = "'" + out;
  return `"${out}"`;
}

// Convert array of array of cells to CSV string. Lines joined by \r\n.
export function toCsv(rows) {
  return rows.map((row) => row.map(escapeCell).join(",")).join("\r\n");
}
