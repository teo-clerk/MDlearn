// Left sidebar: folder switcher, search, study entry with today's count, the document tree, theme.
import { useMemo, useState } from 'react'
import { Link, useLocation } from 'wouter'
import { BookA, BookOpenCheck, FilePlus, FileInput, ChartNoAxesColumn, ChevronsUpDown, FolderOpen, House, MessageSquareText, Monitor, Moon, Network, PanelLeftClose, Search, Sigma, Sparkles, Sun, Loader2 } from 'lucide-react'
import { useJobs, useSession, useTree, useWorkspaces } from '../api/queries'
import { useUi, type Theme } from '../state/ui'
import { FileTree } from './FileTree'
import { IconButton, Kbd } from '../ui/primitives'
import { NewNote } from '../editor/NewNote'

export function Sidebar({ ws }: { ws: string }) {
  const { sidebar, toggleSidebar, setPalette, setImportOpen } = useUi()
  const tree = useTree(ws)
  const [location] = useLocation()
  const due = tree.data?.totals.due ?? 0
  const session = useSession()
  const canAi = !!session.data?.caps.includes('ai')
  const canWrite = !!session.data?.caps.includes('write')
  const [newNote, setNewNote] = useState(false)
  const jobs = useJobs(ws)
  const running = jobs.data?.some((j) => j.status === 'running' || j.status === 'queued')
  const narrow = () => { if (!window.matchMedia('(min-width: 900px)').matches) toggleSidebar(false) }
  return (
    <nav aria-label="Folder" onClick={(e) => { if ((e.target as HTMLElement).closest('a')) narrow() }}
      className={`${sidebar ? 'flex' : 'hidden'} print:hidden w-[264px] shrink-0 flex-col border-r border-border bg-sidebar max-[899px]:fixed max-[899px]:inset-y-0 max-[899px]:left-0 max-[899px]:z-40 max-[899px]:shadow-pop`}>
      <div className="flex h-11 items-center gap-1 px-2">
        <FolderSwitcher ws={ws} name={tree.data?.name} />
        <IconButton icon={PanelLeftClose} label="Hide sidebar (Ctrl+\)" onClick={() => toggleSidebar(false)} />
      </div>
      <div className="flex flex-col gap-px px-2 pb-2">
        <button onClick={() => setPalette(true)} className="flex h-8 items-center gap-2 rounded-[6px] px-2 text-[13.5px] text-muted hover:bg-hover cursor-pointer">
          <Search className="size-4" strokeWidth={1.8} aria-hidden /><span className="flex-1 text-left">Search</span><Kbd>Ctrl K</Kbd>
        </button>
        <NavItem href={`/w/${ws}`} icon={House} active={location === `/w/${ws}` || location === `/w/${ws}/`}>Today</NavItem>
        <NavItem href={`/w/${ws}/study`} icon={BookOpenCheck} active={location.startsWith(`/w/${ws}/study`)}
          badge={due ? <span className="tabular rounded-full bg-active px-1.5 text-[11.5px] font-medium text-text" title={`${due} cards due`}>{due}</span> : null}>Study</NavItem>
        <NavItem href={`/w/${ws}/ask`} icon={MessageSquareText} active={location.startsWith(`/w/${ws}/ask`)}>Ask</NavItem>
        <NavItem href={`/w/${ws}/progress`} icon={ChartNoAxesColumn} active={location.startsWith(`/w/${ws}/progress`)}>Progress</NavItem>
        {canAi && <NavItem href={`/w/${ws}/studio`} icon={Sparkles} active={location.startsWith(`/w/${ws}/studio`)} badge={running ? <Loader2 className="size-3.5 animate-spin text-muted" aria-label="A job is running" /> : null}>AI Studio</NavItem>}
      </div>
      <div className="flex flex-col gap-px px-2 pb-2" role="group" aria-label="Library">
        <NavItem href={`/w/${ws}/formulas`} icon={Sigma} active={location.startsWith(`/w/${ws}/formulas`)}>Formulas</NavItem>
        <NavItem href={`/w/${ws}/glossary`} icon={BookA} active={location.startsWith(`/w/${ws}/glossary`)}>Glossary</NavItem>
        <NavItem href={`/w/${ws}/map`} icon={Network} active={location.startsWith(`/w/${ws}/map`)}>Map</NavItem>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto border-t border-border px-2 pb-3 pt-2">
        {canWrite && (
          <button onClick={() => setNewNote(true)} className="mb-1 flex h-8 w-full items-center gap-2 rounded-[6px] px-2 text-[13.5px] text-muted hover:bg-hover hover:text-text cursor-pointer">
            <FilePlus className="size-4" strokeWidth={1.8} aria-hidden />New note
          </button>
        )}
        {canWrite && (
          <button onClick={() => setImportOpen(true)} className="mb-1 flex h-8 w-full items-center gap-2 rounded-[6px] px-2 text-[13.5px] text-muted hover:bg-hover hover:text-text cursor-pointer">
            <FileInput className="size-4" strokeWidth={1.8} aria-hidden />Import…
          </button>
        )}
        <FileTree ws={ws} tree={tree.data} loading={tree.isLoading} error={tree.error} />
      </div>
      {newNote && <NewNote ws={ws} folder="" onClose={() => setNewNote(false)} />}
      <div className="flex items-center gap-1 border-t border-border px-2 py-1.5">
        <ThemeSwitch />
      </div>
    </nav>
  )
}

function NavItem({ href, icon: Icon, active, badge, children }: { href: string; icon: typeof House; active: boolean; badge?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link href={href} aria-current={active ? 'page' : undefined}
      className={`flex h-8 items-center gap-2 rounded-[6px] px-2 text-[13.5px] ${active ? 'bg-active font-medium text-text' : 'text-text/85 hover:bg-hover'}`}>
      <Icon className="size-4 text-muted" strokeWidth={1.8} aria-hidden /><span className="flex-1">{children}</span>{badge}
    </Link>
  )
}

function FolderSwitcher({ ws, name }: { ws: string; name?: string }) {
  const [open, setOpen] = useState(false)
  const recents = useWorkspaces()
  const [, navigate] = useLocation()
  const others = useMemo(() => (recents.data ?? []).filter((w) => w.id !== ws).slice(0, 8), [recents.data, ws])
  return (
    <div className="relative min-w-0 flex-1">
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}
        className="flex h-8 w-full min-w-0 items-center gap-2 rounded-[6px] px-2 text-left hover:bg-hover cursor-pointer">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-[5px] border border-border-strong bg-raised text-[11px] font-semibold text-muted" aria-hidden>{(name ?? '?').slice(0, 1).toUpperCase()}</span>
        <span className="truncate text-[13.5px] font-semibold">{name ?? 'Loading…'}</span>
        <ChevronsUpDown className="ml-auto size-3.5 shrink-0 text-subtle" aria-hidden />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div role="menu" className="absolute left-0 top-9 z-50 w-64 rounded-[8px] border border-border bg-raised p-1 shadow-pop">
            <p className="px-2 pb-1 pt-1.5 text-[11.5px] font-medium text-muted">Recent folders</p>
            {others.length === 0 && <p className="px-2 py-1.5 text-[13px] text-muted">No other folders yet.</p>}
            {others.map((w) => (
              <button key={w.id} role="menuitem" onClick={() => { setOpen(false); navigate(`/w/${w.id}`) }}
                className="flex w-full items-center gap-2 rounded-[5px] px-2 py-1.5 text-left text-[13.5px] hover:bg-hover cursor-pointer">
                <span className="truncate">{w.name}</span><span className="ml-auto shrink-0 tabular text-[12px] text-subtle">{w.docs} docs</span>
              </button>
            ))}
            <div className="my-1 border-t border-border" />
            <button role="menuitem" onClick={() => { setOpen(false); navigate('/') }} className="flex w-full items-center gap-2 rounded-[5px] px-2 py-1.5 text-left text-[13.5px] hover:bg-hover cursor-pointer">
              <FolderOpen className="size-4 text-muted" strokeWidth={1.8} aria-hidden />Open or upload a folder…
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function ThemeSwitch() {
  const { theme, setTheme } = useUi()
  const opts: { t: Theme; icon: typeof Sun; label: string }[] = [{ t: 'light', icon: Sun, label: 'Light' }, { t: 'dark', icon: Moon, label: 'Dark' }, { t: 'system', icon: Monitor, label: 'Match system' }]
  return (
    <div role="radiogroup" aria-label="Theme" className="flex items-center gap-0.5">
      {opts.map(({ t, icon, label }) => (
        <IconButton key={t} icon={icon} label={`Theme: ${label}`} active={theme === t} role="radio" aria-checked={theme === t} onClick={() => setTheme(t)} />
      ))}
    </div>
  )
}
