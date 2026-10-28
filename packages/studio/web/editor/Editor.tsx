// The Markdown source editor: CodeMirror 6 with this app's look, diagnostics from the compiler shown inline,
// block names after `:::`, and Ctrl+S.
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection, placeholder } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { HighlightStyle, syntaxHighlighting, indentOnInput } from '@codemirror/language'
import { autocompletion, completionKeymap, type CompletionContext } from '@codemirror/autocomplete'
import { lintGutter, setDiagnostics, type Diagnostic as CmDiagnostic } from '@codemirror/lint'
import { tags } from '@lezer/highlight'
import { BLOCK_NAMES, splitCursor } from './snippets'
import { t } from '../i18n'

export interface EditorHandle { insert(text: string): void; focus(): void; setText(text: string): void; jumpTo(line: number): void }
export interface Problem { line: number; severity: 'error' | 'warning'; message: string }

const theme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'var(--bg)', color: 'var(--text)', fontSize: '13.5px' },
  '.cm-scroller': { fontFamily: 'ui-monospace, SF Mono, JetBrains Mono, Cascadia Code, Menlo, Consolas, monospace', lineHeight: '1.7', overflow: 'auto' },
  '.cm-content': { padding: '14px 4px 40vh', caretColor: 'var(--text)', maxWidth: '78ch' },
  '.cm-gutters': { backgroundColor: 'var(--bg)', color: 'var(--subtle)', border: 'none' },
  '.cm-activeLine': { backgroundColor: 'var(--hover)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--text)' },
  '&.cm-focused': { outline: 'none' },
  '&.cm-focused .cm-cursor': { borderLeftColor: 'var(--text)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': { backgroundColor: 'var(--active)' },
  '.cm-tooltip': { backgroundColor: 'var(--raised)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '8px', boxShadow: 'var(--shadow-pop, 0 6px 20px rgb(0 0 0 / .08))' },
  '.cm-tooltip-autocomplete ul li[aria-selected]': { backgroundColor: 'var(--active)', color: 'var(--text)' },
  '.cm-lintRange-error': { backgroundImage: 'none', textDecoration: 'underline wavy var(--bad)', textUnderlineOffset: '3px' },
  '.cm-lintRange-warning': { backgroundImage: 'none', textDecoration: 'underline wavy var(--warn)', textUnderlineOffset: '3px' },
  '.cm-lint-marker-error': { content: '"●"', color: 'var(--bad)' }, '.cm-lint-marker-warning': { content: '"●"', color: 'var(--warn)' },
})
// quiet highlighting: weight and tone, no hues
const highlight = HighlightStyle.define([
  { tag: [tags.heading1, tags.heading2, tags.heading3, tags.heading4], fontWeight: '650' },
  { tag: tags.strong, fontWeight: '650' }, { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: [tags.monospace, tags.processingInstruction], color: 'var(--muted)' },
  { tag: [tags.link, tags.url], color: 'var(--muted)', textDecoration: 'underline' },
  { tag: [tags.quote, tags.comment], color: 'var(--muted)' }, { tag: tags.contentSeparator, color: 'var(--subtle)' },
])

function blockNames(ctx: CompletionContext) {
  const m = ctx.matchBefore(/^:::[a-z]*/)
  if (!m || (m.from === m.to && !ctx.explicit)) return null
  return { from: m.from + 3, options: BLOCK_NAMES.map((label) => ({ label, type: 'keyword' })), validFor: /^[a-z]*$/ }
}

export const Editor = forwardRef<EditorHandle, { initial: string; onChange(text: string): void; onSave(): void; problems: Problem[]; ariaLabel: string }>(function Editor({ initial, onChange, onSave, problems, ariaLabel }, ref) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const cb = useRef({ onChange, onSave }); cb.current = { onChange, onSave }

  useEffect(() => {
    const extensions: Extension[] = [
      lineNumbers(), history(), drawSelection(), highlightActiveLine(), indentOnInput(), EditorView.lineWrapping, lintGutter(),
      markdown(), syntaxHighlighting(highlight), theme, autocompletion({ override: [blockNames], icons: false }),
      placeholder(t('Write Markdown. Insert a question or a visual from the Insert menu.')),
      EditorView.contentAttributes.of({ 'aria-label': ariaLabel, spellcheck: 'true' }),
      keymap.of([{ key: 'Mod-s', preventDefault: true, run: () => { cb.current.onSave(); return true } }, ...completionKeymap, ...defaultKeymap, ...historyKeymap]),
      EditorView.updateListener.of((u) => { if (u.docChanged) cb.current.onChange(u.state.doc.toString()) }),
    ]
    const v = new EditorView({ state: EditorState.create({ doc: initial, extensions }), parent: host.current! })
    view.current = v
    return () => { v.destroy(); view.current = null }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- one editor per mount; its text is driven through the handle

  useImperativeHandle(ref, () => ({
    focus: () => view.current?.focus(),
    setText(text) { const v = view.current; if (v) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: text }, selection: { anchor: 0 } }) },
    insert(snippet) {
      const v = view.current; if (!v) return
      const { text, cursor } = splitCursor(snippet)
      const sel = v.state.selection.main
      const line = v.state.doc.lineAt(sel.head)
      // a block goes on its own line: after the current line unless the cursor sits on an empty one
      const at = line.text.trim() === '' ? line.from : line.to
      const lead = line.text.trim() === '' ? '' : '\n\n'
      v.dispatch({ changes: { from: at, insert: lead + text }, selection: { anchor: at + lead.length + cursor }, scrollIntoView: true })
      v.focus()
    },
    jumpTo(n) {
      const v = view.current; if (!v) return
      const line = v.state.doc.line(Math.max(1, Math.min(n, v.state.doc.lines)))
      v.dispatch({ selection: { anchor: line.from }, effects: EditorView.scrollIntoView(line.from, { y: 'center' }) }); v.focus()
    },
  }), [])

  useEffect(() => {
    const v = view.current; if (!v) return
    const diags: CmDiagnostic[] = problems.map((p) => { const l = v.state.doc.line(Math.max(1, Math.min(p.line || 1, v.state.doc.lines))); return { from: l.from, to: l.to, severity: p.severity, message: p.message } })
    v.dispatch(setDiagnostics(v.state, diags))
  }, [problems])

  return <div ref={host} className="h-full min-h-0 overflow-hidden" />
})
