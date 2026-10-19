---
name: mdlearn-curriculum
description: Convert a whole curriculum folder (e.g. ESA-PROJECTS, a project's docs/, or 00_FOUNDATIONS) into MDlearn companion lessons in batch — plan per document, scaffold, fill, lint until clean, track coverage. Use when asked to convert, refresh or audit lessons for many documents or a whole project, not a single note.
---

# MDlearn curriculum conversion

You run a **batch**: many source documents → companion lessons under `learn/`, mirroring the source
tree. Each lesson is written with the `mdlearn-course` skill (read it once; its "Companion lessons"
section governs every card). This skill decides *what* to convert, in which order, and when it is done.

Tools: the `mdlearn` MCP server (`curriculum_status`, `doc_outline`, `plan_lessons`, `get_section`,
`lint_lesson`) or the equivalent CLI (`mdlearn status|outline|plan|new|section|lint`, run from the
curriculum root or with `--root`).

## Steps

1. **Survey.** `curriculum_status` (filter by folder if the user named one). List the documents in
   scope with words and existing/planned lesson counts. Skip `README.md`, `MILESTONES.md`, templates
   and orientation files unless the user asks. Done when the user can see the batch and its size.
2. **Order.** Foundations before projects; inside a project, documents in number order; the
   assessment document (`10_*`) last, because its widgets reuse earlier misconceptions.
3. **Scaffold.** `mdlearn new <doc>` per document writes one file per planned lesson (never
   overwrites). Existing lessons are kept; regenerate one only when the user asks.
4. **Fill, one document at a time.** For each scaffolded lesson: read every referenced section with
   `get_section`; replace each `TODO` with a ≤ 60-word gist and a widget; set `goals`; delete the
   scaffold comments. Where a section's idea is *how a quantity behaves* (a power law, a trade-off) or a
   dense equation, add one visual block (mdlearn-visuals skill) — at most one or two per lesson.
   Several documents can be delegated in parallel to subagents — give each one the document path, the
   lesson files, and this instruction: "Follow the mdlearn-course skill, companion mode. Read sections
   with `get_section` (or `mdlearn section`). Lint with `lint_lesson` (or `mdlearn lint`) until no E/W
   lines remain. Edit only these files."
5. **Lint.** `mdlearn lint learn/<folder>` — every lesson must have no `E` and no `W` lines.
   I-lines are fine. A file that still contains `TODO` is not done.
6. **Audit a sample.** For one lesson per document, re-read two widgets against their sections:
   key correct, distractors plausible, numbers reproducible from the text.
7. **Report.** Final `curriculum_status`: documents converted, lessons, cards, widgets, remaining
   warnings, and anything you flagged with `<!-- fix: -->` or `<!-- added: -->` for the author.

## Rules

- Never edit the source documents. Corrections to the source go in the report.
- Lesson ids and paths come from the plan; keep them stable so learners' progress survives.
- Prefer fewer, sharper widgets: one per card, a recap `explain` per lesson.
- Progress files (`learn/.mdlearn/`) are personal; never commit or edit them.
