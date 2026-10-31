---
title: Ayuda
---

# Ayuda

## Cómo funciona MDlearn

Tus apuntes siguen siendo archivos Markdown normales. Las **lecciones** (`learn/*.learn.md`) contienen tarjetas cortas con preguntas;
**Estudiar** te vuelve a mostrar cada tarjeta justo antes de que la olvides. De cinco a diez minutos al día en
**Hoy**: ese es el hábito que da resultado.

## Cómo se crean las lecciones

Empieza en la primera página con **Crear un curso con mis archivos de clase**. Dale tus PDF, PowerPoint, Word e imágenes.
Los originales se quedan en `sources/`, y lo que se puede leer se convierte en texto e imágenes que cualquier IA puede
usar. Luego elige quién escribe las lecciones:

| Quién | Cómo |
|---|---|
| **Claude, desde aquí** | Empieza enseguida, y puedes seguirlo, detenerlo y deshacerlo. |
| **Tu asistente de programación** | Claude Code, Codex, OpenCode o Pi: MDlearn prepara la carpeta y te da un solo comando. |
| **Un chat** | ChatGPT, Claude.ai o Gemini: adjunta tus archivos, pega el prompt de MDlearn y trae la respuesta con **Importar → Desde un chat**. |

Las lecciones aparecen a medida que se escriben. En el editor, pega o suelta una captura para añadir una imagen. Haz clic en una imagen para verla más grande. Una imagen de la web espera hasta que permitas su sitio, porque un documento podría usarla para sacar información.

Para cambiar un curso ya empezado, abre su página de presentación. Puedes mover o pausar una lección, añadir archivos o pedir un cambio. Las tarjetas conservan su calendario, incluso con títulos nuevos.

## El color en tus notas

Aquí el color tiene una función: el tipo de recuadro, un término de una fórmula y su explicación, la palabra clave de una tarjeta. Selecciona un
pasaje para resaltarlo como **Importante**, **Confuso** o **Para el examen**, sin escribir nada. Los pasajes confusos te esperan en **Hoy**, y los
del examen ofrecen **Crear una tarjeta**. **Ajustes → Apariencia → Color en las notas** lo desactiva.

## Las páginas

| Página | Para qué sirve |
|---|---|
| **Hoy** | Tu sesión diaria: primero las tarjetas pendientes, luego algunas nuevas. Aquí están también los objetivos y las fechas límite. |
| **Estudiar** | Una tarjeta cada vez: responde, di si estabas seguro, lee la valoración. |
| **Simulacro de examen** | Preguntas sobre lo que has estudiado, mezcladas entre lecciones, con tiempo si quieres, corregidas solo al final. |
| **Preguntar** | Una pregunta sobre toda la carpeta, que el modelo local responde con tus propios pasajes. |
| **Progreso** | Lo que has visto, cuánto recuerdas de cada lección, tu precisión y tu racha. Y el **control de seguridad**: las tarjetas de las que estabas seguro pero fallaste, listas para repasar. |
| **Estudiar sin conexión** | En el móvil: llévate las tarjetas de los próximos días (Hoy → *Llévate sin conexión las tarjetas de los próximos días*), estudia sin conexión y las respuestas se sincronizan cuando el ordenador está a tu alcance. Deja la página abierta mientras no tengas conexión. |
| **LaTeX** | *Nueva nota → Documento LaTeX*, o cualquier archivo `.tex` bajo *LaTeX* en la barra lateral: escribe a la izquierda, **Compilar** (Ctrl+S) para ver el PDF a la derecha; los errores llevan a su línea. Necesita Tectonic o TeX Live en el ordenador. |
| **IA local** | *Ajustes → IA local*: instala Ollama si falta, descarga un modelo recomendado (cada uno dice si este ordenador lo mueve bien) y elige con cuál responde Studio. |
| **Importar** | *Importar…* en la barra lateral: una página web, un PDF, una baraja de Anki, un notebook, lecciones de un chat, o un artículo de **SciNet** si se está ejecutando en este ordenador. |
| **Bandeja de entrada** | Ctrl+Mayús+K guarda una idea desde cualquier página, y *Bandeja de entrada* en la barra de una selección guarda un pasaje. Ordénalos en Hoy: **Tarjeta**, **Mover** a un documento, o **Hecho**. Son Markdown sencillo en `Inbox/`. |
| **AI Studio** | Claude Code escribe o mejora lecciones a partir de un apunte (se ejecuta en este ordenador, con tu propia cuenta). |
| **Fórmulas** · **Glosario** · **Mapa** | Cada fórmula, cada término definido y qué apuntes se basan en cuáles: un grafo en 2D o 3D, coloreado según lo bien que recuerdas cada apunte. |

## Mientras lees

- **Selecciona texto** para ver la barra de herramientas: **Nota** (junto al pasaje), **Tarjeta** (una pregunta rápida),
  **Preguntar**, **Explicar** y **Visualizar** (modelo local).
- Las palabras subrayadas son términos que definen tus apuntes: pasa el cursor por encima. Los enlaces a otros apuntes muestran una vista previa.
- **Explícalo tú** (en una lección, o en el menú `…` para una sección): explícalo con tus palabras; el modelo
  local (o Claude) te dice qué ideas clave trataste, qué corregir, y te hace una pregunta.
- La pestaña **Relacionados** del panel derecho muestra pasajes de otros documentos sobre la sección que estás
  leyendo, y te sigue mientras te desplazas.
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
| `::video[clip.mp4]` o un enlace de YouTube/Vimeo | un vídeo; las preguntas que lo siguen con `{at=4:15}` lo pausan ahí |
| `<mark>`, `<kbd>`, `<sub>`, `<details>`, `<figure>`, `<svg>`… | HTML en su sitio (los scripts siempre se eliminan) |
| `:::note`, `:::tip`, `:::important`, `:::warning` | recuadros (`{fold}` para plegarlos) |

## Teclado

| Teclas | Hace |
|---|---|
| <kbd>Ctrl</kbd>+<kbd>K</kbd> | buscar apuntes, lecciones y comandos |
| <kbd>Ctrl</kbd>+<kbd>Mayús</kbd>+<kbd>K</kbd> | anota una idea en tu bandeja de entrada |
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
