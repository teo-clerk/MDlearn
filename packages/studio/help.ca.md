---
title: Ajuda
---

# Ajuda

## Com funciona MDlearn

Els teus apunts continuen sent fitxers Markdown normals. Les **lliçons** (`learn/*.learn.md`) contenen targetes curtes amb preguntes;
**Estudia** et torna a mostrar cada targeta just abans que l'oblidis. De cinc a deu minuts al dia a
**Avui**: aquest és l'hàbit que dona fruits.

## Com es fan els cursos

Comença a la primera pàgina amb **Crea un curs**. Digues què vols aprendre i afegeix els PDF, PowerPoint, Word i imatges
que tinguis. Els originals es queden a `sources/`, i el que es pot llegir es converteix en text i imatges que qualsevol IA
pot fer servir. Després tria qui escriu el curs:

| Qui | Com |
|---|---|
| **Claude, des d'aquí** | Comença de seguida, i el pots seguir, aturar i desfer. |
| **El teu assistent de programació** | Claude Code, Codex, OpenCode o Pi: MDlearn prepara la carpeta i et dona una sola ordre. |
| **Un xat** | ChatGPT, Claude.ai o Gemini: adjunta els fitxers, enganxa el prompt d'MDlearn i porta la resposta amb **Importa → Des d'un xat**. |

El resultat són uns apunts millors que els que tenies: un fitxer `.md` per tema, amb explicacions completes, exemples resolts i exercicis a cada secció, i fórmules, animacions, diagrames, imatges i vídeos on ajuden. No es perd res dels teus fitxers, i el que la IA hi afegeix queda en una nota visible. Els seus exercicis tornen a **Avui** i a **Estudia**, on **Llegeix-ho als teus apunts** et porta a la secció. Claude també pot buscar a internet si marques la casella, i el que busca surt del teu ordinador. Si els teus apunts ja són complets, AI Studio pot **Només afegir exercicis** i deixar el teu text com està.

Els apunts apareixen a mesura que s'escriuen. A l'editor, enganxa o deixa anar una captura per afegir una imatge. Fes clic en una imatge per veure-la més gran. Una imatge del web espera fins que permetis el seu lloc, perquè un document la podria fer servir per treure informació.

Per canviar un curs ja començat, obre la seva pàgina de presentació. Pots moure o posar en pausa una lliçó, afegir fitxers o demanar un canvi. Les targetes conserven el calendari, fins i tot amb títols nous. Per passar un curs a una altra llengua, fes servir *Tradueix aquest curs*: cada targeta conserva el calendari.

## El color a les notes

Aquí el color té una funció: el tipus de requadre, un terme d'una fórmula i la seva explicació, la paraula clau d'una targeta. Selecciona un
passatge per ressaltar-lo com a **Important**, **Confús** o **Per a l'examen**, sense escriure res. Els passatges confusos t'esperen a **Avui**, i
els de l'examen ofereixen **Crea una targeta**. **Configuració → Aparença → Color a les notes** el desactiva.

Els ressaltats d'un curs diuen què marquen, i la pàgina ho explica: ambre per a la idea clau, blau per a una definició, verd per a un exemple, rosa per a un error habitual i violeta per a una regla.

## Les pàgines

| Pàgina | Per a què serveix |
|---|---|
| **Avui** | La teva sessió diària: primer les targetes pendents, després unes quantes de noves. Aquí també hi ha els objectius i les dates límit. |
| **Estudia** | Una targeta cada vegada: respon, digues si n'estaves segur, llegeix la valoració. |
| **Simulacre d’examen** | Preguntes sobre el que has estudiat, barrejades entre lliçons, amb temps si vols, corregides només al final. |
| **Pregunta** | Una pregunta sobre tota la carpeta, apunts i lliçons, que el model local o Claude respon amb els teus propis passatges, en la llengua en què preguntis. |
| **Company** | Al peu de la barra lateral. Fes-hi clic mentre llegeixes per preguntar el que vulguis sobre el teu curs, o què has de repassar ara. Pots canviar-lo o amagar-lo a *Configuració → Aparença*. |
| **Progrés** | El que has vist, com recordes cada lliçó, la teva precisió i la teva ratxa. I el **control de seguretat**: les targetes de les quals n’estaves segur però vas fallar, a punt per repassar. |
| **Estudia sense connexió** | Al mòbil: emporta’t les targetes dels propers dies (Avui → *Emporta’t sense connexió les targetes dels propers dies*), estudia sense connexió i les respostes se sincronitzen quan l’ordinador és a l’abast. Deixa la pàgina oberta mentre no tinguis connexió. |
| **LaTeX** | *Nota nova → Document LaTeX*, o qualsevol fitxer `.tex` a *LaTeX* a la barra lateral: escriu a l’esquerra, **Compila** (Ctrl+S) per veure el PDF a la dreta; els errors porten a la seva línia. Cal Tectonic o TeX Live a l’ordinador. |
| **IA local** | *Configuració → IA local*: instal·la Ollama si falta, baixa un model recomanat (cadascun diu si aquest ordinador el fa anar bé) i tria amb quin respon Studio. |
| **Importa** | *Importa…* a la barra lateral: una pàgina web, un PDF, una baralla d’Anki, un quadern, lliçons d’un xat, o un article de **SciNet** si s’està executant en aquest ordinador. |
| **Safata d’entrada** | Ctrl+Maj+K desa una idea des de qualsevol pàgina, i *Safata d’entrada* a la barra d'una selecció desa un passatge. Endreça’ls a Avui: **Targeta**, **Mou** a un document, o **Fet**. Són Markdown senzill a `Inbox/`. |
| **AI Studio** | Claude Code escriu o millora lliçons a partir d'un apunt (s'executa en aquest ordinador, amb el teu compte). |
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
(Claude) o triïs Claude per preguntar. Explica i Visualitza s'executen sempre amb el model local, i Pregunta també si no tries Claude.
