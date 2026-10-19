---
target: MDlearn CLI, tutor flow and docs
total_score: 14
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
timestamp: 2026-10-01T09-56-57Z
slug: packages-cli-src-index-ts
---
Method: dual-agent (A: design review · B: detector + mechanical scan)

## Design Health Score — 14/40 (Poor: content strong, shell weak)
| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 1 | --limit 5 serves 3 (hidden --new-cards); "mean recall 100%" after failures |
| 2 | Match real world | 1 | FSRS "Again/Hard"; US date 10/1/2026; raw TeX titles |
| 3 | User control | 2 | skip/? ok; no quit/undo; empty Enter = revealed |
| 4 | Consistency | 1 | "one per line" vs Enter; confidence asked twice; queue/review defaults differ; no close |
| 5 | Error prevention | 0 | decimals misparsed (42.9 → gap 42 = 9); self-check "no" = Good |
| 6 | Recognition vs recall | 2 | hints announced; no way to open § mid-session |
| 7 | Flexibility | 2 | --json/--scope good; undocumented flags; EPIPE trace |
| 8 | Minimalist design | 2 | literal **, redundant "Correct: A", options split around math |
| 9 | Error recovery | 2 | bad scope → 🎉; E111 cascade buries real errors |
| 10 | Help & docs | 1 | README is dev-facing; no learner quick start |

## Priority issues
- [P0] Decimal answers misparsed by parseBlankAnswers (tutor.ts) → correct numeric answers graded wrong in CLI and MCP tutor. Fix label parsing + regression tests. (/impeccable harden)
- [P1] Self-check treats anything not starting with "m" as correct (cli reviewSession). Accept a/p/m only. (/impeccable harden)
- [P1] Session has no frame: no opening summary, no end summary, Again cards not re-asked, report shows predicted recall as if performance, streak 0 after study. (/impeccable onboard + clarify)
- [P1] Answer-format copy written for Claude contradicts terminal; skip never shows keys; order reveal as bare numbers. (/impeccable clarify)
- [P2] Terminal rendering & locale: raw TeX, mixed gap styles, split options, US dates, glyph-only verdicts, FSRS words. (/impeccable typeset + clarify)

## Persona red flags
- Jordan: no learner quick start; empty report with no next step; jargon unexplained.
- Alex: undocumented flags, no per-command help, EPIPE, queue/review mismatch, no due-only/quit.
- Sam: glyph-only verdicts, box-drawing read aloud, literal **, raw LaTeX.
- Teo: 10/1/2026 ambiguity, 42.9 rejected while 42,9 accepted, "no" = Good, no link to objectives/F-M4 deliverables.

## Minor
Slug ids in report; repeated file names in source line; lint no-arg exits 0; no success line on clean lint; I605 noise; EACCES outside curriculum; long help lines; progress_report lacks per-session counts.

## Questions
CLI fallback or first-class? Prediction vs performance? Sessions that end with mastery of objectives/deliverables?
