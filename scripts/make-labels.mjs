// Make test labels as PNG files. Renders simple HTML in a headless browser.
// Run: node scripts/make-labels.mjs   (needs Edge or Chrome; set BROWSER to override)
import puppeteer from "puppeteer-core";
import { mkdirSync, writeFileSync } from "node:fs";

const BROWSER = process.env.BROWSER ?? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BODY =
  "(1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. " +
  "(2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.";

// One label. Options change one thing at a time so each file tests one rule.
function label({ brand = "OLD TOM DISTILLERY", cls = "Kentucky Straight Bourbon Whiskey", abv = "45% Alc./Vol. (90 Proof)",
  vol = "750 mL", head = "GOVERNMENT WARNING:", warning = true, body = BODY, extra = "", filter = "",
  maker = "Distilled and bottled by Old Tom Distillery<br>Bardstown, Kentucky", origin = "", headBold = true, bodyBold = false }) {
  return `<body style="margin:0"><div style="width:900px;height:1200px;background:#f1e6cf;font-family:Georgia,serif;color:#2a1d10;
    text-align:center;position:relative;overflow:hidden;${filter}">
    <div style="margin:60px;border:6px double #2a1d10;height:1080px;padding:40px;box-sizing:border-box">
      <div style="font-size:64px;font-weight:bold;margin-top:90px;letter-spacing:3px">${brand}</div>
      <div style="font-size:34px;margin-top:40px;font-style:italic">${cls}</div>
      <div style="font-size:40px;margin-top:70px">${abv}</div>
      <div style="font-size:40px;margin-top:20px">${vol}</div>
      <div style="font-size:26px;margin-top:70px">${maker}${origin ? `<br>${origin}` : ""}</div>
      ${warning ? `<div style="font-size:19px;text-align:left;margin-top:80px;line-height:1.3">${headBold ? `<b>${head}</b>` : head} ${bodyBold ? `<b>${body}</b>` : body}</div>` : ""}
    </div>${extra}</div></body>`;
}

const glare = `<div style="position:absolute;left:-100px;top:280px;width:1200px;height:260px;transform:rotate(-18deg);
  background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.95),rgba(255,255,255,0))"></div>`;

const labels = {
  "old-tom-good": label({}),
  "old-tom-title-case-warning": label({ head: "Government Warning:" }),
  "old-tom-wrong-abv": label({ abv: "40% Alc./Vol. (80 Proof)" }),
  "old-tom-no-warning": label({ warning: false }),
  "old-tom-changed-warning": label({ body: "(1) Drinking during pregnancy may be unsafe. (2) Do not drive after drinking." }),
  "stones-throw-case": label({ brand: "STONE'S THROW", cls: "London Dry Gin", abv: "42% Alc./Vol.", vol: "1 L" }),
  "old-tom-glare": label({ extra: glare }),
  "old-tom-tilted-dark": label({ filter: "transform:rotate(-7deg) scale(.92);filter:brightness(.7) contrast(.9) blur(1px);" }),
  "old-tom-wrong-proof": label({ abv: "45% Alc./Vol. (80 Proof)" }),
  "old-tom-no-colon": label({ head: "GOVERNMENT WARNING" }),
  "old-tom-plain-heading": label({ headBold: false }),
  "old-tom-bold-body": label({ bodyBold: true }),
  "old-tim-near-brand": label({ brand: "OLD TIM DISTILLERY", maker: "Distilled and bottled by Old Tim Distillery<br>Bardstown, Kentucky" }),
  "old-tom-wrong-producer": label({ maker: "Bottled by Smith Spirits<br>Louisville, Kentucky" }),
  "chateau-laroche-import": label({ brand: "CHÂTEAU LAROCHE", cls: "Bordeaux Red Wine", abv: "13.5% Alc./Vol.", vol: "75 cL",
    maker: "Bottled by Château Laroche<br>Bordeaux", origin: "Product of France" }),
  "northgate-ipa": label({ brand: "NORTHGATE BREWING", cls: "India Pale Ale", abv: "6.5% Alc./Vol.", vol: "12 FL OZ",
    maker: "Brewed and canned by Northgate Brewing<br>Portland, Oregon" }),
};

mkdirSync("public/samples", { recursive: true });
const browser = await puppeteer.launch({ executablePath: BROWSER, headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 1200 });
for (const [name, html] of Object.entries(labels)) {
  await page.setContent(html);
  await page.screenshot({ path: `public/samples/${name}.png` });
  console.log("made", name);
}
await browser.close();

// A CSV for the batch test. Each row says what the application claims.
const csv = [
  "file,brand,classType,abv,volume,producer,country",
  ...["old-tom-good", "old-tom-title-case-warning", "old-tom-wrong-abv", "old-tom-no-warning", "old-tom-changed-warning", "old-tom-glare", "old-tom-tilted-dark",
    "old-tom-wrong-proof", "old-tom-no-colon", "old-tom-plain-heading", "old-tom-bold-body", "old-tim-near-brand"]
    .map((f) => `${f}.png,OLD TOM DISTILLERY,Kentucky Straight Bourbon Whiskey,45,750 mL,,`),
  "stones-throw-case.png,Stone's Throw,London Dry Gin,42,1 L,,",
  'old-tom-wrong-producer.png,OLD TOM DISTILLERY,Kentucky Straight Bourbon Whiskey,45,750 mL,"Old Tom Distillery, Bardstown, Kentucky",',
  "chateau-laroche-import.png,Château Laroche,Bordeaux Red Wine,13.5,750 mL,Château Laroche,France",
  "northgate-ipa.png,Northgate Brewing,India Pale Ale,6.5,355 mL,,",
].join("\r\n");
writeFileSync("public/samples/batch.csv", csv);
