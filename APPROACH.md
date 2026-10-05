# Approach, tools, and assumptions

In short:

- **Approach**: AI reads the label in the browser; plain rules compare it with the application. No server, no
  outside calls, about a second per label. [More](#approach-ai-reads-rules-decide)
- **Tools used**: PaddleOCR PP-OCRv6 tiny (6.4 MB) through `ppu-paddle-ocr` and `onnxruntime-web`; plain
  JavaScript, no framework; esbuild; Node's test runner. [More](#tools-used)
- **Assumptions made**: the application data is typed in or comes from a CSV; class/type is the wording on the
  label; labels are in English; nothing is stored. [More](#assumptions-made)
- **Tested** on 16 made-up labels and 15 real approved labels. [Results](#real-labels).
  [Limits](#limits).

## Goal

Help a compliance agent check that a label matches its application. Most of that work is matching: is the
number on the form the number on the label? The tool does the matching so the agent can spend time on the
labels that need judgment.

## Needs and what I did

| Need | What I did |
|---|---|
| A result in about 5 seconds, or agents stop using it. | A small OCR model runs on the agent's own computer. No network trip. Measured: 0.2 to 0.5 s per sample label, 0.8 to 2.1 s per real product with 1 to 3 photos. |
| Work behind a firewall that blocks outside AI services. | The page calls nothing outside its own site. The model, its runtime, and the scripts are all served with the page. |
| Store nothing sensitive. | Photos never leave the browser. Nothing is saved. |
| Easy for every agent, whatever their comfort with computers. | One page, two numbered steps, large text, one main button. Four result words. Problems show first. Each note says what to do. |
| Batches of 200 to 300 labels. | Select many photos at once. A CSV gives each product its own application data, matched by file name. Results download as a CSV. The work runs on the agent's computer, so there is no server to overload. |
| A product has several labels (front, back, neck). | All photos of one product are read and checked together. The warning is usually on the back. |
| Use judgment on trivial differences. | Names ignore capitals, punctuation, spaces and word order: `STONE'S THROW` matches `Stone's Throw`. A near miss says **Check this**, not **No match**. |
| The warning must be exact. | Every word of 27 CFR 16.21 must be there. The heading must be `GOVERNMENT WARNING:` in capitals and bold, and the rest not bold (27 CFR 16.22(a)(2)). A missing word is named in the note. |
| Cope with poor photos. | Each photo is turned gray and its contrast stretched before reading. If no warning is found, the photo is read again turned sideways. A photo that still cannot be read gives **Can't read**. The tool does not guess. |

## Approach: AI reads, rules decide

The AI is the OCR: two neural networks (PaddleOCR PP-OCRv6 tiny) that find and read the text. No model
decides pass or fail. Rules do. Rules are fast, give the same answer every time, are easy to test, and are
easy to explain to an auditor. A large vision or language model would need a server or a cloud service,
which the firewall blocks.

- **Names** (brand, class/type, producer, country): remove spaces and punctuation, then find the closest
  stretch of label text by edit distance. If the words are in another order, each word is found on its own.
  100% is **Match**. 85% or more is **Check this**. `whisky` and `whiskey` count as the same word.
- **Alcohol and net contents**: read the numbers from the label and compare them as numbers. Units convert
  (`75 cL` = `750 mL`, `12 FL OZ` = 355 mL). Proof must be 2 × the alcohol %. The reader's O/0 mix-ups are
  fixed first.
- **Warning words**: find the heading, then look for each required word (3 letters or more) in the text after
  it, in any order. Real labels need the "any order": the reader mixes the warning with text in the next
  column. A long word may have one slip per 5 letters. All words found is the same text. A few missing is
  **Check this**, with the missing words named. Under 75% found is **No match**. A missing colon is
  **Check this**, because the reader also drops colons.
- **Warning bold**: bold letters have thicker strokes. The tool measures stroke width in the heading and in
  the text after it ([`src/bold.js`](src/bold.js)). Heading 1.25 × or more is bold. Less is **Check this**,
  never **No match**: small print on real labels can measure wrong.
- **Empty application**: if no application details are given, only the warning is checked and the result is
  **Check this**, never **Match**.

The rules are in [`src/match.js`](src/match.js). It has no screen or OCR code, so the tests run in under a
second.

## Tools used

| Tool | Why |
|---|---|
| PaddleOCR PP-OCRv6 tiny models, through `ppu-paddle-ocr` | Small (6.4 MB), fast on a CPU, runs in the browser. The small model (31 MB) was tried on the real labels: 3 times slower and no more accurate. |
| `onnxruntime-web` (CPU build) | Runs the models. The CPU build avoids a 28 MB WebGPU file. |
| `coi-serviceworker` | Lets a static host such as GitHub Pages run multi-threaded WebAssembly. The page reloads once on the first visit. |
| esbuild | Bundles two files. The only build step. |
| Node's built-in test runner | No test framework to install. |
| puppeteer-core | Development only. Runs the browser test and makes the sample labels. |

No framework, no database, no server.

## Sample labels

Made by [`scripts/make-labels.mjs`](scripts/make-labels.mjs); each changes one thing. The browser test
([`scripts/e2e.mjs`](scripts/e2e.mjs)) runs all of them with [`batch.csv`](public/samples/batch.csv).

| File | What is different | Result |
|---|---|---|
| old-tom-good | nothing | Match |
| stones-throw-case | application `Stone's Throw`, label `STONE'S THROW` | Match |
| old-tom-glare | glare across the label | Match |
| chateau-laroche-import | wine, import, `75 cL` vs `750 mL`, accented name | Match |
| northgate-ipa | beer, `12 FL OZ` vs `355 mL` | Match |
| old-tim-near-brand | label `OLD TIM`, application `OLD TOM` | Check this (brand) |
| old-tom-no-colon | `GOVERNMENT WARNING` without the colon | Check this (warning) |
| old-tom-plain-heading | heading not bold | Check this (warning) |
| old-tom-bold-body | whole warning bold | Check this (warning) |
| old-tom-wrong-abv | label 40%, application 45% | No match (alcohol) |
| old-tom-wrong-proof | 45% with 80 Proof | No match (alcohol) |
| old-tom-wrong-producer | a different bottler | No match (producer) |
| old-tom-title-case-warning | `Government Warning:` | No match (warning) |
| old-tom-changed-warning | different warning words | No match (warning) |
| old-tom-no-warning | no warning | No match (warning) |
| old-tom-tilted-dark | tilted, dark, blurred | Can't read |

## Real labels

15 approved labels from the [TTB COLA public registry](https://ttbonline.gov/colasonline/publicSearchColasBasic.do),
all photos of each. The application data was the brand name from the COLA form. Class/type was left out: the
COLA form holds a TTB category (`TABLE WHITE WINE`), not the words on the label. All 15 are approved, so
**Match** is right, **Check this** is a fair call for a person, and **No match** is a false alarm.

| TTB ID | Brand | Type | Photos | Result | Why |
|---|---|---|---|---|---|
| 14234001000251 | Six and Twenty | Bourbon | 2 | Match | |
| 26190001000061 | David Moret | White wine | 2 | Match | |
| 26190001000063 | David Moret | White wine | 2 | Match | |
| 26230001000100 | Chateau Laroque | Red wine | 2 | Match | |
| 26230001000300 | Domaine Quartz Cat | Dessert wine | 2 | Match | |
| 26235001000100 | Rosebank | Scotch | 2 | Match | |
| 26245001000100 | Hayner Distilling | Blended whisky | 2 | Match | |
| 26240001000500 | BJ's | Stout | 1 | Check this | warning heading not readable |
| 26245001000300 | Breakside Brewery | Beer | 1 | Check this | heading measured as not bold |
| 26250001000100 | Domaine Notre Dame des Pallières | Red wine | 2 | Check this | warning heading not readable |
| 26260001000100 | Cantarina | White wine | 3 | Check this | brand near miss; warning words missed |
| 26260001000500 | Pursuit Series | Bourbon | 2 | Check this | warning words missed |
| 26265001000300 | Famiglia Santoni | Liqueur | 2 | Check this | warning words missed |
| 26240001000300 | Hueco Perdido | Beer | 1 | No match | the COLA brand field also holds the style ("Mexican-style amber lager") |
| 26257001000366 | Belle Isle | Bourbon | 2 | No match | the warning is tiny curved print the reader cannot read |

Before the fixes in this version the same 15 gave 1 Match. The fixes came from these labels: several photos
per product, contrast stretch, sideways reading, warning words in any order, words split or joined by the
reader, brand words in another order.

## Assumptions made

- The application data is typed in or comes from a CSV. The tool does not connect to the agency's systems.
- The class/type the agent types is the wording on the label, as in the sample application
  (`Kentucky Straight Bourbon Whiskey`), not the COLA category.
- Labels are in English.
- The input is label artwork or a photo of a label. Flat artwork is the main case.
- A prototype stores nothing, so there is no retention design beyond "nothing leaves the browser".
- The warning text was checked against 27 CFR 16.21 on eCFR on 2026-10-05.

## Limits

- **Speed is measured on one computer** (Windows, Edge, local server). A slow office computer will be slower.
  The first visit downloads about 20 MB.
- **Word order in the warning is not checked.** Real labels need this (columns mix), but a warning with its
  words shuffled would pass.
- **Bold is a measure, not proof.** Thresholds are set on the sample labels (bold headings 1.56 to 1.61, plain
  0.96). A heading that measures plain gives **Check this** so a person looks.
- **Type size is not checked.** 27 CFR 16.22(b) sets a minimum size by container size, but a photo has no
  scale.
- **Tiny or curved print** can be unreadable (1 of 15 real labels). A tilted, dark photo gives **Can't read**.
- **A name is found anywhere on the label.** If the producer's name contains the brand, the brand check can
  find it there. A short word in a name can match inside a longer word.
- **One reader thread.** Labels run one after another. Several threads would speed up large batches.

## Security

- File names and notes are escaped before they show on the page.
- The results CSV puts a `'` in front of any cell that starts with `=`, `+`, `-`, `@`, tab or return, so a
  spreadsheet does not run it as a formula.
- No uploads, no storage, no outside calls.

## If this went to production

- Host it in the agency's approved cloud, behind its sign-in.
- Add audit logging and a retention policy.
- Read the application data from the agency's system instead of typing it.
- Map each COLA class/type category to the label wordings it allows.
- Test on a large set of real labels and tune the thresholds on them.
