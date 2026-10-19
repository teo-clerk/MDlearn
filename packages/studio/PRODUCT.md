# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack
React 19 + Vite 8 + Tailwind 4 single-page app, served by a local Node server (Hono) started with
`mdlearn studio [folder]`. Part of the MDlearn npm workspace (`@mdlearn/core` compiler, tutor and FSRS
scheduler; `mdlearn` CLI; `mdlearn` MCP server). Runs offline on the learner's own machine; fonts and
libraries are self-hosted.

## Users
Primary: the author of the project, a student preparing for ESA-style Earth-observation and ML work, who
keeps long, math-heavy Markdown study notes (SAR radar physics, optics, statistics, ML) in folders such as
`~/CODING/ESA-PROJECTS`. Jobs: read those notes comfortably, turn them into interactive lessons with AI
help, and review them daily with spaced repetition, at the desk (laptop) and occasionally on a phone on the
home network.
Later: other self-learners running it on their own folders (the project is meant to be open-sourced), so the
app must not assume the author's folders, accounts or habits.

## Product Purpose
Make a folder of Markdown notes into a place to read, study and build courses:
- open any folder (in place) or drop/upload a bunch of `.md` files, and read them well: math, tables,
  diagrams, code, collapsible details, section numbers;
- files written in the MDlearn format (`.learn.md` and directives such as quiz, cloze, plot, formula,
  animate, sim) become interactive;
- study with spaced repetition (FSRS) using the same coach flow as the CLI: one card at a time, confidence
  before feedback, verdicts in words, missed cards revisited, a summary of what to reread;
- ask AI to create and improve courses, add visualisations (plots, explained formulas, animated
  derivations, simulations, diagrams) and quizzes, and answer questions about a selected passage; answers
  and notes live beside the text.
Success: the learner opens their folder, reads, studies today's cards and grows the course with AI in one
calm place, and every AI change is visible, checked by the compiler, and undoable.

## Positioning
Plain Markdown files stay the source of truth on the learner's disk; the app adds a compiler-checked
interactive layer (fail-closed widgets, answer checkers, FSRS) on top. AI runs through tools the learner
already has (their own Claude Code login, a local Ollama model) and is held to the same compiler and lint
rules as a human author. Progress is shared with the terminal and the Claude tutor through one local file.

## Operating Context
- Long reading sessions in documents of 5k–20k words with hundreds of formulas (one ESA document has 841),
  wide tables, Mermaid diagrams, Python code and `<details>` blocks.
- Short daily review sessions (5–15 minutes); the terminal `mdlearn review` and the Claude Code tutor are
  alternative ways in to the same progress.
- AI jobs take from seconds (local model) to a few minutes (Claude course creation) and must stream
  progress, be cancellable and undoable; Claude usage counts against the learner's subscription limits.
- Phone access over the LAN is for studying and reading; authoring and AI file changes stay on the
  laptop.

## Capabilities and Constraints
- Local-only by default (127.0.0.1); LAN mode is opt-in with a token and restricted capabilities.
- Never edits the learner's source documents except through an explicit "insert" action; AI writes only
  inside the job's allowed folder and only `.md` files; every job's changes can be undone.
- Notes are stored beside the files (`.mdlearn/notes/`), never inside the learner's Markdown.
- Progress file `learn/.mdlearn/progress.json` is personal and shared by CLI, MCP tutor and the app.
- Terminology already used by the toolchain and the learner: lesson, card, widget (quiz, cloze, order,
  explain, steps, code), visual (plot, formula, animate, sim), companion lesson, source document,
  section (§3.1), review, due, new, solid / shaky / again, memory (the model's predicted recall), study
  streak, lint, diagnostics (errors, warnings, notes).
- Undecided: desktop packaging (Electron) and hosted use are out of scope for v1.

## Brand Commitments
- Name in the interface: **MDlearn Studio**.
- Interface language: English (lesson content may be in any language; `lang:` in frontmatter).
- Voice: a warm study coach in study flows (plain words, never FSRS jargon, "solid / shaky / again"),
  precise and quiet elsewhere.
- Visual world (chosen 2026-10-02, standing preference): the **notes-app standard**, executed at full craft,
  sitting alongside **Obsidian** and **Notion**, a bit minimalistic: file tree on the left, centred page,
  side panel on the right, sans-serif app chrome, one app accent, light and dark.
- Kept from the earlier "Scientific notebook" brief: **notes and AI answers beside the text** (aligned to the
  passage they belong to, not a generic chat sidebar) and a **serif for long reading** (documents and lessons;
  app chrome stays sans-serif). No per-folder accent colours.

## Evidence on Hand
- Real corpus for every design and test decision: `~/CODING/ESA-PROJECTS` (103 Markdown documents, 3,083
  display-math lines, 6,065 table rows, 21 Mermaid diagrams, 84 Python blocks, 69 `<details>`) with 39
  companion lessons (459 cards) in `learn/`.
- Toolchain docs: `docs/PEDAGOGICAL_SPEC.md` (research basis, rating table, streak definition),
  `docs/DSL_SPECIFICATION.md`, `docs/ENGINE_ARCHITECTURE.md`, `docs/TOOLING.md`.
- No users, testimonials, metrics or logos exist; none may be invented.

## Product Principles
1. The learner's files are the source of truth; the app never hides, rewrites or locks them in.
2. Retrieval first, honestly measured: show the learner's own accuracy next to the model's prediction, and
   never leak an answer before an attempt.
3. AI is a visible, checked, reversible collaborator: every change is streamed, linted and undoable.
4. Reading comes first: long technical text must be comfortable before anything is interactive.
5. Local and private by default; sharing and network access are explicit choices.

## Accessibility & Inclusion
WCAG 2.2 AA: keyboard operation for every study and reading action, visible focus, meaning never by colour
alone (verdicts in words), reduced-motion alternatives for animations, math readable by screen readers
(KaTeX MathML), touch targets ≥ 44 px on the phone.
