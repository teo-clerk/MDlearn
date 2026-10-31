# Changelog

## Unreleased

**A course from your class files.** The first page now starts where most people do: *Make a course from my class
files* takes PDFs, PowerPoint, Word files and pictures, keeps the originals, reads what it can, and says what it couldn't.
Then Claude, your coding assistant or a chat writes the lessons, and they appear as they are written.

**Change a course after you've started.** A course's page now shows where you stand in each lesson. Move lessons, pause one, add
class files, or tell Claude what should change: cards keep their schedule even with new titles, and the job ends by saying how many kept
their progress. If an edit elsewhere loses a studied card, MDlearn offers to reconnect it. Coding assistants get the same rules.

**Courses appear wherever they are written.** A course from a topic, from a chat or from an assistant sits in its
own folder, and until now its lessons opened from a link but never reached the library, Today or Study. They now
do, in Studio, the CLI and the MCP tools. Lessons sit under their `course.md`.

**Pictures.** A document or lesson can show a picture from the web by its `https` address, in Markdown or in
`<img>`; one that can't be loaded leaves its description and a link. Paste or drop a screenshot into the editor and
it's saved under `assets/`. Click any picture, or press Enter on it, to see it larger.

**Any coding assistant.** Codex, OpenCode, Pi and Claude Code can write lessons in a folder with nothing to install:
`mdlearn agents`, or *Get this folder ready for my AI* in Ctrl+K, puts the instructions in the folder. Your own
`AGENTS.md` or `CLAUDE.md` is never replaced. Optional MCP tools let them quiz you too (Settings → Use MDlearn in other apps).

## 1.3.0 — 2026-10-31

**Study papers from SciNet.** *Import → From SciNet* finds a paper in your SciNet library, by meaning or by title, and
brings it into the folder with its details, ready for *Make a course*. Most papers arrive with formulas as plain
text, and the import says so; *Read the PDF again* gets them as LaTeX. *Make a course* now follows every import
that gives one document.

**A capture inbox.** Save a thought, a link or a passage in a moment (Ctrl+Shift+K, the palette, the selection toolbar,
Today, a `/capture` page for your phone, or Ctrl+Alt+Space in the desktop app) and sort it later on Today: make a
card, move it into a document, or tick it off. It is plain Markdown in `Inbox/`, one file a day.

**Related passages.** A new *Related* tab in the reader shows what else in the folder is about the section you are
reading, and follows you as you scroll. It uses what Ask has already stored, so it needs no model and works on a
phone.

## 1.2.0 — 2026-10-29

**Desktop app.** MDlearn Studio in its own window for Windows (installer or `.zip`), macOS (`.dmg` or `.zip`, Apple
Silicon and Intel) and Linux (AppImage, `.deb` or `.zip`), with nothing else to install. Same features and
settings as the web app, which stays (`mdlearn studio`); *File → Open in your browser* switches at any time. Built
and attached to each release by GitHub Actions; not signed yet (docs/DESKTOP.md says how to open it the first
time).

**Local AI models.** *Settings → Local AI* says how to install Ollama on your system, then lets you download a recommended model (from tiny to large, each with its size and whether your computer
runs it well), see the download's progress, choose the model Studio answers with, and remove models.

## 1.1.0 — 2026-10-29

**LaTeX.** Write `.tex` documents in Studio (*New note → LaTeX document*, or any `.tex` in the folder, listed
under *LaTeX*) with highlighting and completion, and compile them to PDF with Tectonic or TeX Live on your
computer: the PDF shows beside the source, errors come back with their line and a sentence on the usual cause,
and the PDF can be downloaded or saved next to the file.

## 1.0.0 — 2026-10-28

The first official version. Every package (`@mdlearn/core`, `cli`, `mcp`, `studio`) is now 1.0.0.

**Lessons.** Plain Markdown `.learn.md` files compiled and checked by `@mdlearn/core` (the lesson language, DSL
v1.4): questions, gaps to fill, steps, ordering, explanations with key ideas, graded Python exercises, games
(match, memory, sort, speed), simulations, animations, safe HTML and videos with questions at a moment. Every
card is scheduled with FSRS from an append-only progress log.

**Study.** `mdlearn review` in the terminal, or Studio's Today (the daily session, goals and deadlines, the
cards you keep failing), Study, a **mock exam**, the **confidence check**, **teach-back** and **study offline**
on a phone on your network.

**Studio** (`mdlearn studio`). A reader for any Markdown folder (math, diagrams, code, search, outline, notes
beside the text), quick cards from a selection, the local model to ask, explain and visualise, Python in the
browser, formulas, glossary, links and a graph of your notes in 2D or 3D, Ask your whole folder, cheat sheets,
an editor with history, importers (web pages, PDFs, Anki decks, notebooks), Anki export, AI Studio and batch
courses with Claude Code, and the interface in English, Italiano, Español, Français and Català with your own
accent colour.

**Any AI.** The MCP server (study tools, lesson writing that is checked before saving, a course on any topic
with or without notes), a Claude Code plugin, a Claude.ai skill, and a prompt for ChatGPT and other chats,
with `mdlearn import-chat` to save what they write.
