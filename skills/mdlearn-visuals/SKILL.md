---
name: mdlearn-visuals
description: Add interactive visuals to MDlearn lessons and notes — slider plots of a formula, formulas explained term by term, step-by-step animated derivations, and small canvas simulations — written as checked Markdown blocks. Use when a lesson or section would be clearer with a picture of how a quantity behaves, when the user asks to visualise, plot, animate or simulate something, or when building a course from math-heavy notes.
---

# MDlearn visual blocks

Four blocks, all plain Markdown, all checked by the compiler (`lint_lesson`). They explain; they are never
graded. Full rules: DSL_SPECIFICATION.md §8.11 (in the mdlearn-course skill).

## When to add one (and when not)

- **plot** — the idea is *how something changes*: a power law (R⁻⁴), a threshold, a trade-off, a
  distribution's shape. One clear relation per plot; sliders only for parameters the learner should feel.
- **formula** — a dense equation whose *terms* each carry a meaning worth stating (radar equation,
  Bayes, a loss function). 2–5 terms.
- **animate** — a *derivation* or a chain of substitutions the learner should see unfold, 2–6 frames.
- **sim** — a *process* only motion shows (random phasor sums, gradient descent, sampling). Last resort:
  most ideas are clearer as a plot.
- Never decorate: a visual must carry an idea the text cannot. At most one or two per lesson card; never
  inside a question (`:::quiz` etc.).

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

## Check

Call `lint_lesson` after adding a visual. Fix every E (the block falls back to static text otherwise) and W:
E903 lists undeclared symbols, E905 asks for an x axis, W907 means the curve is mostly undefined with your
default values (check units and ranges).
