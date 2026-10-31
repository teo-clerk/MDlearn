---
title: Aide
---

# Aide

## Comment fonctionne MDlearn

Vos notes restent de simples fichiers Markdown. Les **leçons** (`learn/*.learn.md`) contiennent de courtes fiches avec des questions ;
**Réviser** vous remontre chaque fiche juste avant que vous ne l'oubliiez. Cinq à dix minutes par jour sur
**Aujourd'hui** : c'est l'habitude qui paie.

## Comment naissent les leçons

Commencez sur la première page avec **Créer un cours à partir de mes fichiers**. Donnez-lui vos PDF, PowerPoint, Word et
images. Les originaux restent dans `sources/`, et ce qui peut être lu devient du texte et des images utilisables par
n'importe quelle IA. Choisissez ensuite qui écrit les leçons :

| Qui | Comment |
|---|---|
| **Claude, depuis ici** | Il démarre tout de suite, et vous pouvez le suivre, l'arrêter et l'annuler. |
| **Votre assistant de code** | Claude Code, Codex, OpenCode ou Pi : MDlearn prépare le dossier et vous donne une seule commande. |
| **Un chat** | ChatGPT, Claude.ai ou Gemini : joignez vos fichiers, collez le prompt MDlearn et rapportez la réponse avec **Importer → Depuis un chat**. |

Les leçons apparaissent au fur et à mesure. Dans l'éditeur, collez ou déposez une capture pour ajouter une image. Cliquez sur une image pour l'agrandir. Une image du web attend que vous autorisiez son site, car un document pourrait s’en servir pour faire sortir des informations.

Pour changer un cours déjà commencé, ouvrez sa page de présentation. Vous pouvez déplacer ou mettre en pause une leçon, ajouter des fichiers ou demander un changement. Les cartes gardent leur calendrier, même avec de nouveaux titres.

## La couleur dans vos notes

Ici, la couleur a un rôle : le type d'encadré, un terme d'une formule et son explication, le mot clé d'une carte. Sélectionnez un passage pour le
surligner comme **Important**, **Pas clair** ou **Pour l'examen**, sans rien écrire. Les passages pas clairs vous attendent sur **Aujourd'hui**, et
ceux de l'examen proposent **Créer une carte**. **Réglages → Apparence → Couleur dans les notes** la désactive.

## Les pages

| Page | À quoi elle sert |
|---|---|
| **Aujourd'hui** | Votre session quotidienne : d'abord les fiches à réviser, puis quelques nouvelles. Les objectifs et les échéances sont ici aussi. |
| **Réviser** | Une fiche à la fois : répondez, dites si vous étiez sûr, lisez le retour. |
| **Examen blanc** | Des questions sur ce que vous avez étudié, mélangées entre les leçons, chronométrées si vous voulez, corrigées seulement à la fin. |
| **Demander** | Une question sur tout le dossier, à laquelle le modèle local répond avec vos propres passages. |
| **Progrès** | Ce que vous avez vu, à quel point vous retenez chaque leçon, votre précision et votre série. Et le **contrôle de confiance** : les fiches dont vous étiez sûr mais que vous avez ratées, prêtes à revoir. |
| **Étudier hors ligne** | Sur un téléphone : emportez les fiches des prochains jours (Aujourd’hui → *Emporter hors ligne les cartes des prochains jours*), étudiez sans connexion, et les réponses se synchronisent quand l’ordinateur est joignable. Gardez la page ouverte hors ligne. |
| **LaTeX** | *Nouvelle note → Document LaTeX*, ou tout fichier `.tex` sous *LaTeX* dans la barre latérale : écrivez à gauche, **Compiler** (Ctrl+S) pour voir le PDF à droite ; les erreurs mènent à leur ligne. Il faut Tectonic ou TeX Live sur l’ordinateur. |
| **IA locale** | *Réglages → IA locale* : installez Ollama s’il manque, téléchargez un modèle recommandé (chacun indique si cet ordinateur le fait bien tourner) et choisissez celui avec lequel Studio répond. |
| **Importer** | *Importer…* dans la barre latérale : une page web, un PDF, un paquet Anki, un notebook, des leçons d’un chat, ou un article de **SciNet** s’il tourne sur cet ordinateur. |
| **Boîte de réception** | Ctrl+Maj+K enregistre une idée depuis n'importe quelle page, et *Boîte de réception* dans la barre d'une sélection enregistre un passage. Triez-les dans Aujourd'hui : **Fiche**, **Déplacer** vers un document, ou **Terminé**. C'est du Markdown simple dans `Inbox/`. |
| **AI Studio** | Claude Code écrit ou améliore des leçons à partir d'une note (il tourne sur cet ordinateur, avec votre propre compte). |
| **Formules** · **Glossaire** · **Carte** | Chaque formule, chaque terme défini, et quelles notes s'appuient sur lesquelles : un graphe en 2D ou en 3D, coloré selon ce que vous retenez de chaque note. |

## Pendant la lecture

- **Sélectionnez du texte** pour la barre d'outils : **Note** (à côté du passage), **Fiche** (une question rapide),
  **Demander**, **Expliquer** et **Visualiser** (modèle local).
- Les mots soulignés sont des termes définis dans vos notes : survolez-les. Les liens vers d'autres notes s'affichent en aperçu au survol.
- **Expliquez-le** (dans une leçon, ou dans le menu `…` pour une section) : expliquez-le avec vos mots ; le
  modèle local (ou Claude) vous dit quelles idées clés vous avez abordées, quoi corriger, et vous pose une question.
- L'onglet **Liés** du panneau de droite montre des passages d'autres documents sur la section que vous
  lisez, et vous suit quand vous faites défiler.
- Le **plan** du panneau de droite suit la section que vous lisez ; le menu `…` contient
  l'aide-mémoire et la source.

## Écrire des notes interactives

Tout ce qui suit fonctionne dans n'importe quel `.md` et dans les leçons. Dans une leçon, les questions et les jeux deviennent aussi
des fiches de révision. Le tutoriel montre chacun en direct avec sa source.

| Vous écrivez | Vous obtenez |
|---|---|
| `:::quiz` avec des options `- [x]` / `- [ ]` | un choix multiple, avec un retour sous chaque option |
| `:::cloze` avec `{{answer}}` | un texte à trous (texte, nombres, formules) |
| `:::order` avec une liste numérotée | des étapes à remettre dans l'ordre |
| `:::explain` avec une liste `> - idée` | une explication avec vos mots, puis la comparaison |
| `:::steps` avec une liste numérotée | un exemple résolu, étape par étape |
| `:::code` avec des blocs `python` / `python test` | un exercice de programmation vérifié dans le navigateur |
| `:::match` avec `- gauche :: droite` | des paires à associer (`{memory}` : un jeu de mémoire) |
| `:::sort` avec une liste imbriquée | des éléments à classer en groupes |
| `:::speed` avec des affirmations `- [x]` / `- [ ]` | une manche vrai/faux (`{time=60}` pour un compte à rebours) |
| `:::plot`, `:::formula`, `:::animate`, `:::sim` | graphiques interactifs, formules expliquées, animations, simulations |
| `:::html` avec un bloc `html` | votre propre HTML, CSS et JavaScript, dans un bac à sable |
| `::video[clip.mp4]` ou un lien YouTube/Vimeo | une vidéo ; les questions qui suivent avec `{at=4:15}` la mettent en pause à ce moment |
| `<mark>`, `<kbd>`, `<sub>`, `<details>`, `<figure>`, `<svg>`… | du HTML sur place (les scripts sont toujours retirés) |
| `:::note`, `:::tip`, `:::important`, `:::warning` | des encadrés (`{fold}` pour les replier) |

## Clavier

| Touches | Effet |
|---|---|
| <kbd>Ctrl</kbd>+<kbd>K</kbd> | rechercher des notes, des leçons et des commandes |
| <kbd>Ctrl</kbd>+<kbd>Maj</kbd>+<kbd>K</kbd> | noter une idée dans votre boîte de réception |
| <kbd>Ctrl</kbd>+<kbd>\</kbd> | afficher ou masquer la barre latérale |
| <kbd>?</kbd> | cette page |
| <kbd>A</kbd>–<kbd>E</kbd> · <kbd>Entrée</kbd> | choisir une option · vérifier, puis fiche suivante |
| <kbd>Y</kbd> / <kbd>N</kbd> | sûr / pas sûr |
| <kbd>T</kbd> / <kbd>F</kbd> | vrai / faux dans une manche rapide |
| <kbd>←</kbd> / <kbd>→</kbd> | étape précédente / suivante d'une animation |

## Vos données

Tout reste dans votre dossier : les leçons dans `learn/`, vos réponses dans `learn/.mdlearn/progress.json`,
les notes et l'historique de l'IA dans `.mdlearn/`. Rien ne quitte votre ordinateur sauf si vous lancez une tâche AI Studio
(Claude) : Demander, Expliquer et Visualiser tournent sur le modèle local.
