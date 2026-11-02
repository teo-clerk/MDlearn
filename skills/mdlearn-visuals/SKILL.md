---
name: mdlearn-visuals
description: Add interactive visuals to MDlearn lessons and notes — slider plots of a formula, formulas explained term by term, step-by-step animations of derivations or processes, small canvas simulations, and sandboxed HTML interactives — written as checked Markdown blocks. Use when a lesson or section would be clearer with a picture of how a quantity behaves, when the user asks to visualise, plot, animate or simulate something, or when building a course from math-heavy notes.
---

# MDlearn visual blocks

Five blocks for notes and lessons, all plain Markdown, all checked by the compiler (`lint_lesson`). They explain; they are never
graded. Full rules: DSL_SPECIFICATION.md §8.11 and §8.14 (in the mdlearn-course skill). For practice with
motion (matching, sorting, a true/false round) use the graded games `match`, `sort`, `speed` (§8.12) instead.

## When to add one (and when not)

- **plot** — the idea is *how something changes*: a power law (R⁻⁴), a threshold, a trade-off, a
  distribution's shape. One clear relation per plot; sliders only for parameters the learner should feel.
- **formula** — a dense equation whose *terms* each carry a meaning worth stating (radar equation,
  Bayes, a loss function). 2–5 terms.
- **animate** — a *derivation* or a chain of substitutions the learner should see unfold, 2–6 frames; or,
  with Markdown frames and `{replace}`, the *stages of a process* (transmit → scatter → receive → focus),
  one frame at a time — a frame may hold text, an image, a small table or a diagram.
- **sim** — a *process* only motion shows (random phasor sums, gradient descent, sampling). Last resort:
  most ideas are clearer as a plot.
- **html** — a small interactive that none of the above can express (a band picker, a drag-the-satellite
  geometry toy, a CSS animation). Your own HTML/CSS/JS in a sandbox; it is practice only (scores are shown,
  never recorded). Prefer a plot, a sim or a graded game whenever one fits.
- Never decorate: a visual must carry an idea the text cannot. A note uses as many as its sections need, a
  short lesson one or two. Never inside a question (`:::quiz` etc.).
- A structure or a flow is often clearer as a ` ```mermaid ` diagram or a table. A subject without formulas
  has plenty to show: a funnel as stages in `animate`, a budget to split in `html`, a margin in `plot`.

## Syntax

Parameters: a bullet list, symbol first as inline math, then value / range / `log` / unit, then `—` label.

```markdown
:::plot[Received power falls as R⁻⁴]{y=log}
Drag the gain: the curve moves up, but the slope never changes.
$$P_r = \frac{P_t G^2 \lambda^2 \sigma}{(4\pi)^3 R^4}$$
- $R$ in [100e3, 2000e3] m — slant range
- $P_t$ = 1000 in [10, 5000] W — transmit power
- $G$ = 1000 in [10, 10000] log — antenna gain
- $\lambda$ = 0.055 m — wavelength
- $\sigma$ = 1 m^2 — radar cross-section
:::
```

- Exactly one parameter has a range and **no value**: the x axis. Every other symbol needs a value.
- Up to four formulas, each `name = expression`, become curves on the same axes.
- Write formulas in LaTeX the compiler can compute: `\frac`, powers, `\sqrt`, `\exp`, `\ln`, `\log_{10}`,
  `\sin`…, `\max`, `|x|`, `\sum_{k=1}^{n}`, `\begin{cases}`. Declare every symbol, including constants
  (`- $c$ = 3e8 m/s — speed of light`). Use `{y=log}` / `{x=log}` for power laws.

```markdown
:::formula[Bayes' theorem, term by term]
$$P(H \mid E) = \frac{P(E \mid H)\,P(H)}{P(E)}$$
- $P(E \mid H)$ — likelihood: how expected the evidence is if the hypothesis is true
- $P(H)$ — prior: what you believed before the evidence
- $P(E)$ — evidence: how expected it is overall, under every hypothesis
:::
```

Each term must appear in the formula exactly as written (E908).

```markdown
:::animate[Where R⁴ comes from]
1. $$S_{tx} = \frac{P_t G}{4\pi R^2}$$ Power density at the target.
2. $$S_{rx} = \frac{P_t G\,\sigma}{(4\pi)^2 R^4}$$ Spread again on the way back: a second $R^2$.
3. $$P_r = S_{rx} A_e = \frac{P_t G^2 \lambda^2 \sigma}{(4\pi)^3 R^4}$$ Collect with the aperture $A_e = G\lambda^2/4\pi$.
:::
```

Simulations run JavaScript in an offline sandbox with a 2D canvas:

~~~markdown
:::sim[Speckle as a random phasor sum]{height=320}
Each scatterer adds a unit phasor with a random phase; the pixel is the sum.
```js
const { ctx, width, height } = api
api.frame(() => {
  ctx.clearRect(0, 0, width, height)
  ctx.strokeStyle = api.theme.ink
  let x = width / 2, y = height / 2
  for (let i = 0; i < api.params.N; i++) {
    const a = api.random() * 2 * Math.PI
    ctx.beginPath(); ctx.moveTo(x, y); x += 12 * Math.cos(a); y += 12 * Math.sin(a); ctx.lineTo(x, y); ctx.stroke()
  }
})
```
- $N$ = 10 in [1, 200] — scatterers per pixel
:::
~~~

`api`: `ctx`, `width`, `height`, `params` (by symbol name: `P_t`, `sigma`, `N`), `frame(fn(t))` (called every
animation frame), `onParams(fn)`, `random()` (seeded), `theme.ink / theme.muted / theme.accent`. No network,
no DOM, no imports. Keep it under 80 lines; draw in the theme colours so it works in light and dark.

Markdown frames, one at a time:

```markdown
:::animate[One radar echo, step by step]{replace}
1. **Transmit.** The antenna sends a short chirp towards the ground.
2. **Scatter.** Every surface element sends part of it back.
3. **Receive.** The echo arrives after $t = 2R/c$, which gives the range.
:::
```

Your own interactive, in a sandbox (one ```` ```html ```` block, ≤ 64 KB, inline `<style>` and `<script>`):

~~~markdown
:::html[Pick the band]
Choose the radar band that fits the job.
```html
<style> button { color: var(--text); background: var(--raised); border: 1px solid var(--border-strong); border-radius: 8px; padding: 8px 14px; } </style>
<p>Map soil moisture under a forest canopy.</p>
<button id="l">L-band</button> <button id="x">X-band</button>
<script>
  document.getElementById('l').addEventListener('click', () => mdlearn.done({ score: 1, total: 1 }))
  document.getElementById('x').addEventListener('click', () => mdlearn.done({ score: 0, total: 1 }))
</script>
```
:::
~~~

Inside: the Studio's colours as CSS variables (`--text`, `--bg`, `--raised`, `--border`, `--good`, `--bad`,
`--font-read`, …, following light/dark), `mdlearn.reducedMotion`, `mdlearn.done({ score, total })`. No
network, no external scripts or images (use `data:` URLs); respect `prefers-reduced-motion`; keep it short.
`{height=N}` fixes the height, `{auto}` starts it without Play.

## Check

Call `lint_lesson` after adding a visual. Fix every E (the block falls back to static text otherwise) and W:
E903 lists undeclared symbols, E905 asks for an x axis, W907 means the curve is mostly undefined with your
default values (check units and ranges). E924/E925: an `:::html` block needs exactly one `html` fence under
64 KB; W926: it tries to reach the network.
