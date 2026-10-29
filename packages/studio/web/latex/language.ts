// LaTeX in the editor: highlighting (CodeMirror's stex mode, toned like the Markdown one: weight and grey, no
// hues), completion of the usual commands and environments (\begin{…} writes its \end too), and bracket pairs.
import { StreamLanguage, HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { stex } from '@codemirror/legacy-modes/mode/stex'
import { autocompletion, closeBrackets, snippetCompletion, type Completion, type CompletionContext } from '@codemirror/autocomplete'
import { tags } from '@lezer/highlight'
import type { EditorLanguage } from '../editor/Editor'
import { t } from '../i18n'

const latex = StreamLanguage.define({ ...stex, languageData: { commentTokens: { line: '%' }, closeBrackets: { brackets: ['(', '[', '{', '$'] } } })

const highlight = HighlightStyle.define([
  { tag: tags.tagName, fontWeight: '600' }, // \commands
  { tag: [tags.keyword, tags.atom], color: 'var(--muted)', fontWeight: '600' }, // \begin, \end, environment names
  { tag: tags.comment, color: 'var(--subtle)', fontStyle: 'italic' },
  { tag: [tags.bracket, tags.number], color: 'var(--muted)' },
  { tag: [tags.string, tags.special(tags.string)], color: 'var(--muted)' },
])

const COMMANDS = [
  'section{${}}', 'subsection{${}}', 'subsubsection{${}}', 'paragraph{${}}', 'chapter{${}}', 'title{${}}', 'author{${}}', 'date{${}}', 'maketitle',
  'tableofcontents', 'textbf{${}}', 'textit{${}}', 'emph{${}}', 'underline{${}}', 'texttt{${}}', 'textsc{${}}', 'footnote{${}}',
  'label{${}}', 'ref{${}}', 'eqref{${}}', 'cite{${}}', 'url{${}}', 'href{${url}}{${text}}', 'includegraphics[width=\\linewidth]{${}}',
  'caption{${}}', 'item ', 'usepackage{${}}', 'documentclass{${article}}', 'newcommand{\\${name}}{${}}', 'input{${}}', 'include{${}}',
  'frac{${}}{${}}', 'sqrt{${}}', 'sum_{${}}^{${}}', 'int_{${}}^{${}}', 'lim_{${}}', 'mathbf{${}}', 'mathrm{${}}', 'mathbb{${}}', 'mathcal{${}}',
  'left(${}\\right)', 'cdot', 'times', 'infty', 'partial', 'nabla', 'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'theta', 'lambda', 'mu',
  'pi', 'sigma', 'omega', 'Delta', 'Omega', 'leq', 'geq', 'neq', 'approx', 'to', 'quad', 'hline', 'centering', 'newpage', 'bibliography{${}}',
  'bibliographystyle{${plain}}', 'printbibliography',
]
const ENVIRONMENTS: [string, string][] = [
  ['itemize', '\\item ${}'], ['enumerate', '\\item ${}'], ['description', '\\item[${}] '], ['equation', '${}'], ['equation*', '${}'],
  ['align', '${} &= ${}'], ['align*', '${} &= ${}'], ['figure', '\\centering\n\t\\includegraphics[width=0.8\\linewidth]{${file}}\n\t\\caption{${}}\n\t\\label{fig:${}}'],
  ['table', '\\centering\n\t\\begin{tabular}{${ll}}\n\t\t${} & ${} \\\\\n\t\\end{tabular}\n\t\\caption{${}}'], ['tabular', '${} & ${} \\\\'],
  ['abstract', '${}'], ['quote', '${}'], ['verbatim', '${}'], ['center', '${}'], ['document', '${}'], ['proof', '${}'], ['cases', '${} & ${}'],
  ['pmatrix', '${} & ${} \\\\ ${} & ${}'], ['minipage', '${}'],
]
const placeholderFree = (s: string) => s.replace(/\$\{([^}]*)\}/g, '$1')
const OPTIONS: Completion[] = [
  ...COMMANDS.map((c) => snippetCompletion(`\\${c}`, { label: `\\${placeholderFree(c).replace(/\{.*$|\[.*$|\s+$/, '')}`, detail: placeholderFree(c).replace(/^[a-zA-Z]+/, ''), type: 'function' })),
  ...ENVIRONMENTS.map(([env, body]) => snippetCompletion(`\\begin{${env}}\n\t${body}\n\\end{${env}}`, { label: `\\begin{${env}}`, type: 'keyword', boost: 1 })),
]

function complete(ctx: CompletionContext) {
  const word = ctx.matchBefore(/\\[a-zA-Z{}*]*/)
  if (!word || (word.from === word.to && !ctx.explicit)) return null
  return { from: word.from, options: OPTIONS, validFor: /^\\[a-zA-Z{}*]*$/ }
}

export const latexLanguage = (): EditorLanguage => ({
  extensions: [latex, syntaxHighlighting(highlight), closeBrackets(), autocompletion({ override: [complete], icons: false })],
  placeholder: t('Write LaTeX. Type \\ for commands; Ctrl+S saves and compiles.'),
  spellcheck: false,
})
