# MDlearn — Tooling: importer, CLI, MCP server, skills

> How the specification becomes a working study system for a real curriculum:
> a deterministic importer, the `mdlearn` CLI, the `mdlearn` MCP server for Claude Code, and three
> skills. Syntax: [DSL_SPECIFICATION.md](DSL_SPECIFICATION.md) · design: [ENGINE_ARCHITECTURE.md](ENGINE_ARCHITECTURE.md).

## 1. Why companion lessons

The curriculum this was built for is ~95 house-styled documents (~800k words), each with numbered
sections, a front-matter block (track, time, difficulty, objectives, prerequisites, deliverable),
LaTeX, Python exercises and a per-project assessment document. Rewriting that prose into cards would
cost millions of generation tokens and fork the source of truth. A **companion lesson** instead links
each card to its section (`::read[§12.1]`) and adds only what the documents lack: retrieval,
faded worked examples, misconception checks and spaced review.

| Concern | Rewritten lessons | Companion lessons |
|---|---|---|
| Tokens to generate one 10k-word document (estimate) | ~25–40k (prose + widgets) | ~6–10k (gists + widgets) |
| Source of truth | duplicated | the curriculum stays canonical |
| Edits to the curriculum | lessons drift silently | `mdlearn lint` flags any `::read` that no longer resolves (E111) |

## 2. Importer (`@mdlearn/core`)

Deterministic, no LLM:

- `outlineDoc(md, path)` — title and number (`04`, `01.03`), document kind (concept, assessment,
  milestones, readme, brief, reference), house-style metadata (time → minutes, difficulty → `level`,
  milestone, prerequisites, objectives, deliverable) and the section tree (number, title, anchor,
  role: content / bridge / worked / exercises / lookup / howto, line range, words, display formulas,
  code blocks).
- Headings are found by a **fence-aware line scan**, not by a Markdown parser: such documents put
  `$$ … $$` on content lines, which makes remark-math swallow the rest of the file (DSL §6).
- `sectionText(md, outline, ref, maxWords?)` — exact Markdown of a section (`5.1`, `§5.1`, `A2`,
  anchor or title fragment), truncated only at paragraph boundaries.
- `planLessons(outline)` — groups top-level sections into lessons of ~2,500 source words, skips
  "How to use" and "Where to look things up", makes assessment documents one lesson per part, and
  derives stable ids: `f04-03-…` (foundations doc 04), `p1-10-…` (project 1, doc 10).

## 3. CLI (`mdlearn`)

Run from the curriculum root (or anywhere below a folder containing `learn/`, or pass `--root`).

| Command | Purpose |
|---|---|
| `mdlearn studio [folder] [--port 4747] [--lan] [--lan-full] [--no-open] [--fake-ai]` | Start MDlearn Studio (local web app) on the folder; `--lan` adds a private link + QR code for other devices (read, study, notes, local AI only unless `--lan-full`); `--fake-ai` runs AI jobs with a scripted demo engine. Optional helpers: Ollama (local answers; `embeddinggemma` is downloaded on demand for meaning search). See STUDIO.md |
| `mdlearn review [--scope f04] [--limit 10] [--new-cards 5] [--due]` | Study session: opening plan, one card at a time, confidence before feedback, verdicts in words, the answer always shown, missed cards revisited, closing summary with sections to reread. `?` hint · `s` show answer · `q` finish |
| `mdlearn queue` / `mdlearn report` | What a session would contain; cards seen, **your** first-try accuracy (today, 7 days), what is due, next review, study streak, and per-lesson "memory" (the model's predicted recall, labelled as such) |
| `mdlearn status [filter] [--all]` | Every source document: done / in progress / to do / has errors, lessons, cards (`--all` adds READMEs and reference files) |
| `mdlearn outline <doc>` | Metadata + section tree with word counts and line ranges |
| `mdlearn section <doc> <§> [--max-words N]` | Exact section text |
| `mdlearn plan <doc>` / `mdlearn new <doc>` | Lesson plan / scaffold the planned files (never overwrites): frontmatter with `id`, `level`, `source`, one card per subsection with its `::read`, the document objectives as a goal menu |
| `mdlearn lint [file\|dir] [--verbose]` | `path:line:col CODE rule: message` for errors and warnings (notes with `--verbose`), a summary line, exit 1 on errors; a missing source document is one E111, not one per card |
| `mdlearn build <file>` | Validated CourseAST JSON |
| `mdlearn errata [--kind fix\|added]` | Corrections to the source collected from `<!-- fix: -->` notes, grouped by document and section |

Terminal output never relies on colour (bold only on a TTY, `NO_COLOR` respected), wraps to the
window, renders math as Unicode (`σ⁰ ∝ λ⁻⁴`, gaps as `[1]____`), uses locale dates and relative
times ("tomorrow", "in 3 days (Fri 4 Oct)"), and ends quietly when piped into `head`.

`<doc>` is a path relative to the root or any unique file-name fragment (`04_sar`).

## 4. MCP server (`mdlearn-mcp`)

Stdio server built on `@modelcontextprotocol/sdk` 1.31. Configuration: `MDLEARN_ROOT` (the folder; else
`CLAUDE_PROJECT_DIR`, else the working directory — an unexpanded `${…}` is ignored), `MDLEARN_LEARN_DIR`
(default `learn`) and `MDLEARN_READONLY=1` (no `save_lesson`; MDlearn Studio sets it because its jobs guard
writes themselves). It works in any folder, including one with no curriculum. Registered project-scoped in
the curriculum's own `.mcp.json`, or everywhere through the Claude Code plugin (§5).

| Tool | Kind | What it returns |
|---|---|---|
| `curriculum_status` | read | documents → lesson coverage and lint state |
| `doc_outline` | read | metadata + section tree of one document |
| `get_section` | read | exact Markdown of one section (grounding) |
| `search_curriculum` | read | sections containing all query terms, ranked, with snippets |
| `plan_lessons` | read | lesson ids, paths, `source:` values, sections |
| `lint_lesson` | read | diagnostics for a saved file or unsaved content |
| `read_lesson` | read | raw lesson source |
| `study_queue` | read | due cards (lowest recall first, interleaved across lessons), then new cards |
| `present_item` | read | the question for a widget — **no keys, feedback or solutions** — plus answer format, hint count and source sections |
| `get_hint` | read | the n-th author hint |
| `check_answer` | write (attempt log) | correct / partial / null (tutor judges with the returned rubric), feedback in words, `answer` (always present), what to reveal |
| `record_review` | write (FSRS log) | the rating in plain words (`say`: "solid: … next review in 3 days") plus the FSRS label and due date for bookkeeping |
| `progress_report` | read | per-lesson seen/due/predicted recall, your accuracy today and over 7 days, next due, study streak |
| `authoring_guide` | read | how to write lessons: part `method` (AGENT_SKILL.md, default), `spec` (the section list, or one section with `section: "8.3"`), `visuals`, `tutor`, `curriculum` |
| `save_lesson` | write (a lesson file) | lints, then saves a `.learn.md` (or a `course.md` overview) inside the folder; refuses errors (returns the lint lines), existing files without `overwrite`, and anything else |

**Prompts** (slash commands in most clients; `/mcp__mdlearn__create_course` in Claude Code):
`create_course(topic, level?, language?, minutes?, notes?)` — a course on any topic, from notes or from
general knowledge (doubtful claims flagged `<!-- added: verify … -->`, sources listed), the same text
Studio's *Any topic* job uses (`coursePrompt` in core); `companion_lessons(doc)`; `study(scope?)` (the tutor
protocol). **Resources**: `mdlearn://guide/method`, `mdlearn://guide/spec`, `mdlearn://guide/chat`.

Safety: every path is confined to the root; questions are generated from the CourseAST with answers
stripped, so the model cannot leak a key by quoting the question; the progress file is validated
(Zod) on every read and written atomically.

Progress lives in `learn/.mdlearn/progress.json` (git-ignored): an append-only log of review events
(FSRS state is replayed from it) and attempt events (answers, sure/not sure) for item statistics.

## 5. Skills

| Skill | Use |
|---|---|
| `mdlearn-course` | Write or fix one lesson — notes mode or companion mode ([AGENT_SKILL.md](AGENT_SKILL.md)) |
| `mdlearn-curriculum` | Batch: survey → order → scaffold → fill (parallel subagents) → lint → audit → report |
| `mdlearn-tutor` | Study session: queue → present → answer → check → feedback → record; Socratic follow-ups grounded in `get_section`; interview drills from each project's assessment document |

Installed as symlinks in `MDlearn/.claude/skills/` and the curriculum's `.claude/skills/`; the sources
live in `MDlearn/skills/` and `MDlearn/docs/AGENT_SKILL.md`.

`scripts/build-integrations.ts` (run by every Studio build) packages them for other assistants into
`packages/studio/dist/integrations/`:

| Output | For |
|---|---|
| `agent-folder/` | `AGENTS.md` and the four skills with a one-file linter: `mdlearn agents` copies them into a folder (`skills/` becomes `.agents/skills/`), so Codex, OpenCode, Pi and Claude Code can write lessons there with nothing installed. |
| `claude-plugin/` | A Claude Code marketplace with the `mdlearn` plugin: the four skills, `/mdlearn:course` and `/mdlearn:study`, and the MCP server bundled into one file (`mcp/server.mjs`, with its guide in `mcp/guide/`). `claude plugin marketplace add <dir>` then `claude plugin install mdlearn@mdlearn`; `claude --plugin-dir <dir>/mdlearn` tries it for one session |
| `mdlearn-skill.zip` | Claude.ai (Settings → Capabilities → Skills): the course skill, the DSL spec and `scripts/lint.mjs`, the checker as one file |
| `MDLEARN_PROMPT.md` | Chats without tools: [CHAT_PROMPT.md](CHAT_PROMPT.md) below its marker line (under 8,000 characters, so it fits a Custom GPT's instructions); its example is compiled by `check-docs` |
| `MDLEARN_GUIDE.md` | The method and the full DSL specification in one file, to attach to a chat |

A chat's answer comes back through Studio's *Import → From a chat* or `mdlearn import-chat`
(`splitBundle`, `planBundle` and `fixMessage` in core).

## 6. Workflow for a large curriculum

```bash
cd ~/my-course
mdlearn status 01_RADAR          # what exists for unit 1
mdlearn new 01_RADAR/01_basics   # scaffold
# in Claude Code: "convert unit 01 with mdlearn-curriculum"   → fills, lints, reports
mdlearn lint learn/01_RADAR
# studying, in Claude Code: "quiz me on radar" (mdlearn-tutor) — or offline:
mdlearn review --scope f04
mdlearn report
```

Converting a unit: one `mdlearn new` per document, then the curriculum skill fills the lessons
(one subagent per document), lints them clean and reports factual issues it found in the source.

## 7. Verification

- `npm test` in `MDlearn/`: compiler hazards, checkers, reducer and FSRS, importer on a house-style
  fixture (including `$$` on content lines and `#` inside code), companion resolution (E111), the
  workspace (status, plans, atomic progress), the tutor (no answer leak, quiz/cloze/order grading,
  ratings, streak), and an end-to-end MCP test that spawns the server over stdio and drives every
  tool with a real MCP client.
- `npm run check-docs`: every Markdown example in the docs compiles as documented.
