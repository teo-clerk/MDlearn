---
title: The feature tour, as cards
level: beginner
source: ../feature-tour.md
goals:
  - Recognise each kind of question and game MDlearn offers
  - Write a match, sort or speed round in plain Markdown
---

The same features as the tour, as lesson cards: answer them here, and **Today** brings them back for review.

## Questions become cards

::read[§6]

A question written in a lesson is also a card: Study schedules it again just before you would forget it.

:::quiz
What happens to a question you answer correctly in Study?
- [ ] It is removed from the lesson.
  > Nothing is removed: the card simply waits longer before coming back.
- [x] It comes back later, after a longer gap each time.
  > Right: that growing gap is spaced repetition.
- [ ] It comes back tomorrow, every day.
  > Daily repetition of a known card wastes time; the gap grows instead.
:::

## Symbols and their meaning

::read[§7]

Pick a symbol, then its meaning.

:::match
Match each radar symbol with what it means.
- $\sigma^0$ :: backscatter coefficient
- $\lambda$ :: wavelength
- $B$ :: bandwidth
- $\theta_i$ :: incidence angle
:::

## Missions and instruments

Flip two cards: one ● and one ○. A pair stays face up.

:::match{memory}
Find the instrument of each mission.
- Sentinel-1 :: C-band SAR
- Sentinel-2 :: MultiSpectral Instrument
- Sentinel-3 :: ocean and land colour
- Sentinel-5P :: TROPOMI spectrometer
:::

## Active or passive

An active sensor sends its own signal and records the echo; a passive one only records what arrives.

:::sort
Sort the sensors.
- Active
  - SAR
  - LiDAR
  - radar altimeter
- Passive
  - multispectral camera
  - microwave radiometer
  - thermal infrared imager
:::

## Radar in 40 seconds

:::speed[True or false?]{time=40}
- [x] SAR is an active sensor.
- [ ] C-band has a longer wavelength than L-band.
  > L-band is about 24 cm, C-band about 5.6 cm.
- [x] Speckle is multiplicative noise.
- [ ] Thick clouds block C-band radar.
  > Microwaves pass through clouds; only heavy rain affects the shortest bands.
- [x] Range resolution improves with more bandwidth.
:::

## HTML in notes

::read[§5]

Inline tags such as <mark>mark</mark> and <kbd>kbd</kbd> render in place; scripts never do.

:::cloze
Interactive HTML with JavaScript goes in a block named {{html}}, which runs in a {{sandbox}} with no network.
:::
