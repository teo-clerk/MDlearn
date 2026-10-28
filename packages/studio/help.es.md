---
title: Ayuda
---

# Ayuda

## Cómo funciona MDlearn

Tus apuntes siguen siendo archivos Markdown normales. Las **lecciones** (`learn/*.learn.md`) contienen tarjetas cortas con preguntas;
**Estudiar** te vuelve a mostrar cada tarjeta justo antes de que la olvides. De cinco a diez minutos al día en
**Hoy**: ese es el hábito que da resultado.

## Las páginas

| Página | Para qué sirve |
|---|---|
| **Hoy** | Tu sesión diaria: primero las tarjetas pendientes, luego algunas nuevas. Aquí están también los objetivos y las fechas límite. |
| **Estudiar** | Una tarjeta cada vez: responde, di si estabas seguro, lee la valoración. |
| **Preguntar** | Una pregunta sobre toda la carpeta, que el modelo local responde con tus propios pasajes. |
| **Progreso** | Lo que has visto, cuánto recuerdas de cada lección, tu precisión y tu racha. |
| **AI Studio** | Claude Code escribe o mejora lecciones a partir de un apunte (usa tu suscripción de Claude). |
| **Fórmulas** · **Glosario** · **Mapa** | Cada fórmula, cada término definido y qué apuntes se basan en cuáles: un grafo en 2D o 3D, coloreado según lo bien que recuerdas cada apunte. |

## Mientras lees

- **Selecciona texto** para ver la barra de herramientas: **Nota** (junto al pasaje), **Tarjeta** (una pregunta rápida),
  **Preguntar**, **Explicar** y **Visualizar** (modelo local).
- Las palabras subrayadas son términos que definen tus apuntes: pasa el cursor por encima. Los enlaces a otros apuntes muestran una vista previa.
- El **índice** del panel derecho sigue la sección que estás leyendo; el menú `…` tiene la
  hoja resumen y el código fuente.

## Escribir apuntes interactivos

Todo lo que sigue funciona en cualquier `.md` y en las lecciones. En una lección, las preguntas y los juegos también se convierten en
tarjetas de repaso. El tutorial muestra cada uno en directo con su código.

| Escribes | Obtienes |
|---|---|
| `:::quiz` con opciones `- [x]` / `- [ ]` | opción múltiple, con una valoración bajo cada opción |
| `:::cloze` con `{{answer}}` | completa los huecos (texto, números, fórmulas) |
| `:::order` con una lista numerada | ordena los pasos |
| `:::explain` con una lista `> - idea` | explícalo con tus palabras y luego compara |
| `:::steps` con una lista numerada | un ejemplo resuelto, paso a paso |
| `:::code` con bloques `python` / `python test` | un ejercicio de programación comprobado en el navegador |
| `:::match` con `- izquierda :: derecha` | empareja (`{memory}`: un juego de memoria) |
| `:::sort` con una lista anidada | clasifica elementos en grupos |
| `:::speed` con afirmaciones `- [x]` / `- [ ]` | una ronda de verdadero/falso (`{time=60}` para una cuenta atrás) |
| `:::plot`, `:::formula`, `:::animate`, `:::sim` | gráficas interactivas, fórmulas explicadas, animaciones, simulaciones |
| `:::html` con un bloque `html` | tu propio HTML, CSS y JavaScript, en un entorno aislado |
| `<mark>`, `<kbd>`, `<sub>`, `<details>`, `<figure>`, `<svg>`… | HTML en su sitio (los scripts siempre se eliminan) |
| `:::note`, `:::tip`, `:::important`, `:::warning` | recuadros (`{fold}` para plegarlos) |

## Teclado

| Teclas | Hace |
|---|---|
| <kbd>Ctrl</kbd>+<kbd>K</kbd> | buscar apuntes, lecciones y comandos |
| <kbd>Ctrl</kbd>+<kbd>\</kbd> | mostrar u ocultar la barra lateral |
| <kbd>?</kbd> | esta página |
| <kbd>A</kbd>–<kbd>E</kbd> · <kbd>Intro</kbd> | elegir una opción · comprobar y pasar a la siguiente tarjeta |
| <kbd>Y</kbd> / <kbd>N</kbd> | seguro / no seguro |
| <kbd>T</kbd> / <kbd>F</kbd> | verdadero / falso en una ronda rápida |
| <kbd>←</kbd> / <kbd>→</kbd> | paso anterior / siguiente de una animación |

## Tus datos

Todo se queda en tu carpeta: las lecciones en `learn/`, tus respuestas en `learn/.mdlearn/progress.json`,
las notas y el historial de IA en `.mdlearn/`. Nada sale de tu ordenador salvo que inicies una tarea de AI Studio
(Claude): Preguntar, Explicar y Visualizar se ejecutan con el modelo local.
