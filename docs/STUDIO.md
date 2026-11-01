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
inside a document work too. On a real curriculum: 103 documents, 20,164 formulas, 0 lost math blocks, p95
parse 150 ms (`npm run check-corpus -- <folder>`).

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
| Local AI | `GET /api/ai/local` (Ollama, this computer, installed and recommended models, the download) · `POST /api/ai/local/pull` · `…/cancel` · `…/choose` · `…/delete` (`{ model }`) |
| Folders | `GET /api/workspaces` · `POST /api/workspaces/open` · `GET /api/fs/browse` · `POST /api/workspaces/upload` · `POST /api/workspaces/tutorial` (copy the tutorial into the library and open it; `reset` starts over) |
| Help | `GET/POST /api/onboarding` (welcome tour seen) · `GET /api/help` (the Help document) |
| Reading | `GET /api/w/:ws/tree` · `doc?path=` (ETag) · `doc/section` · `raw` · `asset` · `lesson` · `search?q=` · `POST compile` · `POST doc/check` (practice) |
| Today & goals | `GET today` · `GET/POST goals` (daily goal, deadlines, restore suspended cards) · `POST cards/suspend` |
| Quick cards | `GET doc/passage?path&quote` (the passage's source) · `POST cards` (adds a card to the document's my-cards lesson) |
| Related passages | `GET related?path=&section=` |
| Inbox | `GET inbox` · `POST inbox` · `POST inbox/done`, `inbox/card`, `inbox/move` |
| Ask the folder | `GET ask/status` · `POST ask/setup` (download the search model, index) · `POST ask` · `GET ask/history` · `POST ask/delete` · `POST ask/note` · answers stream as `ai.delta` / `ai.done` events (`noteId: "ask"`) |
| Editor | `GET file?path` · `POST files/save` (409 if the file changed) · `files/create` · `preview` · `GET history` · `history/version` |
| LaTeX | `GET /api/latex/status` (engines found, how to install one) · `POST latex/compile` · `GET latex/pdf?path[&download=1]` · `POST latex/save-pdf` |
| Import & export | `POST import/web` · `import/file` (multipart: pdf-fast, pdf-quality, anki, notebook) · `GET export/anki?scope=` · `GET sheet?path` · `POST sheet/ideas` |
| Batch courses | `GET ai/batch/candidates` · `POST ai/batches` · `GET ai/batches[/:id]` · `POST ai/batches/:id/stop` · `resume` |
| Library | `GET formulas?q&doc&limit` · `glossary?q&compact` · `links?path` · `doc/summary?path` · `map` · `knowledge/status` |
| Study | `GET study/queue` (`?widgets=` for chosen questions) · `study/item` · `POST study/check` · `study/hint` · `study/record` · `study/judge` · `GET study/report` (with the confidence check) · `study/map` · `GET exam/plan?count&doc` · `POST exam/grade` · `POST teachback` · `GET study/pack?days=1\|3\|7` · `POST study/sync` |
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

**Settings → Local AI** (`server/ai/models.ts`) manages the models: without Ollama it shows how to install it
for this system (`sudo pacman -S ollama-cuda` on Arch with an NVIDIA card, the official script on other
Linux, `brew install ollama`, the Windows installer); with Ollama it lists the installed models (the cloud
models Ollama only links to are left out), lets you choose the one Studio answers with (saved as
`ollama.model` in the settings), and offers a short list of recommended models — `qwen3:0.6b` to
`gpt-oss:20b`, each with its download size and whether this computer runs it **well** (fits on the NVIDIA
card from `nvidia-smi`, or in Apple Silicon's shared memory), **slowly** (in memory only) or **not at all**.
One download at a time, with progress over every layer and Cancel; Ask's search model uses the same
downloader. The model in use and the search model cannot be removed.

**Claude Code** — through the Agent SDK with an isolated configuration:

| Setting | Value | Why |
|---|---|---|
| executable | settings → SDK-bundled CLI → `mise which claude` | never the mise shim (it writes to stdout) |
| auth | whatever the person's own Claude Code is signed in with; `env` is an allowlist that keeps `ANTHROPIC_API_KEY` | Studio never sees or stores a login, and a key set where Studio starts applies as it does in a terminal |
| `settingSources` | `[]` + a local plugin (`dist/plugin`: the four MDlearn skills) | your user skills, hooks and MCP servers stay out |
| MCP | `mdlearn` server only (`strictMcpConfig`) | outlines, sections, `lint_lesson` |
| tools | Read, Glob, Grep, Write, Edit, MultiEdit, Skill, TodoWrite; no Bash, web or subagents | |
| permissions | `dontAsk` + PreToolUse hooks | every write goes through `beforeWrite` (scope check + undo snapshot); reads limited to the folder |

Recipes: **create a course** (the server scaffolds lesson files from the document's outline, Claude fills
them following the mdlearn-curriculum / mdlearn-course / mdlearn-visuals skills, then lints until clean),
**improve a lesson** (one file), **something else** (free request, `learn/` by default), and **follow-up**
(resumes the job's Claude session). One job runs at a time (they share one Claude Code login; usage
warnings are shown in the log). After a job the server re-lints every lesson it touched. **Undo** restores
every file to its state before the job and deletes the files it created — except files you edited since.
`--fake-ai` swaps Claude for a scripted engine (tests, demos).

## 4. Notes beside the text

Selecting text gives Note · Ask · Explain · Visualise. A note is anchored by the quoted text with 32
characters of context and its section (W3C TextQuoteSelector), found again after edits (exact match with
context, then without, then a unique match; otherwise it is listed as "passage changed"). Highlights use
the CSS Custom Highlight API, so the document's DOM is never modified. On wide screens each card sits next
to its passage and follows the scroll; the card you are working on keeps its place.

Under a video, **Note at 4:15** pins a note to a moment: the anchor quotes the video's title and adds
`t` (seconds), so the card sits beside the player, and its time button plays the video from there (the
note panel sends the player a `mdl-video-seek` event).

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

**Video** (DSL §8.15, `web/visuals/VideoBlock.tsx`). Files play in a native `<video>` with a WebVTT
`<track>`; the segment is a media fragment (`#t=start,end`). The asset route serves mp4/m4v/webm/ogv/mov
and `.vtt` in byte ranges (`Range` → 206 with `Content-Range`, 416 outside the file, `no-transform` so
compression never breaks a range); images keep their 20 MB cap. YouTube (`youtube-nocookie.com`) and Vimeo
(`dnt=1`) start as a plain box with Play: no frame and no thumbnail, so nothing is fetched from them until
the reader asks. The frames are driven with the players' own `postMessage` protocol (`web/visuals/videoPlayers.ts`),
not their script libraries; messages count only from that frame's window and that site's origin. A
checkpoint is reached when two time reports of ordinary playback (≤ 2 s apart) span its time, so seeking
past one does not stop there; the video pauses, leaves fullscreen and the question opens below it with
focus. The checkpoint questions are taken out of the page flow and reached through the chips under the
player. Study cards and the Anki export say which video and time a checkpoint comes from.


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

**Confidence check** (Progress). Before an answer is checked you say whether you were sure; `confidence()` in
`learn/analytics.ts` splits the last 30 days into sure/not sure × right/wrong, gives "right when sure" for each
of the last 8 weeks (weeks start on Monday) and lists the cards you were sure about and got wrong, most often
first; a card leaves the list once you are sure and right about it again. *Review these* starts a session on
exactly those questions (`study/queue?widgets=`, at most 20, early reviews allowed). Typed wrong answers are
shown; a picked option's number is not.

**Mock exam** (`/exam`). `examQueue()` in `learn/exam.ts` samples one question per *studied* card (quiz, cloze,
order, steps: marked on the server in one go, with no feedback move by move), seeded by the exam id, across
the folder or a document's lessons, interleaved by lesson. The paper goes out redacted; each answer is handed
in as Sure / Not sure with nothing marked until the end (optional time limit; when it runs out what is written
counts and the rest is unanswered). `exam/grade` marks it, records attempts and one review per answered card
with the study rating table (unanswered questions are shown with their answer but not recorded) and returns
the score, lessons weakest first, time per question and every answer. Event ids are `exam:<id>:…`, and the first
recording is kept, so a resent paper changes nothing.

**Teach-back** (`/teach`, the Feynman technique). From a lesson, or a section of a document, you explain it for
a beginner; `ai/teachback.ts` sends the explanation with the key ideas (the lesson's goals and `explain` ideas,
or the ideas of the lessons that read the section; the model lists them itself when there are none) and the
text to the local model (JSON schema) or, when chosen on this computer, to Claude as a one-shot call (one turn,
no tools, no MCP, run from the temp directory). Back come each idea covered / partly / missing with the
learner's words, what to correct, and one question a beginner would ask next. Ideas the model skipped count
as missing; nothing is graded or scheduled. The draft is kept in the browser.

**Study offline** (`/offline/:ws`, outside the main layout). For a phone on the LAN, where plain HTTP allows no
service worker: `study/pack` returns the cards due by the end of 1, 3 or 7 days and the new ones for those days
(code exercises left out: no Python offline), their lessons trimmed to those cards *with* the answers, and their
review history. The browser keeps the pack and the unsynced answers in IndexedDB and marks, rates and schedules
with the same core functions (`checkStructured`, `ratingFor`, FSRS replay); UUIDs come from
`crypto.getRandomValues` (`randomUUID` needs a secure context). The server remembers the packs it gave out
(`learn/.mdlearn/offline-packs.json`: the last 30, for 60 days), and `study/sync` accepts only reviews and attempts
about a card of one of them, made after that pack was taken (an hour's slack for the phone's clock) and at most
10 minutes ahead, about a card that still exists. They are stored as `off:<device id>`, and what is recorded first
is kept (`appendProgress(…, { keepExisting: true })`), so resending is harmless and can never change history. A web manifest
(`start_url: /offline`, the latest pack) puts it on the home screen; the page must stay open while offline.

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
It is built in the background on first use (about 4 s for 105 documents; instant afterwards because
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

**Ask** (`/w/:ws/ask`, also "Ask: …" in the search palette) answers a question from your own documents and lessons.

1. **Passages.** The knowledge index splits every document into passages of at most ~400 words that know their
   section (3,273 for a 105-document folder). Each card of a lesson is a passage too, so a course with no notes can
   be asked about as well. *Related* stays with notes, on an index of its own.
2. **Retrieval.** BM25 over the words (lightly stemmed, TeX ignored) and — when the search model is installed —
   cosine similarity over meaning vectors; the rankings are fused with reciprocal-rank fusion (k = 60) and the best
   eight passages go on. Without vectors the search is by words only and says so.
3. **Answer.** The local model (default `qwen3:8b`), or Claude when you choose it or there is no local model, gets
   the passages and the question, must answer *only* from them, and cites each claim as `[1]`, `[2]`; `[n]` becomes
   a link to that passage. If nothing matches, no answer is written. Answers stream like a note's and can be
   stopped; Claude's arrives whole. Claude runs on the computer running MDlearn only, with no tools and no access to
   any folder, and the page says what goes to Anthropic: the passages and titles it reads, and for the companion your
   study record. A lesson that links outside the folder is left out, so a course someone else made can't pull in
   private files, and so is one over 1 MB.
4. **History** in `<folder>/.mdlearn/asks.json` (last 100). *Keep as a note* attaches the question and answer to
   the section a source comes from, so it shows up beside that text.

**Any language.** The answer is written in the language of the question, whatever language the course is in; a
question too short to tell uses the language of the app. Meaning vectors cross languages by themselves. Words don't,
so when under half of a question's words appear anywhere in the folder and there are no vectors, the AI is first asked
for search words in the language of the folder (it sees a spread of the folder's titles), and those replace the
question's own words in the search. The question it answers stays as you wrote it. Search notices are sent as codes,
so the app says them in its own language.

**The search model.** `embeddinggemma` (≈620 MB, 768 numbers per passage) is downloaded once through Ollama's
`/api/pull` from the Ask page (or *Index now*); progress is shown and indexing runs in the background —
you can ask meanwhile. Vectors live in `.mdlearn/index/embeddings.{json,bin}` keyed by a hash of each passage,
so editing a document re-embeds only what changed; a different model invalidates them. Embedding calls take
turns with chat requests on the single-GPU queue. Setup needs the `ai` capability (the computer running
MDlearn); asking works from the phone.

### The capture inbox

An inbox for what comes up while you do something else, sorted later. It is plain Markdown you own: one file a day in `Inbox/`, one task line per item, so it reads well in any editor and tasks typed by hand count too:

```markdown
- [ ] 14:32 Why does coherence fall with the baseline?
  > the passage you selected
  — [Radar § 2.1 Coherence](../radar.md#coherence)
```

**Capturing.** Ctrl+Shift+K from any page; *Capture…* in the palette (or type, then pick *Capture: …*); *Inbox* in the toolbar of a selection, which keeps the passage and where it came from; the box on Today; or `/capture`, a page with nothing else on it, for a phone's home screen. In the desktop app, Ctrl+Alt+Space opens a small window from anywhere, where the desktop allows a global key (on Wayland often not: the File menu still has it). A pasted address is kept as a link.

**Sorting.** Today lists what is open, newest first:

| Action | What happens |
|---|---|
| Card | Makes a card with the usual form, on the document the item came from, or on the inbox file for a plain thought. The line becomes `- [x] … → card` |
| Move | Adds the text at the end of a section you pick, with its link rewritten to work from there. The line becomes `- [x] … → moved to x.md`. Nothing else in MDlearn writes into your documents like this: it happens only here, when you ask |
| Done | Ticks the box |

An item is known by a hash of its text, so one edited since the page loaded is refused rather than guessed at. Inbox files are ordinary documents for search and Related, but *Whole folder* leaves them out of a batch course.

### Related passages

The reader's *Related* tab lists up to five passages from other documents about the section in view, one per document, and follows you as you scroll. It only reads what Ask has already stored, so no model is asked: the answer is immediate, costs nothing and works from a phone.

With vectors, it takes the mean of the section's vectors and looks for the nearest passages. Without them (or for a passage not indexed yet) it searches by the section's words, and the panel says so and links to Ask's setup. Passages that are too far away are dropped, so a section with nothing nearby says that, rather than showing noise. A heading with no text of its own uses the whole document.

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

**LaTeX** (`/w/:ws/latex?path=`). `.tex` files are listed under *LaTeX* in the sidebar (by their `\title`), in the
command palette, and made by *New note → LaTeX document* (a short article template). The page is the same
editor with LaTeX highlighting (CodeMirror's stex mode in the quiet style), completion of the usual commands and
environments (`\begin{…}` writes its `\end`), and the PDF beside it, drawn page by page with pdf.js (loaded only
here, so it looks the same on every device). **Compile** (Ctrl+S) saves, then runs a TeX engine on this computer
(`server/latex.ts`): Tectonic when installed (one program that downloads the packages a document uses), else TeX
Live through latexmk (or pdflatex / xelatex / lualatex directly, with a second pass for references). A
`% !TEX program = xelatex` line picks the TeX Live program; `% !TEX root = main.tex` in a chapter compiles the
main file. Errors and warnings are read from the log (both TeX Live forms and Tectonic's), shown with their file
and line (click to go there; a problem in another file opens it) and, for the common ones, a sentence on the
usual cause; the last good PDF stays on screen. The engine runs on a private copy of the file's folder (so
`\input` and `\includegraphics` work, and nothing it does can reach the notes), and only the PDF and log are kept, in
`~/.cache/mdlearn/latex/`; *Save the PDF next to the file* copies it to `paper.pdf`. With no engine, the page says
how to install one for this system (`sudo pacman -S tectonic`, `brew install tectonic`, …). `.bib`, `.sty` and
`.cls` files open in the editor too.

## 12. Importers

*Import…* in the sidebar (or on the start page, which imports into `<library>/Imports`):

| Source | What happens |
|---|---|
| From a chat | Paste what ChatGPT, Gemini or Claude.ai wrote with the MDlearn prompt ([CHAT_PROMPT.md](CHAT_PROMPT.md)). The answer is split at its `<!-- file: path -->` lines (raw or fenced, chat text around it ignored; paths kept inside the folder and made `.learn.md`), every lesson is compiled where it will live **before anything is written**, and the dialog lists each file with its cards or errors. Import saves the files without errors in one new course folder (the chat's own folder name, made unique); files with errors are not saved, and **Copy the fix request** gives a message naming each flagged line with what it means, to paste back into the chat. `POST /api/w/:ws/import/chat/check` and `/import/chat` (`write`) |
| Web page | The server fetches it (http/https, 5 MB, 15 s), keeps the article (Readability), writes KaTeX/MathJax back as `$…$`, keeps tables and code, saves up to 20 pictures into `assets/`, and writes `imports/<title>.md` with the source address |
| PDF, quick | Read here by pdf.js, which comes with the app: headings by font size, paragraphs by spacing, lists by indentation, running headers/footers and page numbers dropped, hyphenated words joined; formulas come out as plain text and the dialog says so |
| PDF, high quality | The PDF is kept in `imports/source/` and a Claude job reads it in 20-page ranges and writes Markdown with LaTeX into one new file (it may write nothing else) |
| From SciNet | With [SciNet](https://github.com/teo-clerk/SciNet) (your private map of papers) running on this computer: search it by meaning or by title and pick a paper. *As SciNet read it* writes its Markdown to `imports/scinet/` with the paper's details in the front matter (and the abstract, if the text lacks one); pictures are left out, and when SciNet read the text inside the PDF (most papers), formulas are plain text and the result says so. *Read the PDF again* fetches the PDF and starts the high-quality import. The finished import offers *Make a course*. The address is in *Settings → SciNet* (`http://127.0.0.1:8000` by default) |
| PDF, on this computer | Not built. See *Reading PDFs with a local model* below |
| Anki deck | `.apkg` (legacy and newer zstd collections): one lesson per deck (100 cards each), Basic → explain card, Cloze → gap card, pictures copied, each card compiled on its own and skipped (and counted) if invalid; the **review history can be kept** so schedules carry over |
| Notebook | Markdown cells as written, code cells fenced, text output quoted, figures saved; nothing is executed |

Imports never replace a file (a second import gets `-2`). They need `write`; the high-quality PDF also needs `ai`. Everything about SciNet needs `write`, so only this computer can search the library.

### Reading PDFs with a local model

MDlearn does not read PDFs with a local vision model, because no model that runs on an 8 GB GPU is accurate enough for study material yet. Measured on 2026-10-31 on an RTX 4060 (8 GB), with Ollama and 15 pages at 150 dpi: an equation-heavy two-column paper, a scan and a textbook. Formulas were compared by hand with the page images. The bar was 90% of display formulas right at 15 s a page or less.

| Model | Memory | Median s/page (dense paper) | Formulas fully right | |
|---|---|---|---|---|
| `glm-ocr` | 2.1 GiB, all on GPU | 6.7 (14) | 27 of 36 (75%) | fast enough, not accurate enough; needs a newer Ollama than 0.17 |
| `deepseek-ocr:3b` | 10.1 GiB, 68% on GPU | 24 (41) | 10 of 15 (67%) | too slow, and 1 of 6 on the paper |
| `granite3.2-vision:2b` | 2.5 GiB, all on GPU | 5.9 (3) | 0 | writes no LaTeX at all |
| `qwen2.5vl:7b` | 13.6 GiB, 0% on GPU | over 240 | not measured | does not fit |

The trouble is how the errors look. A wrong formula still renders (51 of 52 passed KaTeX with `glm-ocr`), so nothing flags a lost subscript, a moved bracket, `max` read as `0`, or the one equation it invented. Worth measuring again as models improve.

## 13. A course for the whole folder, or on any topic

AI Studio → *Create a course* → **Any topic**: a topic, level, study time, language and optional notes. The job
(`course.topic`) writes a `course.md` overview and the lessons into a new folder named after the topic, with
the same fixed prompt the MCP server's `create_course` uses (`coursePrompt` in core): from the notes when
given (read, never edited), otherwise from well-established knowledge with doubtful claims flagged
`<!-- added: verify … -->` and sources listed. Its write scope is that new folder only.

**From class files.** The first page's *Make a course from my class files* opens `/start`: name the course, drop the files,
choose who writes the lessons. `POST /api/courses?name=` (local only) makes a library folder and `POST /api/w/:ws/sources` adds
to one (100 MB a file, 400 MB at a time, 100 files). Originals go to `sources/`. `server/import/office.ts` turns `.pptx` (slide
order, titles, bullets, tables, speaker notes, pictures; `fflate` + `linkedom`) and `.docx` (mammoth, then Turndown) into
`sources/text/<name>.md` with pictures in `sources/media/<name>/`; a PDF goes through the quick reader.
Each file reports what was read. An equation can't come through as text, so it is counted and the person is told: a PowerPoint
keeps its picture of the equation, a Word file doesn't. Old `.ppt`/`.doc` files are kept, with a note to save them in the new format;
one file that can't be read never stops the others. The `course.class` job writes `course.md` and the lessons at the top of the
folder (`coursePrompt` with `classFiles`), and its `keepOut` stops it changing `sources/`, `AGENTS.md` or `CLAUDE.md`.

**Changing a started course.** Progress belongs to `lessonId/cardId`, and a card's id is its title's slug unless the heading says
`{#id}`, so a renamed card would silently start over. `core/src/revise.ts` guards that: `pinIds` writes ids into a lesson, `courseChanges`
says what an edit did, and `lostCards` finds studied keys with no card and the unstudied cards most likely to be them. A `course.md`
page shows `web/reader/CoursePanel.tsx`: each lesson's standing, move up and down (`server/course.ts` swaps the `NN-` numbers, which
lesson ids ignore, and updates links in `course.md` and the notes file), pause (the cards go to `goals.suspended`), add class files, and
*Change this course*. That `course.change` job pins every studied card in `preWrite`, so undo covers it, tells the AI each lesson's
recall and hardest cards, and ends with `JobSummary.changes`: "28 cards kept their progress · 4 new · 1 removed". Outside AIs get the
same rules in `AGENTS.md`, `lint.mjs --pin` before editing, and a report from `save_lesson` with `overwrite`. *Translate this course* is the
same job (`course.translate`) with every card pinned, studied or not, because a translation renames them all. When a studied card is gone anyway,
the panel offers *Reconnect to…* or *Let go*. Reconnecting appends copies of the card's reviews under the new key (ids `moved:…`, left out
of daily counts by `isOriginalReview`) and pins the new card; both choices add the old key to `goals.settled`. The log keeps every event.

**Colour in the reading column.** `web/styles/app.css` has five hues, one set for each theme, used only in the text: callouts with an
icon each, the first five terms of an explained formula matched with their explanation, `<mark>` on key terms (W610 warns when a card
marks too much, and *Improve a lesson → Mark key terms* adds them to an existing lesson), and three one-click highlights (`Note.color`:
`important`, `confusing`, `exam`). A highlight needs no text. *Confusing* passages are listed on Today with *Explain*; *For the exam* offers
*Make a card*. *Settings → Appearance → Colour in notes* turns every hue grey per device (`data-colour="off"`, set before the first paint by
`public/theme.js`). Icons, underlines and labels carry the same meaning, so nothing depends on seeing colour.

**Companion.** *Settings → Appearance → Companion*: a 12×12 one-colour pixel creature by default (`web/companion/sprites.ts`, plain data), an orb
(`thinking-orbs`, loaded only for someone who picks it), or off, which is remembered. It sits at the foot of the sidebar and shows what is really happening,
from `useActivity.ts`: a job, an answer on its way, a teach-back, the end of a session, or five minutes without input. Clicking it opens a
panel where you can ask anything about your course (`web/companion/AskBox.tsx`), with cards due, the inbox and any running job below. It uses Ask
(§9) with three additions: your study record (`server/ask/record.ts`: lessons, what is due, predicted recall, deadlines, cards you were sure of but
got wrong), so it can say what to review; the page you are on; and the last three questions, so a follow-up can name nothing. When your course does
not cover a question it says so, then answers from general knowledge and says that part is not from your course, where the Ask page declines. The panel
is not modal: Esc closes it, and the conversation stays until you start a new one or reload. It hides on Study and Mock exam until the session ends,
stays off phones, and always says in words what it shows. There is no hunger, currency, sound, or reward for time in the app: the research found agents help a little and virtual pets mixed at best,
and that engagement without a link to study didn't raise learning. Keep one or remove it after a week of use; it's one folder and one commit.

**Coding assistants.** A folder can carry the instructions, so Codex, OpenCode, Pi and Claude Code need no setup:
`mdlearn agents [folder]`, or *Get this folder ready for my AI* in the palette (`POST /api/w/:ws/agents/prepare`), writes
`AGENTS.md`, `CLAUDE.md` (a line that points to it) and `.agents/skills/`, the location those assistants share. It runs only
when asked, never replaces an `AGENTS.md` or `CLAUDE.md` someone wrote, and writes nothing outside the folder.
The MCP tools are optional: `POST /api/integrations/mcp` (local only) or `mdlearn agents --mcp` copies the one-file server
to `~/.mdlearn/mcp`, because an installed app's own path can change, and gives each assistant's command. MDlearn prints
them and never edits another app's settings. Tested with Codex 0.164, Pi 1.4 and OpenCode 2.2.5, whose `opencode.json` takes
`mcp.<name>` (the `mcp.servers` form is for a later version).

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
  `--accent-l` / `--accent-d` … on `<html>`, and `app.css` falls back to graphite without them. Selected rows and
  options, buttons, links, focus rings, the text cursor, text selections, charts and progress bars use it
  (`e2e/accent.spec.ts` reads the painted colours, so a new control can't quietly fall back to ink).
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
| Class files | Word and PowerPoint files are untrusted zip files: the unpacked size is capped at 400 MB from the zip's own directory before anything is read, only named parts are opened, pictures are kept only if their first bytes prove them, and the Markdown is rendered like any document. A file name can't leave `sources/`. Text in slides is data: the job prompt and `AGENTS.md` say to take instructions only from the student. Needs `write`, so a phone can't add files. |
| Pictures | The page policy blocks pictures from outside, which also stops the other ways a document could reach the web (`background` attributes, SVG `<image>` and `feImage`, Mermaid image shapes). A web picture shows its description and a button until you allow its site for that document on this device (Settings → Appearance can forget them). Then the server fetches it: `https` only, public addresses only (checked on every redirect, and a redirect must stay on the same site, so some pictures need their direct address), a real PNG, JPEG, GIF or WebP, 20 MB, 15 s. The route needs a header an `<img>` can't send, so naming it in a document does nothing. That site still sees your address, when you asked, and the picture's whole address, which the document wrote; that is why an allowance covers one document and not every later one. No referrer or cookie goes with it. A name that resolves to a public address and then changes between the check and the fetch isn't covered; the reply must still be a picture and only goes back to you. `:::html` stays offline. A pasted or dropped picture is checked by its first bytes (PNG, JPEG, GIF, WebP; 20 MB) whatever its name says, written under `assets/<document>/` and never replaces a file; it needs `write`, so a phone can't add one. |
| Malicious Markdown / uploads | the compiler keeps only allowlisted HTML tags and attributes (other blocks are sanitised by DOMPurify in the browser, scripts/styles/frames/forms/handlers removed, E107) and drops unsafe URLs; the page CSP forbids inline scripts and handlers; React renders text; KaTeX trust allowlist; Mermaid `strict`; uploads limited to Markdown/text/images, 2 MB each, sanitised relative paths |
| Path traversal | every path goes through `realPath`-based `inRoot` (symlinks and dangling links resolved), hidden folders refused; job ids must be UUIDs; undo only restores files inside the folder |
| Desktop app | the same server in a locked-down Electron window (no Node in the page, sandbox, Studio's pages only, other links in the browser, permissions refused) — see DESKTOP.md |
| Local AI models | downloading, choosing and removing need the `ai` capability (this computer, or LAN devices under `--lan-full`); model names are checked against Ollama's name form before they reach it; the model in use and the search model (`embed` in the name, or a BERT family) are never removed, nor a search model chosen to answer; other devices see the models but not this computer's memory, graphics card, system or where Claude Code is |
| AI jobs | scoped writes (folder or single file, `.md` only, `.git/.claude/.mdlearn` protected), folder-only reads, no shell, no network tools, snapshots + undo |
| SciNet | only `http://` on `127.0.0.1`, `localhost` or `[::1]` is accepted as its address, without credentials; no redirects are followed; answers are limited in time and size (5 MB of JSON, 20 MB of text, 100 MB of PDF, which must start with `%PDF-`) and checked against a schema; paper ids are integers; the routes need `write`, so a phone on the network cannot read the library; imported text is rendered like any other document |
| Inbox | a phone (`notes`) can add to today's file, tick items and make cards, but moving into a document needs `write`; capture only ever appends, with limits (4,000 characters a field, 2 MB a file) and line breaks kept inside the item, so text cannot forge another item or a source line; links out of the folder are not followed, for the inbox or a card; sorting names a file by a strict pattern (`Inbox/YYYY-MM-DD.md`) and an item by a hash of its text, so a stale page is refused; a link is `http(s)` or a path in the folder; items show as text, not HTML |
| Imports | the web importer accepts only http/https without credentials, caps size and time, never follows into other schemes; files are written with `wx` (never replacing) inside `inRoot`; PDFs are parsed by pdf.js for two minutes at most, for their text only: nothing in them is drawn or run; uploads ≤ 100 MB, `write` capability; the editor only saves existing `.md` files inside the folder (hidden folders refused) with a stale-file check |
| Videos | page CSP `media-src 'self'`; `frame-src` only `'self'`, `https://www.youtube-nocookie.com` and `https://player.vimeo.com`; the compiler accepts only relative video files and YouTube/Vimeo ids (validated by pattern) and builds the embed address itself; embeds load on Play, in `sandbox` frames without top navigation, `referrerpolicy="strict-origin-when-cross-origin"` (the page itself sends no referrer); video files go through the same `inRoot` asset route |
| Simulations, Python and `:::html` | opaque-origin sandboxes, own CSP without network; simulations and Python in a Worker + watchdog, `:::html` started on demand + heartbeat watchdog; the server only serves allow-listed Pyodide files and caches them atomically |
| Answer keys | games and questions reach the browser without keys; single moves are checked on the server and reveal only their own result; a mock exam is marked on the server after the whole paper is in; an offline pack does carry the answers (that is the point), so it is served only to clients with the `study` capability, and the page says so |
| Offline sync and exams | ids validated (UUIDs), device events prefixed `off:` and exam events derived from the exam id; both are written first-write-wins, so a resend can never change recorded history; sync accepts only cards of a pack this server issued, timed after that pack, whose widget belongs to the card, ≤ 2,000 events per sync |
| LaTeX | compiling runs a program, so it needs the `write` capability (this computer, or LAN devices under `--lan-full`); shell escape off (`--untrusted` for Tectonic, `-no-shell-escape` and `shell_escape=f` for TeX Live); TeX Live also gets kpathsea's paranoid `openin_any`/`openout_any` (no absolute paths, no `..`, no dot files) with `TEXMFOUTPUT` set to the temp output folder; latexmk runs with `-norc` and only from version 4.77 (a project's `latexmkrc` is Perl and is never read; `LATEXMKRCSYS` is dropped); a `.tex` may come from anywhere, so the engine works on a fresh copy of the document's folder — regular files only, no hidden files, no `latexmkrc`, links followed only to files inside the notes folder, ≤ 3,000 files / 300 MB — and the file is passed as `./name`; nothing it writes can reach the notes, and the copy is removed afterwards (leftovers swept at start-up); two compiles at most at once, one per file, each killed with its process group after 180 s or 500 MB written; long log lines are cut before matching; *Save the PDF next to the file* writes a new file and renames it into place (a `paper.pdf` link is replaced, not followed); a fresh engine check only from this computer; the PDF response carries its own CSP |
| Teach-back load | at most two feedback requests at once (`busy` otherwise); Claude one-shots time out after two minutes |
| Teach-back with Claude | only from this computer (`ai` capability); one turn, no tools, no MCP servers, no setting sources, cwd = the temp directory; the notes and the explanation are marked as data in the prompt; the reply is parsed as JSON and rendered as text |
| Large inputs | JSON bodies ≤ 2 MB, uploads ≤ 200 MB / 2,000 files, answer and note sizes validated with zod, linear-time text normalisation |

## 16. Tests

`npm test` (Vitest, ~540 tests: core incl. analytics and goals; CLI; MCP; the server — security headers, path
guards, redaction, study, Today, quick cards, the Python file cache, the knowledge index, Ask with a fake Ollama
(download, indexing, retrieval, citations), cheat sheets, the Anki writer and importer (round trip), LaTeX (log reading, engine choice, no shell escape, a stand-in
`tectonic` on the PATH, chapters, busy and no-engine cases, and a real compile when Tectonic is installed — skipped otherwise), the confidence check, mock exams (sampling,
marks, idempotent recording), teach-back with a stand-in Ollama and Claude, offline packs and sync, every
importer, the editor's save/conflict/history rules, batches with the scripted engine; and the browser-side
helpers: cloze blanks, term planning, map layout, graph data and highlighting, Python error messages, every translation, accent contrast) and
`npm run test:e2e -w @mdlearn/studio` (Playwright against a demo server with a stand-in Ollama, desktop and
phone: reading, search, source view, study sessions, Today and deadlines, quick cards, Python blocks and graded
exercises (including a runaway loop), formulas/glossary/hovers/links/map, Ask, cheat sheet and Anki download,
editor save/conflict/insert/new note, the four importers, a batch course and its undo, notes, AI jobs, visuals,
the four games played to a verdict, safe HTML that must not execute, the `:::html` sandbox, the welcome tour,
Help and the tutorial, the interface in Italian and accent colours in both themes, the graph (search, hover, open, tap on a phone, the 3D chunk only on demand), a mock exam to its marks and the confidence check after it, a timed exam running out, teach-back on a lesson and a section, an offline pack studied with the network cut and synced when it returns, a LaTeX document written, compiled, fixed from its error line and saved as PDF, and a no-sideways-scrolling check of every page in light and dark).
