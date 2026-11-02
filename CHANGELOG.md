# Changelog

## 1.6.1 — 2026-11-02

**Courses from the app work in an installed copy.** The desktop app and the npm packages looked for the MDlearn skills
in the wrong folder, so every AI job failed as soon as it started. It only ever worked from a copy of the source code.
The desktop tests now check for them on all three systems.

**Claude Code on Windows.** Claude now gets what Windows programs need to find their login and reach the network, and
a Claude Code installed with npm is found. A real install is now tested on Windows, without a login.

**It says what went wrong.** If Claude Code isn't logged in, the job tells you what to do, in your language. *Settings →
Local AI* shows where Claude Code was found, why it didn't start, and has *Check again*. Class files say why Claude can't
write from here instead of leaving the choice out.

**A new course shows up.** The lessons sat under a closed row of the sidebar. A course now starts open, under its own
title, and files that arrive while you are here, even from an assistant in a terminal, open the way to themselves and
carry a small mark. A finished course job has *Open the course*.

**The copied command works from cmd on another drive.** On Windows it now starts with `pushd`.

## 1.6.0 — 2026-11-01

**Ask the companion anything about your course.** The companion is now on by default, as a small pixel creature at the
foot of the sidebar, and clicking it opens a conversation. It knows your notes, your lessons, your progress and the page
you are on, so you can ask about a passage, what to review next, or just "and why is that?". It shows where each answer
came from, and says plainly when something isn't in your course. It stays away from study sessions and mock exams, and
you can change it or turn it off in Settings.

**Asking now reads your lessons.** Ask only searched your notes, so a course without notes had nothing to find. Each
card of a lesson now counts too.

**Any language.** Answers come in the language you ask in, whatever language the course is in, and a question in another
language now finds the right passages. Messages from the search follow the language of the app.

**Claude can answer.** Asking needed a local model. Without one, Claude Code answers instead, and the page says what goes to
Anthropic: the passages and titles it reads, and your study progress if you asked the companion.

## 1.5.1 — 2026-11-01

**MDlearn is on npm.** With Node.js 22.15 or newer, `npx mdlearn studio` opens the app in your browser, and
`npm install -g mdlearn` keeps the command. The desktop app still needs nothing installed.

**A smaller npm download.** The Studio package no longer carries source maps, so it takes about 30 MB on disk instead of
80 MB. The app itself hasn't changed.

## 1.5.0 — 2026-11-01

**Courses in any language.** The first step of a course now asks for the language it should be written in, for every
way of writing one: Claude from here, a coding assistant, or a chat. Leave it empty and the course follows your files,
so the language of the app no longer decides it. An English app can ask for Spanish, and an Italian app can keep an
English course.

**Translate a course you have started.** *Translate this course* on the overview page moves the whole course to another
language. Every card's id is written down first, so nothing starts over, and you can undo the whole translation. Your
notes stay, in the list of notes whose passage changed.

**Saving progress on Windows.** When Studio and the command line or MCP server saved at the same moment, a save could
stop with a permission error. It now waits its turn, as it already did on macOS and Linux.

## 1.4.1 — 2026-11-01

**PDFs need nothing installed.** The quick PDF reader now uses pdf.js, which comes with the app, so it works the same on
Windows, macOS and Linux and poppler is no longer needed. Across the manuals and papers compared it read the same text,
joined broken lines better and stopped turning stray letters into headings. A bold label at the start of a line is no
longer taken for a heading.

**OpenCode has finished a whole course,** with a remote GLM model: the instructions in the folder were enough, the
lessons passed lint and the class files were left alone. Codex and Pi are still unconfirmed.

**Ready for npm.** The command line package is now called `mdlearn`, and every package carries its licence, a short guide
and the Node.js version it needs.

## 1.4.0 — 2026-10-31

**MDlearn is now open source,** under the MIT License. The README, contribution guide and security policy are written
for people who are new to it, and the Help page lists the open-source licences of what's inside.

**A first page that explains itself.** It says what MDlearn does in three steps with one main action, and the tutorial
is right below. People who have been here before see their recent folders first. A folder with no lessons now says so
and offers to make them, where Study used to say *You are all caught up*.

**Accent colours that show.** Picking a colour used to change almost nothing, because selected rows, options, charts
and borders were fixed to ink. They all follow your accent now, in both themes.

**A course from your class files.** The first page now starts where most people do: *Make a course from my class
files* takes PDFs, PowerPoint, Word files and pictures, keeps the originals, reads what it can, and says what it couldn't.
Then Claude, your coding assistant or a chat writes the lessons, and they appear as they are written.

**Change a course after you've started.** A course's page now shows where you stand in each lesson. Move lessons, pause one, add
class files, or tell Claude what should change: cards keep their schedule even with new titles, and the job ends by saying how many kept
their progress. If an edit elsewhere loses a studied card, MDlearn offers to reconnect it. Coding assistants get the same rules.

**Colour with a job.** Callouts, formula terms and key words now use colour that means something, checked for contrast and colour
blindness. Select a passage to highlight it as important, confusing or for the exam: confusing passages wait on Today with *Explain*, and
exam passages offer *Make a card*. You can turn colour off in Settings, and icons and underlines still say the same thing.

**A companion to try.** Off by default. In Settings you can choose a small orb or a pixel creature at the foot of the sidebar. It shows what
MDlearn is really doing, stays away from questions, and never rewards or nags you.

**Courses appear wherever they are written.** A course from a topic, from a chat or from an assistant sits in its
own folder, and until now its lessons opened from a link but never reached the library, Today or Study. They now
do, in Studio, the CLI and the MCP tools. Lessons sit under their `course.md`.

**Pictures.** A document or lesson can show a picture from the web by its `https` address, in Markdown or in
`<img>`. It waits until you allow its site for that document, because a document could use a picture's address to send
information out, and one that can't be loaded leaves its description and a link. Paste or drop a screenshot into the editor and it's
saved under `assets/`. Click any picture, or press Enter on it, to see it larger.

**Every system.** The tests now run on Windows, macOS and Linux for every change. That found a lesson's id being its whole
path on Windows, which would have lost your progress if you moved the folder, and wrong paths for a folder reached through
a link.

**Fixes.** Jumping to a section could shift the whole app up and hide its top bar until you reloaded. Claude Code now
uses whatever it's signed in with, including your own `ANTHROPIC_API_KEY`. A damaged notes file no longer breaks Today.
`mdlearn --version` works, and a mistyped option gets a short message instead of a crash.

**Other coding assistants.** A course folder carries its own instructions for Codex, OpenCode, Pi and Claude Code, with
nothing to install: `mdlearn agents`, or *Get this folder ready for my AI* in Ctrl+K, puts them there. A whole course has
been tested from start to finish with Claude Code only. Your own
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
