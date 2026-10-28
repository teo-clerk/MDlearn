---
title: Aide
---

# Aide

## Comment fonctionne MDlearn

Vos notes restent de simples fichiers Markdown. Les **leçons** (`learn/*.learn.md`) contiennent de courtes fiches avec des questions ;
**Réviser** vous remontre chaque fiche juste avant que vous ne l'oubliiez. Cinq à dix minutes par jour sur
**Aujourd'hui** : c'est l'habitude qui paie.

## Les pages

| Page | À quoi elle sert |
|---|---|
| **Aujourd'hui** | Votre session quotidienne : d'abord les fiches à réviser, puis quelques nouvelles. Les objectifs et les échéances sont ici aussi. |
| **Réviser** | Une fiche à la fois : répondez, dites si vous étiez sûr, lisez le retour. |
| **Demander** | Une question sur tout le dossier, à laquelle le modèle local répond avec vos propres passages. |
| **Progrès** | Ce que vous avez vu, à quel point vous retenez chaque leçon, votre précision et votre série. |
| **AI Studio** | Claude Code écrit ou améliore des leçons à partir d'une note (utilise votre abonnement Claude). |
| **Formules** · **Glossaire** · **Carte** | Chaque formule, chaque terme défini, et quelles notes s'appuient sur lesquelles : un graphe en 2D ou en 3D, coloré selon ce que vous retenez de chaque note. |

## Pendant la lecture

- **Sélectionnez du texte** pour la barre d'outils : **Note** (à côté du passage), **Fiche** (une question rapide),
  **Demander**, **Expliquer** et **Visualiser** (modèle local).
- Les mots soulignés sont des termes définis dans vos notes : survolez-les. Les liens vers d'autres notes s'affichent en aperçu au survol.
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
