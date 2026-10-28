# MDlearn Studio

A local web app over a folder of Markdown notes: read them, study them with spaced repetition, keep
notes and ask AI beside the text, and let AI build the course. It runs on your computer
(`mdlearn studio [folder]`); nothing leaves it except what you send to Claude.

## 1. Architecture

```
packages/studio/
  server/            Node: Hono on node:http (one port for the API, the app and live events)
    index.ts         startStudio(): settings, workspaces, watcher, jobs, Vite (dev) or dist/web (prod)
    security.ts      Host allowlist · LAN token → cookie · same-origin + X-MDL on changes · CSP · capabilities
    app.ts           routes (below)
    workspaces.ts    open folders (recents), document cache by mtime, library tree, upload, folder browser
    watcher.ts       chokidar → fs.changed / tree.changed / progress.changed events (150 ms debounce)
    study.ts         queue / item (redacted) / check / hint / record / report / section map
    today.ts         the Today dashboard: plan, forecast, heatmap, calibration, leeches, deadline pacing
    cards.ts         quick cards from a passage → learn/<doc>/my-cards.learn.md (passage.ts finds the source text)
    python.ts        Pyodide files served to the Python sandbox, downloaded once into ~/.cache/mdlearn/pyodide
    ask/             ask the whole folder: search.ts (BM25 + cosine + rank fusion) · vectors.ts · service.ts
    editor.ts        read / save (never over a newer file) / create Markdown files, local history
    sheet.ts         cheat sheet of a document (+ key ideas by the local model)
    export/          anki.ts (.apkg writer) · html.ts
    import/          web · pdf-fast · anki · notebook importers (PDF high quality is an AI job)
    knowledge/       per-folder index (formulas, defined terms, links, text chunks), kept current by the watcher
    notes.ts         notes + AI threads in <folder>/.mdlearn/notes/<doc>.json
    insert.ts        insert a block after a passage (explicit "Insert" action; refuses stale views)
    ai/              ollama.ts · ask.ts · judge.ts · visualise.ts (local model)
                     claude.ts · jobs.ts · guard.ts · recipes.ts · fake.ts (course jobs)
  sandbox/           sim.html + sim.js: the simulation runner · py.html + py.js: the Python runner · html.html + html.js:
                     the :::html runner (each its own origin and CSP)
  help.md            the Help page (rendered through the document pipeline)
  shared/types.ts    the API contract (types only)
  web/               React 19 + Vite 8 + Tailwind 4 + TanStack Query + zustand + wouter
  e2e/               Playwright tests (desktop + phone viewport) against a demo server
```

Everything that understands Markdown lives in `@mdlearn/core`: the same compiler, checkers, FSRS
scheduler and tutor functions serve the terminal, the MCP tutor and the Studio, so the three agree on
grades, schedules and progress.

**Documents.** `parseDocument()` (core) reads any Markdown faithfully ("document mode": `---` kept,
`{{…}}` literal, `<details>` folded, other HTML shown as text, a stray `$$` recovered, inline math across
line breaks). Headings carry the outline's anchors and numbers (`§3.1`). Authored widgets and visual blocks
inside a document work too. On the ESA corpus: 103 documents, 20,164 formulas, 0 lost math blocks, p95
parse 150 ms (`npm run check-corpus -- ~/CODING/ESA-PROJECTS`).

**Lessons and answers.** Lessons reach the browser **redacted** (`redactWidget`: no keys, feedback, ideas,
solutions). Answers are checked on the server (`checkStructured`) after validating their shape
(`parseWebAnswer`); feedback comes back with per-option / per-gap verdicts.

**Progress.** `learn/.mdlearn/progress.json` is an append-only event log shared by every surface. Each write
takes a lock, re-reads the file, keeps the union of both logs (events have ids), validates it and renames
atomically, so the CLI, the MCP tutor and the Studio can study at the same time without losing anything.

## 2. API

| Area | Routes |
|---|---|
| Session | `GET /api/session` (client local/lan, capabilities) · `GET /api/engines` (local model, Claude Code) |
| Folders | `GET /api/workspaces` · `POST /api/workspaces/open` · `GET /api/fs/browse` · `POST /api/workspaces/upload` · `POST /api/workspaces/tutorial` (copy the tutorial into the library and open it; `reset` starts over) |
| Help | `GET/POST /api/onboarding` (welcome tour seen) · `GET /api/help` (the Help document) |
| Reading | `GET /api/w/:ws/tree` · `doc?path=` (ETag) · `doc/section` · `raw` · `asset` · `lesson` · `search?q=` · `POST compile` · `POST doc/check` (practice) |
| Today & goals | `GET today` · `GET/POST goals` (daily goal, deadlines, restore suspended cards) · `POST cards/suspend` |
| Quick cards | `GET doc/passage?path&quote` (the passage's source) · `POST cards` (adds a card to the document's my-cards lesson) |
| Ask the folder | `GET ask/status` · `POST ask/setup` (download the search model, index) · `POST ask` · `GET ask/history` · `POST ask/delete` · `POST ask/note` · answers stream as `ai.delta` / `ai.done` events (`noteId: "ask"`) |
| Editor | `GET file?path` · `POST files/save` (409 if the file changed) · `files/create` · `preview` · `GET history` · `history/version` |
| Import & export | `POST import/web` · `import/file` (multipart: pdf-fast, pdf-quality, anki, notebook) · `GET export/anki?scope=` · `GET sheet?path` · `POST sheet/ideas` |
| Batch courses | `GET ai/batch/candidates` · `POST ai/batches` · `GET ai/batches[/:id]` · `POST ai/batches/:id/stop` · `resume` |
| Library | `GET formulas?q&doc&limit` · `glossary?q&compact` · `links?path` · `doc/summary?path` · `map` · `knowledge/status` |
| Study | `GET study/queue` · `study/item` · `POST study/check` · `study/hint` · `study/record` · `study/judge` · `GET study/report` · `study/map` |
| Notes & local AI | `GET/POST notes` · `POST notes/:id/update` · `notes/:id/delete` · `POST ai/ask` · `ai/cancel` · `ai/visualise` · `POST files/insert` |
| Course jobs | `GET/POST ai/jobs` · `GET ai/jobs/:id` · `POST ai/jobs/:id/cancel` · `undo` · `followup` |
| Live | `GET /api/events?ws=` (SSE: fs/tree/progress/notes changes, AI deltas, job events; replay by `Last-Event-ID`) |
| Sandbox | `GET /sandbox/sim.html`, `/sandbox/sim.js`, `/sandbox/py.html`, `/sandbox/py.js`, `/sandbox/html.html`, `/sandbox/html.js`, `/sandbox/pyodide/:file` · `GET /api/python/packages` |

Errors are `{ "error": { "code", "message" } }` with a message written for the learner.

## 3. AI

**Local model (Ollama, default `qwen3:8b`)** — questions about a passage (grounded in the section text,
streamed into the note), "explain", feedback on a free-text explanation against the card's key ideas
(JSON-schema answer, a suggestion only), and "visualise": the model drafts a `plot`, `formula` or `animate`
block, the compiler checks it, the diagnostics go back to the model (≤ 3 attempts). Requests are queued one
at a time (8 GB GPU), with `num_ctx` 8192.

**Claude Code** — through the Agent SDK with an isolated configuration:

| Setting | Value | Why |
|---|---|---|
| executable | settings → SDK-bundled CLI → `mise which claude` | never the mise shim (it writes to stdout) |
| auth | your Claude Code login; `env` is an allowlist (no `ANTHROPIC_*`) | an API key would silently take over |
| `settingSources` | `[]` + a local plugin (`dist/plugin`: the four MDlearn skills) | your user skills, hooks and MCP servers stay out |
| MCP | `mdlearn` server only (`strictMcpConfig`) | outlines, sections, `lint_lesson` |
| tools | Read, Glob, Grep, Write, Edit, MultiEdit, Skill, TodoWrite; no Bash, web or subagents | |
| permissions | `dontAsk` + PreToolUse hooks | every write goes through `beforeWrite` (scope check + undo snapshot); reads limited to the folder |

Recipes: **create a course** (the server scaffolds lesson files from the document's outline, Claude fills
them following the mdlearn-curriculum / mdlearn-course / mdlearn-visuals skills, then lints until clean),
**improve a lesson** (one file), **something else** (free request, `learn/` by default), and **follow-up**
(resumes the job's Claude session). One job runs at a time (they share your subscription limits; usage
warnings are shown in the log). After a job the server re-lints every lesson it touched. **Undo** restores
every file to its state before the job and deletes the files it created — except files you edited since.
`--fake-ai` swaps Claude for a scripted engine (tests, demos).

## 4. Notes beside the text

Selecting text gives Note · Ask · Explain · Visualise. A note is anchored by the quoted text with 32
characters of context and its section (W3C TextQuoteSelector), found again after edits (exact match with
context, then without, then a unique match; otherwise it is listed as "passage changed"). Highlights use
the CSS Custom Highlight API, so the document's DOM is never modified. On wide screens each card sits next
to its passage and follows the scroll; the card you are working on keeps its place.

## 5. Visuals runtime

Formulas arrive as MathJSON and are evaluated by `@mdlearn/core/eval` (no `eval`, no parser in the
browser). Plots are SVG, monochrome (curves differ by dash pattern), with a y range that covers every
slider setting so moving a slider visibly moves the curve. Explained formulas use KaTeX with `trust`
limited to `\htmlClass{mdl-t-N}`. Simulations run in `<iframe sandbox="allow-scripts">` (opaque origin, no
access to the app) whose page has its own CSP (`default-src 'none'`, scripts only from the server, workers
from blobs, no network); the lesson's code runs in a Worker with an OffscreenCanvas, and a watchdog
terminates it when it stops sending heartbeats (≈3 s), so an endless loop never freezes the app.

`:::html` blocks (DSL §8.14) run in `/sandbox/html.html`, also `<iframe sandbox="allow-scripts">` with an
opaque origin, under a CSP that allows inline scripts and styles but no network (`default-src 'none'`,
images from `data:`/`blob:` only). The bootstrap waits for the author's code by `postMessage`, writes it
behind a prelude — the Studio's colours and fonts as CSS variables, `window.mdlearn` (`theme`,
`reducedMotion`, `done()`, `resize()`) — and reports the content height, a heartbeat and uncaught errors.
The block starts on Play (or `{auto}`) so a document never runs code on open, and a page that stops
answering for 5 s is removed. `mdlearn.done()` scores are shown, never recorded.

**HTML in documents and lessons** (DSL §8.13). The compiler pairs allowlisted inline tags and container
blocks into `htmlInline` / `htmlBlock` nodes, which React renders as elements with filtered attributes;
any other block arrives as `htmlRaw` and is cleaned by DOMPurify in `web/prose/SafeHtml.tsx` (HTML + SVG
profiles, no `style`/`script`/forms/frames, no `class`/`id` except SVG ids prefixed per block, inline
styles reduced to the compiler's safe list, relative images through the asset route). The page CSP still
blocks inline scripts and handlers if anything slipped through.

**Games** (DSL §8.12: `match`, `match{memory}`, `sort`, `speed`) are posed without keys like every
widget. Each move — a pair, two flipped cards, one statement — is a partial answer (`null` = not yet)
checked through `study/check` with `practice: true` or `doc/check`, neither of which logs; the result
holds only what that move earned (no `expected` until the round is complete). Memory and speed rounds
submit themselves when they end. Motion (lines, flips, FLIP moves, a countdown) uses transforms only and
follows `prefers-reduced-motion`.


## 6. Study tools

**First run.** A five-step welcome tour (`web/help/Tour.tsx`) outlines the sidebar parts it describes the
first time a folder opens, as a bottom sheet on a phone; finishing or skipping saves
`onboarding.tourDone` in `studio.json`. Help (`?`, the sidebar, the command palette) replays it, opens the
interactive tutorial — `examples/showcase`, copied by the build to `dist/tutorial` and by the server into
`<library>/MDlearn Tutorial` so answers and notes never touch the app's files — and renders `help.md`.

**Today** (the home page of a folder) shows the session to do now with a Start button, how much of the
daily goal is done, a 7-day forecast of reviews, a 26-week heatmap, minutes studied (attempt timestamps in
sessions; gaps over 5 minutes split them), confidence calibration (sure × right/wrong over 30 days, written
as a sentence), the leeches and the documents with how well each is remembered. The numbers come from
`learn/analytics.ts` in core (pure functions over the event log), so `mdlearn report` agrees.

**Deadlines.** `learn/.mdlearn/goals.json` holds the daily goal and optional deadlines per document or for the
whole folder. New cards per day = cards not yet started ÷ days left; the study queue uses it as its default
number of new cards (minus those already started today), and Today says "on track", "2 days behind — 14 new
cards a day to finish by 15 Nov" or "overdue".

**Leeches.** A card is a leech after four failures once it has been reviewed (unless the last two ratings were
good), or three "again" in a row. Today lists them with the last wrong answers, and offers *Reread* (the
section), *Fix with AI* (a Claude job on that lesson file, prompt = the card + the wrong answers: split it,
add a worked example or a hint, then lint) and *Suspend* (goals.json `suspended`, honoured by the CLI and the
MCP tutor too).

**Quick cards.** Select text → Card. The passage's *source* comes back (math stays `$…$`), you click words or
whole formulas to blank them (cloze) or write a question and an answer, and the card is appended to
`learn/<document>/my-cards.learn.md` (created with the document as `source:` and a `::read[§]` per card).
The server compiles the file before writing and refuses on errors, so a card can never break a lesson.

## 7. Python in the browser

Python code blocks in documents and lessons get **Run**, **Run from the top** (the cells above, then this
one), **Edit** and **Restart**; the page has one interpreter, so cells share variables like a notebook.
Pyodide (CPython 3.14 on WebAssembly) runs in a Worker inside `/sandbox/py.html` (opaque origin, its own CSP:
no network, scripts from the server only). A watchdog ends runs after 30 s (and the load after 4 min), the
interpreter restarts and the page stays usable. `print` output streams in, `matplotlib` figures arrive as
PNG, and a missing library (torch, tensorflow, …) gets a message listing what is available (numpy, scipy,
pandas, matplotlib, scikit-learn, xarray, rasterio, geopandas, shapely and ~300 more).

The interpreter's files are served by `/sandbox/pyodide/:file` from the `pyodide` package; extra packages
are downloaded **once** from the pinned jsDelivr release into `~/.cache/mdlearn/pyodide/<version>/` by the
server (allowlist of file names from the lock file, atomic writes), so the browser itself never leaves the
machine and the next run is offline.

**Exercises.** A `:::code` exercise in Python with checks (`tests` block, plain `assert` lines) is graded in
the browser: *Check* runs the learner's code, then the checks in the same interpreter, and sends
`{ type: 'code', text, tests: { passed, total } }`. The server marks it right when all pass, nearly right when
some do ("2 of 3 checks pass."), and the failing `assert` lines are shown. The reference solution never
reaches the browser. The CLI and MCP tutor keep self-checking, as before.

## 8. Library: formulas, glossary, links, map

The **knowledge index** (`<folder>/.mdlearn/index/knowledge.json`) holds, for each document, its display
formulas (with section and the sentence before), defined terms, links to other documents and text chunks.
It is built in the background on first use (about 4 s for the 105 ESA documents; instant afterwards because
unchanged files are skipped by mtime) and updated by the file watcher.

- **Formulas** — every display formula in the folder, searchable by words and TeX, filtered by document;
  copy the TeX or open it in its section.
- **Glossary** — terms defined as "**term** is …", "**term**: …", "**term** — …", in `Term | Meaning` tables
  and list items, A to Z with where each is defined. The heuristics favour precision (instructions, citations,
  file names and one-liners are dropped); a wrong entry costs a glance.
- **Hovers** — in the reader each defined term is underlined once per document (dotted) with its definition on
  hover or focus; everyday short words are left alone. Links to other documents show a card (what it is, how
  well you remember it). Both can be switched off with the button in the top bar.
- **Links tab** — what the document points to and what points to it (prerequisites marked).
- **Map → Graph** (the default) — every document as a dot sized by its words (square root, capped) and
  coloured by how well you remember it, prerequisites as arrows, links dashed; optionally each document's
  lessons as small dots. Hover lights a document's neighbours and names it; a click opens it (a tap on a touch
  screen chooses it instead); drag, scroll or pinch to move and zoom. Filters for prerequisites, links, lessons
  and unconnected documents; `?doc=` draws what lies 1–3 steps around one document. The panel beside it
  (search, the chosen document with what it builds on, leads to and links with) is the keyboard way through;
  the canvas itself is hidden from screen readers. **2D** is force-graph on a canvas; **3D** is 3d-force-graph
  (three.js), a separate chunk loaded only when you switch to it, never turning by itself. With reduced motion
  the layout is computed before the first frame and camera moves are instant. If WebGL is not available, the
  graph falls back to 2D with a note. The 2D/3D choice and the filters are remembered on the device.
  `web/knowledge/graph.ts` builds the data (pure, unit-tested); `graphEngine2d.ts` / `graphEngine3d.ts` draw it
  from the theme's CSS variables, redrawn when the theme or accent changes.
- **Map → Layers** (`?view=layers`) — the documents as a left-to-right graph (prerequisites point to what needs
  them), memory dot per node. Whole folder (zoom, fit) or "what surrounds this document" with links optionally
  included; every node is a keyboard link.

## 9. Ask your whole folder

**Ask** (`/w/:ws/ask`, also "Ask: …" in the search palette) answers a question from your own documents.

1. **Passages.** The knowledge index splits every document into passages of at most ~400 words that know their
   section (3,273 for the ESA folder).
2. **Retrieval.** BM25 over the words (lightly stemmed, TeX ignored) and — when the search model is installed —
   cosine similarity over meaning vectors; the two rankings are fused with reciprocal-rank fusion (k = 60) and
   the best eight passages go on. Without vectors the search is by words only and says so.
3. **Answer.** The local model (default `qwen3:8b`) gets the passages and the question, must answer *only* from
   them, and cites each claim as `[1]`, `[2]`; `[n]` becomes a link to that passage's section. If nothing
   matches, no model call is made. Answers stream like a note's and can be stopped.
4. **History** in `<folder>/.mdlearn/asks.json` (last 100). *Keep as a note* attaches the question and answer to
   the section a source comes from, so it shows up beside that text.

**The search model.** `embeddinggemma` (≈620 MB, 768 numbers per passage) is downloaded once through Ollama's
`/api/pull` from the Ask page (or *Index now*); progress is shown and indexing runs in the background —
you can ask meanwhile. Vectors live in `.mdlearn/index/embeddings.{json,bin}` keyed by a hash of each passage,
so editing a document re-embeds only what changed; a different model invalidates them. Embedding calls take
turns with chat requests on the single-GPU queue. Setup needs the `ai` capability (the computer running
MDlearn); asking works from the phone.

## 10. Cheat sheets and exports

**Cheat sheet** (`/w/:ws/sheet?path=`, the list icon in a document's top bar): the document's formulas and
defined terms section by section, from the knowledge index. *Add key ideas* asks the local model for 2–5
one-sentence ideas per top-level section (JSON-schema answer, cached in `.mdlearn/sheets/` by a hash of the
section text, so only changed sections are asked again). *Print or save as PDF* uses the browser: one or two
columns on A4, with the app's chrome hidden (any page prints content only).

**Anki export** (`GET /api/w/:ws/export/anki?scope=<document | lesson | empty for all>`, the download icon of
a document that has lessons): a legacy-format `.apkg` (zip + SQLite via `node:sqlite` and `fflate`) that every Anki
imports. Quiz, order, explain, steps and code become *Basic* notes (quiz: options on the front, the right
answer and each feedback on the back); cloze becomes *Cloze* with all gaps of one card hidden together — also
inside formulas. Math uses Anki's `\( \)` and `\[ \]`. Note ids are stable, so exporting again and importing
updates your cards instead of duplicating them. Only the computer running MDlearn may export (the file contains
the answers).

## 11. The built-in editor

The pencil in a document or lesson opens `/w/:ws/edit?path=`: CodeMirror 6 on the left, the preview on the
right (a lesson is compiled and shown redacted; its questions can be tried after saving). Problems from the
compiler appear as underlines and in a list under the editor (click to jump). **Insert** adds a ready block —
question types, visuals, callouts, `::read[§]`; `:::` completes block names. **Save** (Ctrl+S) refuses to write over
a file that changed on disk since you opened it (it offers *Load the file as it is now* or *Save mine over it*); a
tab that regains focus notices outside changes. Every save keeps the previous text in
`.mdlearn/history/<path>/` (last 20; History restores one into the editor, unsaved). *New note* in the sidebar
creates a file anywhere in the folder (never replacing one). All of it needs the `write` capability: the computer
running MDlearn, not a phone on `--lan`.

## 12. Importers

*Import…* in the sidebar (or on the start page, which imports into `<library>/Imports`):

| Source | What happens |
|---|---|
| From a chat | Paste what ChatGPT, Gemini or Claude.ai wrote with the MDlearn prompt ([CHAT_PROMPT.md](CHAT_PROMPT.md)). The answer is split at its `<!-- file: path -->` lines (raw or fenced, chat text around it ignored; paths kept inside the folder and made `.learn.md`), every lesson is compiled where it will live **before anything is written**, and the dialog lists each file with its cards or errors. Import saves the files without errors in one new course folder (the chat's own folder name, made unique); files with errors are not saved, and **Copy the fix request** gives a message naming each flagged line with what it means, to paste back into the chat. `POST /api/w/:ws/import/chat/check` and `/import/chat` (`write`) |
| Web page | The server fetches it (http/https, 5 MB, 15 s), keeps the article (Readability), writes KaTeX/MathJax back as `$…$`, keeps tables and code, saves up to 20 pictures into `assets/`, and writes `imports/<title>.md` with the source address |
| PDF, quick | `pdftohtml -xml` (poppler): headings by font size, paragraphs by spacing, lists by indentation, running headers/footers and page numbers dropped, hyphenated words joined; formulas come out as plain text and the dialog says so |
| PDF, high quality | The PDF is kept in `imports/source/` and a Claude job reads it in 20-page ranges and writes Markdown with LaTeX into one new file (it may write nothing else) |
| Anki deck | `.apkg` (legacy and newer zstd collections): one lesson per deck (100 cards each), Basic → explain card, Cloze → gap card, pictures copied, each card compiled on its own and skipped (and counted) if invalid; the **review history can be kept** so schedules carry over |
| Notebook | Markdown cells as written, code cells fenced, text output quoted, figures saved; nothing is executed |

Imports never replace a file (a second import gets `-2`). They need `write`; the high-quality PDF also needs `ai`.

## 13. A course for the whole folder, or on any topic

AI Studio → *Create a course* → **Any topic**: a topic, level, study time, language and optional notes. The job
(`course.topic`) writes a `course.md` overview and the lessons into a new folder named after the topic, with
the same fixed prompt the MCP server's `create_course` uses (`coursePrompt` in core): from the notes when
given (read, never edited), otherwise from well-established knowledge with doubtful claims flagged
`<!-- added: verify … -->` and sources listed. Its write scope is that new folder only.

**Settings → Use MDlearn in other apps** (`GET /api/integrations`, files under `/api/integrations/…`) shows the
Claude Code plugin's install commands (on the computer running Studio only), the Claude.ai skill download, and
the prompt for other chats; `scripts/build-integrations.ts` builds them into `dist/integrations/` on every build.
Studio's own AI jobs start the MCP server with `MDLEARN_READONLY=1`, so every write goes through the job's guard.


AI Studio → *Whole folder* lists the documents without lessons (words, planned lessons), lets you tick them and
choose Haiku, Sonnet or Opus, then builds them **one after another** as ordinary course jobs. The plan is saved in
`.mdlearn/jobs/batch-<id>.json`: *Stop* cancels the current job; *Continue* (also after closing the program, when the batch shows as stopped)
takes back the unfinished skeletons of cut-short jobs and does the rest — finished documents are not repeated.
One batch runs at a time.

## 14. Settings: appearance and language

**Settings** (`/w/:ws/settings`, the gear in the sidebar footer, or Ctrl+K → *Settings*) holds the per-device
choices; they live in `localStorage` and `public/theme.js` applies them before the first paint.

- **Theme**: light, dark or the system's (the sidebar's three buttons do the same).
- **Accent colour**: graphite (the default), blue, green, violet, amber, rose, or any colour from the picker.
  `web/lib/accent.ts` turns one hue into `--accent`, `--accent-ink`, `--accent-soft`, `--on-accent` and `--focus`
  for each theme (OKLCH, gamut-clamped), each checked for 4.5:1 contrast (3:1 for focus rings); they are set as
  `--accent-l` / `--accent-d` … on `<html>`, and `app.css` falls back to graphite without them. Buttons, focus
  rings, the text cursor, selections and the progress bars use it.
- **Language**: English, Italiano, Español, Français, Català. `web/i18n/`: the English text is the key
  (`t('Study now')`, `tp(n, '{n} card', '{n} cards')` with CLDR plurals); the dictionary loads before the app
  module, and changing the language reloads the page. Dates and numbers follow it (`Intl` with `locale()`), the
  Help page has a translation per language (`help.<lang>.md`, `GET /api/help?lang=`), and the server's fixed
  error messages are translated by the web client. The course form and the copied chat prompt default to the
  interface language. `test/i18n.test.ts` collects every key from the source and fails on a missing
  translation, a lost `{placeholder}` or a missing plural form. The CLI, the MCP tutor and lesson content stay
  in their own language.

## 15. Security

| Threat | Defence |
|---|---|
| Another website in your browser (CSRF, DNS rebinding) | Host allowlist; every change needs same-origin `Origin`/`Sec-Fetch-Site`, the `X-MDL: 1` header and a JSON (or multipart) body; no CORS; GET never changes anything |
| Other devices on the network | off by default (bound to 127.0.0.1); `--lan` binds 0.0.0.0 and requires a 32-byte token (link/QR → HttpOnly, SameSite=Strict cookie); LAN clients can read, study, take notes and ask the local model — not open folders, write files or run Claude jobs (`--lan-full` to allow). Plain HTTP: use trusted networks |
| Malicious Markdown / uploads | the compiler keeps only allowlisted HTML tags and attributes (other blocks are sanitised by DOMPurify in the browser, scripts/styles/frames/forms/handlers removed, E107) and drops unsafe URLs; the page CSP forbids inline scripts and handlers; React renders text; KaTeX trust allowlist; Mermaid `strict`; uploads limited to Markdown/text/images, 2 MB each, sanitised relative paths |
| Path traversal | every path goes through `realPath`-based `inRoot` (symlinks and dangling links resolved), hidden folders refused; job ids must be UUIDs; undo only restores files inside the folder |
| AI jobs | scoped writes (folder or single file, `.md` only, `.git/.claude/.mdlearn` protected), folder-only reads, no shell, no network tools, snapshots + undo |
| Imports | the web importer accepts only http/https without credentials, caps size and time, never follows into other schemes; files are written with `wx` (never replacing) inside `inRoot`; PDFs are parsed by poppler in a temp folder; uploads ≤ 100 MB, `write` capability; the editor only saves existing `.md` files inside the folder (hidden folders refused) with a stale-file check |
| Simulations, Python and `:::html` | opaque-origin sandboxes, own CSP without network; simulations and Python in a Worker + watchdog, `:::html` started on demand + heartbeat watchdog; the server only serves allow-listed Pyodide files and caches them atomically |
| Answer keys | games and questions reach the browser without keys; single moves are checked on the server and reveal only their own result |
| Large inputs | JSON bodies ≤ 2 MB, uploads ≤ 200 MB / 2,000 files, answer and note sizes validated with zod, linear-time text normalisation |

## 16. Tests

`npm test` (Vitest, ~420 tests: core incl. analytics and goals; CLI; MCP; the server — security headers, path
guards, redaction, study, Today, quick cards, the Python file cache, the knowledge index, Ask with a fake Ollama
(download, indexing, retrieval, citations), cheat sheets, the Anki writer and importer (round trip), every
importer, the editor's save/conflict/history rules, batches with the scripted engine; and the browser-side
helpers: cloze blanks, term planning, map layout, graph data and highlighting, Python error messages, every translation, accent contrast) and
`npm run test:e2e -w @mdlearn/studio` (Playwright against a demo server with a stand-in Ollama, desktop and
phone: reading, search, source view, study sessions, Today and deadlines, quick cards, Python blocks and graded
exercises (including a runaway loop), formulas/glossary/hovers/links/map, Ask, cheat sheet and Anki download,
editor save/conflict/insert/new note, the four importers, a batch course and its undo, notes, AI jobs, visuals,
the four games played to a verdict, safe HTML that must not execute, the `:::html` sandbox, the welcome tour,
Help and the tutorial, the interface in Italian and accent colours in both themes, the graph (search, hover, open, tap on a phone, the 3D chunk only on demand), and a no-sideways-scrolling check of every page in light and dark).
