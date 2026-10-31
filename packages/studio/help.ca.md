---
title: Ajuda
---

# Ajuda

## Com funciona MDlearn

Els teus apunts continuen sent fitxers Markdown normals. Les **lliçons** (`learn/*.learn.md`) contenen targetes curtes amb preguntes;
**Estudia** et torna a mostrar cada targeta just abans que l'oblidis. De cinc a deu minuts al dia a
**Avui**: aquest és l'hàbit que dona fruits.

## Les pàgines

| Pàgina | Per a què serveix |
|---|---|
| **Avui** | La teva sessió diària: primer les targetes pendents, després unes quantes de noves. Aquí també hi ha els objectius i les dates límit. |
| **Estudia** | Una targeta cada vegada: respon, digues si n'estaves segur, llegeix la valoració. |
| **Simulacre d’examen** | Preguntes sobre el que has estudiat, barrejades entre lliçons, amb temps si vols, corregides només al final. |
| **Pregunta** | Una pregunta sobre tota la carpeta, que el model local respon amb els teus propis passatges. |
| **Progrés** | El que has vist, com recordes cada lliçó, la teva precisió i la teva ratxa. I el **control de seguretat**: les targetes de les quals n’estaves segur però vas fallar, a punt per repassar. |
| **Estudia sense connexió** | Al mòbil: emporta’t les targetes dels propers dies (Avui → *Emporta’t sense connexió les targetes dels propers dies*), estudia sense connexió i les respostes se sincronitzen quan l’ordinador és a l’abast. Deixa la pàgina oberta mentre no tinguis connexió. |
| **LaTeX** | *Nota nova → Document LaTeX*, o qualsevol fitxer `.tex` a *LaTeX* a la barra lateral: escriu a l’esquerra, **Compila** (Ctrl+S) per veure el PDF a la dreta; els errors porten a la seva línia. Cal Tectonic o TeX Live a l’ordinador. |
| **IA local** | *Configuració → IA local*: instal·la Ollama si falta, baixa un model recomanat (cadascun diu si aquest ordinador el fa anar bé) i tria amb quin respon Studio. |
| **Importa** | *Importa…* a la barra lateral: una pàgina web, un PDF, una baralla d’Anki, un quadern, lliçons d’un xat, o un article de **SciNet** si s’està executant en aquest ordinador. |
| **Safata d’entrada** | Ctrl+Maj+K desa una idea des de qualsevol pàgina, i *Safata d’entrada* a la barra d'una selecció desa un passatge. Endreça’ls a Avui: **Targeta**, **Mou** a un document, o **Fet**. Són Markdown senzill a `Inbox/`. |
| **AI Studio** | Claude Code escriu o millora lliçons a partir d'un apunt (fa servir la teva subscripció de Claude). |
| **Fórmules** · **Glossari** · **Mapa** | Cada fórmula, cada terme definit i quins apunts es basen en quins: un graf en 2D o 3D, acolorit segons com recordes cada apunt. |

## Mentre llegeixes

- **Selecciona text** per veure la barra d'eines: **Nota** (al costat del passatge), **Targeta** (una pregunta ràpida),
  **Pregunta**, **Explica** i **Visualitza** (model local).
- Les paraules subratllades són termes que defineixen els teus apunts: passa-hi el cursor per sobre. Els enllaços a altres apunts en mostren una previsualització.
- **Explica-ho tu** (en una lliçó, o al menú `…` per a una secció): explica-ho amb les teves paraules; el model
  local (o Claude) et diu quines idees clau has tractat, què has de corregir, i et fa una pregunta.
- La pestanya **Relacionats** del tauler dret mostra passatges d'altres documents sobre la secció que estàs
  llegint, i et segueix mentre et desplaces.
- L'**índex** del tauler dret segueix la secció que llegeixes; el menú `…` té el
  full resum i el codi font.

## Escriure apunts interactius

Tot el que segueix funciona en qualsevol `.md` i a les lliçons. En una lliçó, les preguntes i els jocs també es converteixen en
targetes de repàs. El tutorial mostra cadascun en directe amb el seu codi.

| Escrius | Obtens |
|---|---|
| `:::quiz` amb opcions `- [x]` / `- [ ]` | opció múltiple, amb una valoració sota cada opció |
| `:::cloze` amb `{{answer}}` | omple els buits (text, nombres, fórmules) |
| `:::order` amb una llista numerada | ordena els passos |
| `:::explain` amb una llista `> - idea` | explica-ho amb les teves paraules i després compara |
| `:::steps` amb una llista numerada | un exemple resolt, pas a pas |
| `:::code` amb blocs `python` / `python test` | un exercici de programació comprovat al navegador |
| `:::match` amb `- esquerra :: dreta` | aparella (`{memory}`: un joc de memòria) |
| `:::sort` amb una llista niada | classifica elements en grups |
| `:::speed` amb afirmacions `- [x]` / `- [ ]` | una ronda de vertader/fals (`{time=60}` per a un compte enrere) |
| `:::plot`, `:::formula`, `:::animate`, `:::sim` | gràfics interactius, fórmules explicades, animacions, simulacions |
| `:::html` amb un bloc `html` | el teu propi HTML, CSS i JavaScript, en un entorn aïllat |
| `::video[clip.mp4]` o un enllaç de YouTube/Vimeo | un vídeo; les preguntes que el segueixen amb `{at=4:15}` el posen en pausa allà |
| `<mark>`, `<kbd>`, `<sub>`, `<details>`, `<figure>`, `<svg>`… | HTML al seu lloc (els scripts sempre s'eliminen) |
| `:::note`, `:::tip`, `:::important`, `:::warning` | requadres (`{fold}` per plegar-los) |

## Teclat

| Tecles | Fa |
|---|---|
| <kbd>Ctrl</kbd>+<kbd>K</kbd> | cerca apunts, lliçons i ordres |
| <kbd>Ctrl</kbd>+<kbd>Maj</kbd>+<kbd>K</kbd> | anota una idea a la teva safata d’entrada |
| <kbd>Ctrl</kbd>+<kbd>\</kbd> | mostra o amaga la barra lateral |
| <kbd>?</kbd> | aquesta pàgina |
| <kbd>A</kbd>–<kbd>E</kbd> · <kbd>Retorn</kbd> | tria una opció · comprova i passa a la targeta següent |
| <kbd>Y</kbd> / <kbd>N</kbd> | segur / no segur |
| <kbd>T</kbd> / <kbd>F</kbd> | vertader / fals en una ronda ràpida |
| <kbd>←</kbd> / <kbd>→</kbd> | pas anterior / següent d'una animació |

## Les teves dades

Tot queda a la teva carpeta: les lliçons a `learn/`, les teves respostes a `learn/.mdlearn/progress.json`,
les notes i l'historial de la IA a `.mdlearn/`. Res no surt del teu ordinador tret que iniciïs una tasca d'AI Studio
(Claude): Pregunta, Explica i Visualitza s'executen amb el model local.
