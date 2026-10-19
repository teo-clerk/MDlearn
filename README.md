# MDlearn

Turn Markdown notes and curated course documents into interactive, spaced-repetition lessons —
written by an LLM in a token-efficient Markdown dialect, checked by a strict compiler, and studied in
**MDlearn Studio** (a local web app), in Claude Code (MCP tutor), or in the terminal (`mdlearn review`).

## MDlearn Studio

```bash
npm install && npm run build
mdlearn studio ~/CODING/ESA-PROJECTS       # or any folder of .md files; opens your browser
mdlearn studio --lan                       # also on your phone (same Wi-Fi): scan the QR code
```

- **Read any Markdown** — math (KaTeX), tables, Mermaid diagrams, highlighted code, folded `<details>`,
  section numbers, an outline, full-text search (Ctrl+K), the raw source on demand. Edits on disk show up
  live. Open a folder in place, or drop files/folders to copy them into your library.
- **Study** — the same coach flow as the terminal: one card at a time, "were you sure?" before any
  feedback, verdicts in words, missed cards revisited, a summary with links to the sections to reread.
  Progress is shared with the CLI and the Claude tutor (`learn/.mdlearn/progress.json`).
- **Notes and AI beside the text** — select a passage: leave a note, ask the local model (Ollama) about
  it, have it explained, or **visualise** it (a plot, explained formula or animation drafted by the local
  model and checked by the compiler). Notes live in `.mdlearn/notes/`, never inside your files.
- **Interactive visuals** — `:::plot` (sliders over a formula), `:::formula` (terms explained on hover),
  `:::animate` (a derivation step by step), `:::sim` (a sandboxed canvas simulation): see DSL §8.11.
- **AI Studio** — Claude Code (your own login, no API key) creates a course from a document — or for every
  document of a folder, one after another — improves a lesson, or does what you ask, using the MDlearn
  skills. Every job is streamed live, limited to the lesson folder, checked by the compiler, and can be undone.
- **Today** — what to study now, a 7-day forecast, a heatmap, calibration, **deadlines** that turn into new
  cards a day, and the cards you keep failing (**leeches**) with a one-click AI fix. **Quick cards**: select
  a passage, blank some words, and it becomes a card.
- **Run Python** in any Python block (Pyodide in a sandbox: numpy, scipy, pandas, matplotlib …); exercises with
  `assert` checks are graded in the browser.
- **Your whole folder as a knowledge base** — formulas, glossary (defined terms underline in the text), links
  and backlinks, a map of prerequisites, **Ask** (local model answers from all your documents, with sources),
  cheat sheets you can print, and **Anki export**.
- **Edit and import** — a built-in editor with live preview, compiler checks and history; import PDFs (quick
  or Claude-quality with LaTeX), web pages, Anki decks (with review history) and Jupyter notebooks.

See [docs/STUDIO.md](docs/STUDIO.md) for how it works, its security model, and its tests.

## Study in five minutes

```bash
cd ~/CODING/ESA-PROJECTS          # any curriculum with a learn/ folder
mdlearn review                    # a session: due cards first, then new ones (~10 cards)
mdlearn review --scope f04        # only SAR physics (lesson ids start with f04-…)
mdlearn report                    # what you have seen, your accuracy, what is due, your streak
```

During a session type your answer and press Enter; `?` gives a hint, `s` shows the answer, `q` stops
(progress is saved after every card). Missed cards come back before the session ends, and the
closing summary tells you which section to reread (`mdlearn section 04_sar 12.6`).

In Claude Code, open the curriculum and ask "quiz me on SAR physics" — the `mdlearn-tutor` skill runs
the same session conversationally, with follow-up questions grounded in the source text.

## Documentation

| Document | What it is |
|---|---|
| [docs/PEDAGOGICAL_SPEC.md](docs/PEDAGOGICAL_SPEC.md) | The learning science behind every construct, with verified citations |
| [docs/DSL_SPECIFICATION.md](docs/DSL_SPECIFICATION.md) | The `.learn.md` format: syntax, formal grammar, diagnostics, companion lessons |
| [docs/ENGINE_ARCHITECTURE.md](docs/ENGINE_ARCHITECTURE.md) | Compiler, rendering, state machine, persistence, security, roadmap |
| [docs/TOOLING.md](docs/TOOLING.md) | Importer, `mdlearn` CLI, `mdlearn-mcp` server, skills, ESA-PROJECTS workflow |
| [docs/STUDIO.md](docs/STUDIO.md) | MDlearn Studio: architecture, AI engines and jobs, notes, visuals runtime, security, tests |
| [docs/AGENT_SKILL.md](docs/AGENT_SKILL.md) | The authoring skill (installed as `/mdlearn-course`) |

## Packages

| Package | |
|---|---|
| `packages/core` | `@mdlearn/core` — Stage-0 scanner, compiler, CourseAST (Zod), checkers, importer, tutor, FSRS; `@mdlearn/core/node` for file-system helpers |
| `packages/cli` | `mdlearn` — lint, build, status, outline, section, plan, new, queue, review, report |
| `packages/mcp` | `mdlearn-mcp` — 13 MCP tools for curriculum access, authoring and tutoring |
| `packages/studio` | MDlearn Studio — local server (Hono) and web app (React 19, Vite 8, Tailwind 4) |
| `skills/` | `mdlearn-curriculum`, `mdlearn-tutor` and `mdlearn-visuals` skills (plus `docs/AGENT_SKILL.md`) |

## Develop

```bash
npm install
npm run build        # core → cli → mcp (TypeScript 7)
npm test             # Vitest: compiler, checkers, importer, tutor, MCP end-to-end
npm run check-docs   # every example in docs/ compiles as documented
```

`mdlearn` and `mdlearn-mcp` are symlinked into `~/.local/bin`. ESA-PROJECTS registers the MCP
server in its `.mcp.json` and links the three skills in `.claude/skills/`.
