# Changelog

## Unreleased

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
