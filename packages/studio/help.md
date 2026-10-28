---
title: Help
---

# Help

## How MDlearn works

Your notes stay plain Markdown files. **Lessons** (`learn/*.learn.md`) hold short cards with questions;
**Study** brings each card back just before you would forget it. Five to ten minutes a day on
**Today** is the habit that pays off.

## The pages

| Page | What it is for |
|---|---|
| **Today** | Your daily session: cards due first, then a few new ones. Goals and deadlines live here too. |
| **Study** | One card at a time: answer, say whether you were sure, read the feedback. |
| **Ask** | A question about the whole folder, answered by the local model from your own passages. |
| **Progress** | What you have seen, how well you remember each lesson, your accuracy and streak. |
| **AI Studio** | Claude Code writes or improves lessons from a note (uses your Claude subscription). |
| **Formulas** · **Glossary** · **Map** | Every formula, every defined term, and which notes build on which. |

## While reading

- **Select text** for the toolbar: **Note** (beside the passage), **Card** (a quick question),
  **Ask**, **Explain** and **Visualise** (local model).
- Underlined words are terms your notes define: hover them. Links to other notes preview on hover.
- The **outline** in the right panel follows the section you are reading; the `…` menu has the
  cheat sheet and the raw source.

## Writing interactive notes

Everything below works in any `.md` and in lessons. In a lesson, questions and games also become
review cards. The tutorial shows each one live with its source.

| You write | You get |
|---|---|
| `:::quiz` with `- [x]` / `- [ ]` options | multiple choice, feedback under each option |
| `:::cloze` with `{{answer}}` | fill in the gaps (text, numbers, formulas) |
| `:::order` with a numbered list | put steps in order |
| `:::explain` with a `> - idea` list | explain in your own words, then compare |
| `:::steps` with a numbered list | a worked example, step by step |
| `:::code` with `python` / `python test` fences | a coding exercise checked in the browser |
| `:::match` with `- left :: right` | match the pairs (`{memory}`: a memory game) |
| `:::sort` with a nested list | sort items into groups |
| `:::speed` with `- [x]` / `- [ ]` statements | a true/false round (`{time=60}` for a countdown) |
| `:::plot`, `:::formula`, `:::animate`, `:::sim` | interactive plots, explained formulas, animations, simulations |
| `:::html` with an `html` fence | your own HTML, CSS and JavaScript, in a sandbox |
| `<mark>`, `<kbd>`, `<sub>`, `<details>`, `<figure>`, `<svg>`… | HTML in place (scripts are always removed) |
| `:::note`, `:::tip`, `:::important`, `:::warning` | callouts (`{fold}` to fold them) |

## Keyboard

| Keys | Does |
|---|---|
| <kbd>Ctrl</kbd>+<kbd>K</kbd> | search notes, lessons and commands |
| <kbd>Ctrl</kbd>+<kbd>\</kbd> | show or hide the sidebar |
| <kbd>?</kbd> | this page |
| <kbd>A</kbd>–<kbd>E</kbd> · <kbd>Enter</kbd> | pick an option · check, then next card |
| <kbd>Y</kbd> / <kbd>N</kbd> | sure / not sure |
| <kbd>T</kbd> / <kbd>F</kbd> | true / false in a speed round |
| <kbd>←</kbd> / <kbd>→</kbd> | previous / next step of an animation |

## Your data

Everything stays in your folder: lessons in `learn/`, your answers in `learn/.mdlearn/progress.json`,
notes and AI history in `.mdlearn/`. Nothing leaves your computer unless you start an AI Studio job
(Claude) — Ask, Explain and Visualise run on the local model.
