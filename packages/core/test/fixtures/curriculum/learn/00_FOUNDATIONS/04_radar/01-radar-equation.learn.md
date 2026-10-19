---
title: The radar equation
level: intermediate
source: ../../../00_FOUNDATIONS/04_radar.md
goals:
  - Derive the radar equation
---

## Fourth-power loss

::read[§2, §2.1]

Received power falls as $R^{-4}$: the signal spreads on the way out **and** on the way back.

:::cloze
Doubling the range divides the received power by {{16}}.
:::

## Range resolution

::read[§3]

:::quiz
What sets slant-range resolution?
- [x] The pulse bandwidth.
  > Right: $\delta_r = c/2B$.
- [ ] The antenna length.
  > That limits azimuth, not range.
- [ ] The orbit height.
  > Height changes geometry, not the bandwidth limit.
:::

:::order
Order the radar link from transmitter to receiver.
1. Transmit the pulse.
2. Spread towards the target.
3. Scatter off the target.
4. Spread back to the antenna.
:::

## Broken reference

::read[§9.9]
