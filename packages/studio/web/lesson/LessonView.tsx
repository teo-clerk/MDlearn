// A lesson page: its cards in order, each question tryable in place (practice: not scheduled).
// Studying with spaced repetition happens in Study; this is for reading a lesson through.
import { useEffect, useMemo } from 'react'
import { useLocation, useSearch } from 'wouter'
import { BookOpenCheck, GraduationCap, Pencil, Sparkles, TriangleAlert } from 'lucide-react'
import type { Checked, WebAnswer } from '@mdlearn/core'
import { api } from '../api/client'
import { useLesson, useSession, useTree } from '../api/queries'
import { assetUrl, linkTarget } from '../lib/paths'
import type { BlockEnv } from '../reader/DocBlocks'
import { LessonArticle } from './LessonArticle'
import { PanelSlot, TopActions, TopLeft } from '../layout/Shell'
import { Button, Empty, ErrorNote, Spinner } from '../ui/primitives'

export default function LessonView({ ws }: { ws: string }) {
  const path = new URLSearchParams(useSearch()).get('path') ?? undefined
  const lesson = useLesson(ws, path)
  const tree = useTree(ws)
  const [, navigate] = useLocation()
  const session = useSession()
  const source = tree.data?.docs.find((d) => d.lessons.some((l) => l.path === path))
  useEffect(() => { if (lesson.data?.lesson) document.title = `${lesson.data.lesson.title} · MDlearn Studio` }, [lesson.data])
  const env = useMemo<BlockEnv | null>(() => !path ? null : ({
    cx: { linkTo: (url) => linkTarget(ws, path, url), imageSrc: (url) => assetUrl(ws, path, url), runPython: true },
    // practice through the study API (practice: true is never logged or scheduled)
    check: async (widgetId: string, answer: WebAnswer) => (await api.post<{ checked: Checked }>(`/api/w/${ws}/study/check`, { widgetId, answer, practice: true })).checked,
  }), [ws, path])
  if (!path) return <Empty icon={GraduationCap} title="No lesson selected" />
  if (lesson.isLoading) return <div className="p-10"><Spinner label="Opening lesson" /></div>
  if (lesson.error) return <ErrorNote error={lesson.error} retry={() => lesson.refetch()} />
  const l = lesson.data!.lesson
  const errors = lesson.data!.diagnostics.filter((d) => d.code.startsWith('E'))
  const warnings = lesson.data!.diagnostics.filter((d) => d.code.startsWith('W'))
  return (
    <>
      <TopLeft><span className="truncate px-1 text-[13px] text-muted">{l?.title ?? path}</span></TopLeft>
      <TopActions>
        {session.data?.caps.includes('write') && path && <Button size="sm" variant="ghost" icon={Pencil} onClick={() => navigate(`/w/${ws}/edit?path=${encodeURIComponent(path)}`)}>Edit</Button>}
        {session.data?.caps.includes('ai') && path && <Button size="sm" variant="ghost" icon={Sparkles} onClick={() => navigate(`/w/${ws}/studio?kind=improve&lesson=${encodeURIComponent(path)}`)}>Improve with AI</Button>}
        {l && <Button size="sm" variant="ghost" icon={BookOpenCheck} onClick={() => navigate(`/w/${ws}/study?scope=${encodeURIComponent(l.id)}`)}>Study this lesson</Button>}
      </TopActions>
      {(errors.length > 0 || warnings.length > 0) && (
        <PanelSlot>
          <div className="flex h-11 shrink-0 items-center px-4 text-[12.5px] font-medium text-muted">Checks</div>
          <ul className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 text-[12.5px]">
            {[...errors, ...warnings].map((d, i) => (
              <li key={i} className="border-t border-border py-2"><span className={`font-mono ${d.code.startsWith('E') ? 'text-bad' : 'text-warn'}`}>{d.code}</span> <span className="text-muted">line {d.line}</span>{d.message && <p className="mt-0.5 text-text/85">{d.message}</p>}</li>
            ))}
          </ul>
        </PanelSlot>
      )}
      {!l ? (
        <Empty icon={TriangleAlert} title="This lesson cannot be shown">{errors.map((d) => `${d.code} (line ${d.line}) ${d.message ?? ''}`).join('; ')}</Empty>
      ) : (
        env && <LessonArticle ws={ws} lesson={l} source={source ? { path: source.path, title: source.title } : undefined} env={env} />
      )}
    </>
  )
}
