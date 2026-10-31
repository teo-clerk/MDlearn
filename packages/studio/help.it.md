---
title: Aiuto
---

# Aiuto

## Come funziona MDlearn

I tuoi appunti restano semplici file Markdown. Le **lezioni** (`learn/*.learn.md`) contengono brevi carte con domande;
**Studia** ripropone ogni carta poco prima che tu la dimentichi. Da cinque a dieci minuti al giorno su
**Oggi**: è questa l'abitudine che ripaga.

## Come nascono le lezioni

Parti dalla prima pagina con **Crea un corso dai miei file**. Dagli i tuoi PDF, PowerPoint, Word e immagini. Gli originali
restano in `sources/`, e ciò che si può leggere diventa testo e immagini utilizzabili da qualsiasi IA. Poi scegli chi
scrive le lezioni:

| Chi | Come |
|---|---|
| **Claude, da qui** | Parte subito, e puoi seguirlo, fermarlo e annullarlo. |
| **Il tuo assistente di programmazione** | Claude Code, Codex, OpenCode o Pi: MDlearn prepara la cartella e ti dà un solo comando. |
| **Una chat** | ChatGPT, Claude.ai o Gemini: allega i file, incolla il prompt di MDlearn e riporta la risposta con **Importa → Da una chat**. |

Le lezioni compaiono man mano che vengono scritte. Nell'editor, incolla o trascina uno screenshot per aggiungere un'immagine. Clicca su un'immagine per vederla più grande.

## Le pagine

| Pagina | A cosa serve |
|---|---|
| **Oggi** | La tua sessione giornaliera: prima le carte da ripassare, poi qualche carta nuova. Qui ci sono anche obiettivi e scadenze. |
| **Studia** | Una carta alla volta: rispondi, di' se eri sicuro, leggi il riscontro. |
| **Simulazione d’esame** | Domande su ciò che hai studiato, mescolate tra le lezioni, a tempo se vuoi, corrette solo alla fine. |
| **Chiedi** | Una domanda su tutta la cartella, a cui il modello locale risponde con i tuoi passaggi. |
| **Progressi** | Cosa hai visto, quanto ricordi ogni lezione, la tua precisione e la tua serie. E la **verifica della sicurezza**: le carte di cui eri sicuro ma che hai sbagliato, pronte da ripassare. |
| **Studia offline** | Sul telefono: porta con te le carte dei prossimi giorni (Oggi → *Porta offline le carte dei prossimi giorni*), studia senza connessione e le risposte si sincronizzano quando il computer è raggiungibile. Tieni aperta la pagina mentre sei offline. |
| **LaTeX** | *Nuova nota → Documento LaTeX*, o qualsiasi file `.tex` sotto *LaTeX* nella barra laterale: scrivi a sinistra, **Compila** (Ctrl+S) per vedere il PDF a destra; gli errori portano alla loro riga. Serve Tectonic o TeX Live sul computer. |
| **AI locale** | *Impostazioni → AI locale*: installa Ollama se manca, scarica un modello consigliato (ognuno dice se questo computer lo fa girare bene) e scegli quello con cui risponde Studio. |
| **Importa** | *Importa…* nella barra laterale: una pagina web, un PDF, un mazzo Anki, un notebook, lezioni da una chat, o un articolo da **SciNet** se è in esecuzione su questo computer. |
| **Inbox** | Ctrl+Maiusc+K salva un pensiero da qualsiasi pagina, e *Inbox* nella barra di una selezione salva un passaggio. Sistemali in Oggi: **Carta**, **Sposta** in un documento, o **Fatto**. Sono Markdown semplice in `Inbox/`. |
| **AI Studio** | Claude Code scrive o migliora lezioni a partire da un appunto (usa il tuo abbonamento Claude). |
| **Formule** · **Glossario** · **Mappa** | Ogni formula, ogni termine definito e quali appunti si basano su quali: un grafo in 2D o 3D, colorato secondo quanto ricordi ogni appunto. |

## Mentre leggi

- **Seleziona del testo** per la barra degli strumenti: **Nota** (accanto al passaggio), **Carta** (una domanda veloce),
  **Chiedi**, **Spiega** e **Visualizza** (modello locale).
- Le parole sottolineate sono termini definiti nei tuoi appunti: passaci sopra. I link ad altri appunti mostrano un'anteprima al passaggio del mouse.
- **Spiegalo tu** (in una lezione, o nel menu `…` per una sezione): spiegalo con parole tue; il modello
  locale (o Claude) ti dice quali idee chiave hai trattato, cosa correggere, e ti fa una domanda.
- La scheda **Correlati** nel pannello di destra elenca passaggi di altri documenti sulla sezione che stai
  leggendo, e ti segue mentre scorri.
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
| `::video[clip.mp4]` o un link YouTube/Vimeo | un video; le domande dopo con `{at=4:15}` lo mettono in pausa lì |
| `<mark>`, `<kbd>`, `<sub>`, `<details>`, `<figure>`, `<svg>`… | HTML al suo posto (gli script vengono sempre rimossi) |
| `:::note`, `:::tip`, `:::important`, `:::warning` | riquadri (`{fold}` per richiuderli) |

## Tastiera

| Tasti | Funzione |
|---|---|
| <kbd>Ctrl</kbd>+<kbd>K</kbd> | cerca appunti, lezioni e comandi |
| <kbd>Ctrl</kbd>+<kbd>Maiusc</kbd>+<kbd>K</kbd> | annota un pensiero nell’inbox |
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
