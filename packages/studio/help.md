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
| **Mock exam** | Questions on what you have studied, mixed across lessons, timed if you like, marked only at the end. |
| **Ask** | A question about the whole folder, answered by the local model from your own passages. |
| **Progress** | What you have seen, how well you remember each lesson, your accuracy and streak, and the **confidence check**: the cards you were sure about and got wrong, ready to review. |
| **Study offline** | On a phone: take the next days' cards (Today → *Take the next days' cards offline*), study with no connection, and the answers sync when the computer is reachable. Keep the page open while offline. |
| **LaTeX** | *New note → LaTeX document*, or any `.tex` file under *LaTeX* in the sidebar: write on the left, **Compile** (Ctrl+S) to see the PDF on the right; errors link to their line. Needs Tectonic or TeX Live on the computer. |
| **Local AI** | *Settings → Local AI*: install Ollama if it is missing, download a recommended model (each says whether this computer runs it well), and choose the one Studio answers with. |
| **Import** | *Import…* in the sidebar: a web page, a PDF, an Anki deck, a notebook, lessons from a chat, or a paper from **SciNet** if it is running on this computer. |
| **Inbox** | Ctrl+Shift+K saves a thought from anywhere, and *Inbox* in a selection's toolbar saves a passage. Sort them on Today: **Card**, **Move** into a document, or **Done**. They are plain Markdown in `Inbox/`. |
| **AI Studio** | Claude Code writes or improves lessons from a note (uses your Claude subscription). |
| **Formulas** · **Glossary** · **Map** | Every formula, every defined term, and which notes build on which: a graph in 2D or 3D, coloured by how well you remember each note. |

## While reading

- **Select text** for the toolbar: **Note** (beside the passage), **Card** (a quick question),
  **Ask**, **Explain** and **Visualise** (local model).
- Underlined words are terms your notes define: hover them. Links to other notes preview on hover.
- **Teach it back** (on a lesson, or in the `…` menu for a section): explain it in your own words; the
  local model (or Claude) says which key ideas you covered, what to correct, and asks one question back.
- The **Related** tab in the right panel lists passages from other documents about the section you are
  reading, and follows you as you scroll.
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
| `::video[clip.mp4]` or a YouTube/Vimeo link | a video; questions after it with `{at=4:15}` pause it there |
| `<mark>`, `<kbd>`, `<sub>`, `<details>`, `<figure>`, `<svg>`… | HTML in place (scripts are always removed) |
| `:::note`, `:::tip`, `:::important`, `:::warning` | callouts (`{fold}` to fold them) |

## Keyboard

| Keys | Does |
|---|---|
| <kbd>Ctrl</kbd>+<kbd>K</kbd> | search notes, lessons and commands |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>K</kbd> | capture a thought to your inbox |
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
