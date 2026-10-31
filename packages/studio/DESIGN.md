---
name: MDlearn Studio
description: A quiet notes app for reading, studying and building courses from Markdown.
colors:
  page: "#ffffff"
  sidebar: "#f7f7f5"
  panel: "#fbfbfa"
  raised: "#ffffff"
  ink: "#2c2c2b"
  muted: "#6f6e6a"
  subtle: "#75746f"
  hairline: "#e8e7e4"
  hairline-strong: "#d6d5d1"
  hover: "rgb(40 38 33 / 0.05)"
  active: "rgb(40 38 33 / 0.085)"
  focus: "#6b7cc8"
  good: "#2c7a4b"
  warn: "#9a5b06"
  bad: "#c03a2b"
  code: "#f5f5f3"
  note-highlight: "rgb(214 170 40 / 0.22)"
  page-dark: "#191919"
  sidebar-dark: "#202020"
  panel-dark: "#1d1d1d"
  raised-dark: "#252525"
  ink-dark: "#e7e6e2"
  muted-dark: "#a09f9b"
  hairline-dark: "#2f2f2e"
typography:
  reading:
    fontFamily: "Source Serif 4 Variable, Iowan Old Style, Charter, Georgia, serif"
    fontSize: "18px"
    lineHeight: 1.68
  ui:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Helvetica Neue, Arial, sans-serif"
    fontSize: "14px"
    lineHeight: 1.5
  page-title:
    fontFamily: "{typography.ui.fontFamily}"
    fontSize: "32px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.022em"
  section:
    fontFamily: "{typography.ui.fontFamily}"
    fontSize: "1.42rem"
    fontWeight: 650
    lineHeight: 1.3
  label:
    fontFamily: "{typography.ui.fontFamily}"
    fontSize: "12.5px"
    fontWeight: 500
  mono:
    fontFamily: "ui-monospace, SF Mono, JetBrains Mono, Cascadia Code, Menlo, Consolas, monospace"
    fontSize: "13px"
rounded:
  control: "6px"
  card: "8px"
  surface: "10px"
  study-card: "12px"
spacing:
  sidebar: "264px"
  panel: "340px"
  reading-measure: "760px"
  gutter: "24px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.page}"
    rounded: "{rounded.control}"
    height: "32px"
    padding: "0 12px"
  button-secondary:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "32px"
  button-ghost:
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "32px"
  nav-item-active:
    backgroundColor: "{colors.active}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "32px"
  visual-frame:
    backgroundColor: "{colors.page}"
    rounded: "{rounded.surface}"
    padding: "14px 16px"
---

# Design System: MDlearn Studio

## Overview

The notes-app standard (Obsidian, Notion), kept minimal, with colourless chrome and colour with a job in the text: a warm-grey sidebar, a white
page, an outline/notes panel, hairline borders, and an ink accent. Long technical text is set in a serif
and is the first thing on screen; the app's chrome is the system sans and stays out of the way. Colour is
reserved for meaning a reader must not miss: right, nearly right, wrong, and how well a section is remembered
— always paired with words or icons. Light and dark follow the system unless the reader picks one.

## Colors

- **Ink on paper.** `ink` on `page` for everything; `muted` for secondary text and labels; `subtle` (≥ 4.5:1)
  for section numbers, counts and timestamps. Primary buttons are ink-filled; links are ink with a hairline
  underline that darkens on hover. There is no brand hue.
- **Surfaces by tone, not by colour.** `sidebar` and `panel` are a step off white; `hover` / `active` are ink
  at 5% / 8.5%. Dark mode mirrors the steps (#191919 page, #202020 sidebar).
- **Meaning only.** `good`, `warn`, `bad` appear on verdict icons, gap and option borders after a check, the
  rating pill (solid / shaky / again), lint results and memory dots. Their soft tints back a result row.
- **Notes.** Noted passages use a pale yellow highlight (`note-highlight`, stronger when the note is
  active), drawn with the CSS Custom Highlight API so the document's markup never changes.
- **Colour in the reading column** (`--hue-blue`, `green`, `violet`, `amber`, `rose`). The research says signalling helps when it means
  something and stays sparse, so colour has jobs here: callouts (note blue, tip green, important violet, warning amber, each with an icon),
  formula terms (the first five; a term and its explanation match; the rest stay ink), the key term in a card (`<mark>`, at most a few, W610),
  and your highlights (important amber, confusing rose with a wavy underline, for the exam blue with a straight one). Light and dark are
  separate sets, each at least 4.5:1 on the page and at least ΔE 11 apart in OKLab under protan, deutan and tritan simulation (15 is the floor in
  normal vision). The obvious blue and violet looked fine and were 2.4 apart for red-green colour blindness, which is why lightness differs so much
  between hues. Check any change the same way.
- **Focus** is a muted indigo outline (`focus`), the one hue that exists only to be found.

## Typography

- Reading: Source Serif 4 (optical sizes), 18px / 1.68, measure ≤ 760px. Study cards and widgets use the
  same serif at 15.5–17px so a question reads like the notes it came from.
- UI and headings: system sans. Page titles 32px bold, −0.022em; section headings 1.42rem / 1.16rem at
  ~650 weight with the document's own number (§ 3.1) in `subtle` before the title (never repeated in it).
- Labels 12.5px medium in `muted`, sentence case. No uppercase tracked labels, no eyebrows above headings.
- Numbers in data (counts, percentages, axes) use tabular figures. Monospace only for code, paths and raw
  Markdown.
- Math is KaTeX (1.06em inline); formulas render lazily near the viewport.

## Layout

- Three columns: sidebar 264px · page (reading column ≤ 760px, centred) · side panel 340px (Outline / Notes).
  Below 900px the sidebar becomes a drawer; below 1100px the panel overlays from the right.
- Top bar 44px: path breadcrumb on the left, page actions on the right, ghost buttons only.
- Notes align with their passage in the panel and scroll with the page; the card being worked on keeps its
  place and the others make room.
- Study is a single column ≤ 720px: plan line, a 3px progress rule, one card.

## Elevation & Depth

Flat. Depth is tone and hairlines. One shadow (`0 1px 2px` + `0 6px 20px`, 5–8% ink) for things that float
above the page: menus, the command palette, dialogs, the selection toolbar, the active note card.

## Shapes

6px for controls, 8px for cards and lists, 10px for figures (visual blocks, practice questions), 12px for
the study card. Borders are 1px hairlines; blockquote and quote rules are 1px.

## Components

- **Sidebar rows** 32px, icon 16px Lucide at 1.8 stroke, active row on `active`. Counts sit right-aligned in
  `muted` tabular figures.
- **Buttons**: primary (ink fill), secondary (raised + strong hairline), ghost; 28/32px tall; disabled at
  50% opacity; busy shows a spinner in place of the icon.
- **Quiz options**: full-width rows with a lettered 22px box; picked = ink box; after checking, the right
  option gets a green check box and soft green row, a wrong pick a red cross; the explanation sits under the
  option.
- **Gaps**: inline inputs in the sentence (numbered when there are several); inside a formula they appear as
  numbered boxes with their inputs right after it; after checking, a check or the expected answer.
- **Verdict**: icon + word ("Right", "Not quite", "Nearly right", "Answer shown"), then the author's
  explanation, then the rating pill and the next review in words.
- **Visual blocks**: a 10px-rounded hairline figure with a bold caption. Plots are monochrome SVG (curves
  differ by dash pattern), hairline grid, tabular axis labels, a floating readout on hover; sliders under the
  chart, two columns on wide screens. Explained formulas highlight a term and its meaning together.
  Animations add each step under the last with a short fade-and-rise; reduced motion shows the steps plainly.
- **Notes**: raised cards with the quoted passage (1px rule, two lines max), the note, and the AI thread
  (question in medium weight, answer in Markdown with math, engine name in `subtle`).
- **Defined terms and link previews**: a term in running text gets a 1px dotted underline in `subtle` (never
  colour); on hover (after 350 ms) or keyboard focus a small raised card shows its definition and where it is
  defined; a link to another document shows what it is and how well it is remembered. Escape closes; the
  cards never take pointer events.
- **Reader actions**: icon buttons for what is used while reading (study, edit, source); everything else
  (cheat sheet, print, export, term underlines) lives in one "More" menu.
- **Library pages** (formulas, glossary, map): a 26px title, one muted line of context, a search field, then
  the list; formulas are hairline cards with the TeX centred and its source section beneath; the glossary is
  a plain A–Z definition list; the map is monochrome (hairline boxes, memory dots, arrows only on
  prerequisites, dashed lines for plain links).
- **Ask**: the question in semibold, the answer in the UI sans at 15px with `[n]` citations as quiet links,
  then hairline source rows (document · §section, two lines of the passage) with a note button.
- **Cheat sheet**: print-first; one or two columns of formulas and definitions, section headings with a
  hairline; everything else hides when printing.
- **Editor**: source on the left in the mono face (weight and tone for syntax, no hues), preview on the right;
  problems as wavy underlines in `bad` / `warn`; a status word beside the path; conflict is a `warn-soft`
  strip with two buttons, never a dialog.
- **Import dialog**: four option cards (hairline, the chosen one gets an ink border), then only the fields
  that kind needs; the result lists the files created as links.
- **AI jobs**: a status word with icon, the changed files with their check result, a live log in a panel-toned
  box, Undo as a secondary button.

## Do's and Don'ts

- Do let the document lead: no banners, hero areas or cards around the reading column.
- Do put meaning in words first and colour second (verdicts, ratings, memory, lint).
- Do keep one accent in the app's chrome: ink. Use `good` / `warn` / `bad` only for results.
- Do keep hues to the reading column, and give each one a job: a callout's kind, a formula term and its explanation, a
  key term, or a highlight you chose. Each comes with an icon, a shape or a label, and *Colour in notes* turns them grey.
- Don't add a hue without running the checks below, and don't colour text that is only decoration.
- Don't add uppercase tracked labels, kickers or eyebrows; use sentence-case `muted` labels.
- Don't use side stripes thicker than 1px, gradients, glass, or coloured icon tiles.
- Don't render AI output as HTML; it goes through the Markdown/KaTeX renderers like everything else.
