// Three-part layout: sidebar (folder, search, study, files) · page · right panel (outline, notes & AI).
// Pages put their own content into the right panel and the top bar through <PanelSlot> / <TopLeft> / <TopActions>.
import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'wouter'
import { createPortal } from 'react-dom'
import { PanelLeft, PanelRight } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { CommandPalette } from './CommandPalette'
import { ImportDialog } from '../import/ImportDialog'
import { CaptureDialog } from '../inbox/CaptureDialog'
import { Notice } from '../ui/Notice'
import { PictureZoom } from '../prose/Picture'
import { Tour } from '../help/Tour'
import { IconButton } from '../ui/primitives'
import { useUi } from '../state/ui'
import { useLiveEvents } from '../api/events'
import { t } from '../i18n'

export function Shell({ ws, children }: { ws: string; children: ReactNode }) {
  const { sidebar, panel, panelSlots, toggleSidebar, togglePanel, setPalette, setCaptureOpen, importOpen, setImportOpen } = useUi()
  useLiveEvents(ws)
  const [, navigate] = useLocation()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (e.shiftKey) setCaptureOpen(true); else setPalette(true) }
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') { e.preventDefault(); toggleSidebar() }
      // "?" opens Help, unless you are typing
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target as HTMLElement | null)?.isContentEditable
      if (e.key === '?' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); navigate(`/w/${ws}/help`) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setPalette, toggleSidebar, navigate, ws])
  const hasPanel = panelSlots > 0
  return (
    <div className="flex h-full overflow-clip bg-bg print:block print:h-auto print:overflow-visible">
      <Sidebar ws={ws} />
      {sidebar && <div className="fixed inset-0 z-30 bg-black/25 min-[900px]:hidden print:hidden" onClick={() => toggleSidebar(false)} aria-hidden />}
      <div className="flex min-w-0 flex-1 flex-col print:block">
        <header className="flex h-11 shrink-0 items-center gap-1 px-2.5 print:hidden">
          {!sidebar && <IconButton icon={PanelLeft} label={t('Show sidebar (Ctrl+\\)')} onClick={() => toggleSidebar(true)} />}
          <div id="topbar-left" className="flex min-w-0 flex-1 items-center gap-1" />
          <div id="topbar-actions" className="flex items-center gap-1" />
          {hasPanel && <IconButton icon={PanelRight} label={panel ? t('Hide side panel') : t('Show side panel')} active={panel} onClick={() => togglePanel()} />}
        </header>
        <div className="flex min-h-0 flex-1 print:block">
          <main id="main" className="min-w-0 flex-1 overflow-y-auto overscroll-contain print:block print:overflow-visible" tabIndex={-1}>{children}</main>
          {panel && hasPanel && <div className="fixed inset-0 z-30 bg-black/25 min-[1100px]:hidden print:hidden" onClick={() => togglePanel(false)} aria-hidden />}
          <aside id="right-panel" aria-label={t('Side panel')}
            className={`${panel && hasPanel ? 'flex' : 'hidden'} print:hidden w-[340px] max-w-[92vw] shrink-0 flex-col border-l border-border bg-panel max-[1099px]:fixed max-[1099px]:inset-y-0 max-[1099px]:right-0 max-[1099px]:z-40 max-[1099px]:shadow-pop`} />
        </div>
      </div>
      <CommandPalette ws={ws} />
      <CaptureDialog ws={ws} />
      <Notice />
      <PictureZoom />
      <Tour />
      {importOpen && <ImportDialog ws={ws} onClose={() => setImportOpen(false)} />}
    </div>
  )
}

/** The DOM node with this id, once the shell has mounted it. */
function useTarget(id: string): HTMLElement | null {
  const [el, setEl] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => { setEl(document.getElementById(id)) }, [id])
  return el
}
/** Render children into the right panel while this page is shown. */
export function PanelSlot({ children }: { children: ReactNode }) {
  const el = useTarget('right-panel')
  const add = useUi((s) => s.addPanelSlot)
  useEffect(() => { add(1); return () => add(-1) }, [add])
  return el ? createPortal(children, el) : null
}
export function TopLeft({ children }: { children: ReactNode }) {
  const el = useTarget('topbar-left')
  return el ? createPortal(children, el) : null
}
export function TopActions({ children }: { children: ReactNode }) {
  const el = useTarget('topbar-actions')
  return el ? createPortal(children, el) : null
}
