---
title: Aiuto
---

# Aiuto

## Come funziona MDlearn

I tuoi appunti restano semplici file Markdown. Le **lezioni** (`learn/*.learn.md`) contengono brevi carte con domande;
**Studia** ripropone ogni carta poco prima che tu la dimentichi. Da cinque a dieci minuti al giorno su
**Oggi**: è questa l'abitudine che ripaga.

## Le pagine

| Pagina | A cosa serve |
|---|---|
| **Oggi** | La tua sessione giornaliera: prima le carte da ripassare, poi qualche carta nuova. Qui ci sono anche obiettivi e scadenze. |
| **Studia** | Una carta alla volta: rispondi, di' se eri sicuro, leggi il riscontro. |
| **Chiedi** | Una domanda su tutta la cartella, a cui il modello locale risponde con i tuoi passaggi. |
| **Progressi** | Cosa hai visto, quanto ricordi ogni lezione, la tua precisione e la tua serie. |
| **AI Studio** | Claude Code scrive o migliora lezioni a partire da un appunto (usa il tuo abbonamento Claude). |
| **Formule** · **Glossario** · **Mappa** | Ogni formula, ogni termine definito e quali appunti si basano su quali. |

## Mentre leggi

- **Seleziona del testo** per la barra degli strumenti: **Nota** (accanto al passaggio), **Carta** (una domanda veloce),
  **Chiedi**, **Spiega** e **Visualizza** (modello locale).
- Le parole sottolineate sono termini definiti nei tuoi appunti: passaci sopra. I link ad altri appunti mostrano un'anteprima al passaggio del mouse.
- L'**indice** nel pannello di destra segue la sezione che stai leggendo; il menu `…` contiene la
  scheda riassuntiva e il sorgente.

## Scrivere appunti interattivi

Tutto ciò che segue funziona in qualsiasi `.md` e nelle lezioni. In una lezione, domande e giochi diventano anche
carte di ripasso. Il tutorial mostra ciascuno dal vivo con il suo sorgente.

| Scrivi | Ottieni |
|---|---|
| `:::quiz` con opzioni `- [x]` / `- [ ]` | scelta multipla, con un riscontro sotto ogni opzione |
| `:::cloze` con `{{answer}}` | completa gli spazi (testo, numeri, formule) |
| `:::order` con un elenco numerato | metti i passi in ordine |
| `:::explain` con un elenco `> - idea` | spiega con parole tue, poi confronta |
| `:::steps` con un elenco numerato | un esempio svolto, passo per passo |
| `:::code` con blocchi `python` / `python test` | un esercizio di programmazione verificato nel browser |
| `:::match` con `- sinistra :: destra` | abbina le coppie (`{memory}`: un gioco di memoria) |
| `:::sort` con un elenco annidato | dividi gli elementi in gruppi |
| `:::speed` con affermazioni `- [x]` / `- [ ]` | una gara vero/falso (`{time=60}` per un conto alla rovescia) |
| `:::plot`, `:::formula`, `:::animate`, `:::sim` | grafici interattivi, formule spiegate, animazioni, simulazioni |
| `:::html` con un blocco `html` | il tuo HTML, CSS e JavaScript, in una sandbox |
| `<mark>`, `<kbd>`, `<sub>`, `<details>`, `<figure>`, `<svg>`… | HTML al suo posto (gli script vengono sempre rimossi) |
| `:::note`, `:::tip`, `:::important`, `:::warning` | riquadri (`{fold}` per richiuderli) |

## Tastiera

| Tasti | Funzione |
|---|---|
| <kbd>Ctrl</kbd>+<kbd>K</kbd> | cerca appunti, lezioni e comandi |
| <kbd>Ctrl</kbd>+<kbd>\</kbd> | mostra o nasconde la barra laterale |
| <kbd>?</kbd> | questa pagina |
| <kbd>A</kbd>–<kbd>E</kbd> · <kbd>Invio</kbd> | scegli un'opzione · verifica, poi carta successiva |
| <kbd>Y</kbd> / <kbd>N</kbd> | sicuro / non sicuro |
| <kbd>T</kbd> / <kbd>F</kbd> | vero / falso in una gara di velocità |
| <kbd>←</kbd> / <kbd>→</kbd> | passo precedente / successivo di un'animazione |

## I tuoi dati

Tutto resta nella tua cartella: le lezioni in `learn/`, le tue risposte in `learn/.mdlearn/progress.json`,
le note e la cronologia dell'IA in `.mdlearn/`. Niente lascia il tuo computer a meno che tu non avvii un lavoro di AI Studio
(Claude): Chiedi, Spiega e Visualizza girano sul modello locale.
