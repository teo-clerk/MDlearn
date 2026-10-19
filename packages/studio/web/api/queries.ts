// Server state through TanStack Query: one query key per resource, invalidated by live events.
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { api, qs } from './client'
import type { SessionInfo, WorkspaceSummary, Tree, DocResponse, LessonResponse, BrowseResult, StudyPlan, StudyItem, RecordResponse, SearchHit, Note, NoteAnchor, EnginesInfo, JobSummary, JobEvent, TodayResponse, GoalsInfo, FormulasResponse, GlossaryResponse, LinksResponse, MapResponse, DocSummary, AskStatus, AskEntry, SheetResponse, FileInfo, HistoryEntry, PreviewResponse, ImportResult, Batch, BatchCandidate } from '../../shared/types'
import type { Checked, MdNode, WebAnswer, Outcome } from '@mdlearn/core'

export const keys = {
  session: ['session'] as const,
  workspaces: ['workspaces'] as const,
  tree: (ws: string) => ['tree', ws] as const,
  doc: (ws: string, path: string) => ['doc', ws, path] as const,
  lesson: (ws: string, path: string) => ['lesson', ws, path] as const,
  report: (ws: string) => ['report', ws] as const,
  map: (ws: string, path: string) => ['map', ws, path] as const,
  notes: (ws: string, doc: string) => ['notes', ws, doc] as const,
  engines: ['engines'] as const,
  today: (ws: string) => ['today', ws] as const,
  jobs: (ws: string) => ['jobs', ws] as const,
  job: (ws: string, id: string) => ['job', ws, id] as const,
}
export const useToday = (ws: string) => useQuery({ queryKey: keys.today(ws), queryFn: () => api.get<TodayResponse>(`/api/w/${ws}/today`), staleTime: 15_000 })
export const goalsApi = {
  save: (ws: string, body: { dailyGoal?: number; deadlines?: GoalsInfo['deadlines']; suspended?: [] }) => api.post<GoalsInfo>(`/api/w/${ws}/goals`, body),
  get: (ws: string) => api.get<GoalsInfo>(`/api/w/${ws}/goals`),
  suspend: (ws: string, key: string, suspended: boolean) => api.post<GoalsInfo>(`/api/w/${ws}/cards/suspend`, { key, suspended }),
}
// ---- knowledge: built in the background, so while it builds the lists refresh until it is done
const whileBuilding = (q: { state: { data?: { status: { building: boolean } } } }) => (q.state.data?.status.building ? 1500 : false)
export const useFormulas = (ws: string, q: string, doc: string, limit: number) => useQuery({
  queryKey: ['formulas', ws, q, doc, limit], queryFn: () => api.get<FormulasResponse>(`/api/w/${ws}/formulas?${qs({ q, doc, limit })}`),
  placeholderData: keepPreviousData, refetchInterval: whileBuilding,
})
export const useGlossary = (ws: string, q: string, loose = false) => useQuery({
  queryKey: ['glossary', ws, q, loose], queryFn: () => api.get<GlossaryResponse>(`/api/w/${ws}/glossary?${qs({ q, loose: loose ? 1 : undefined })}`), placeholderData: keepPreviousData, refetchInterval: whileBuilding,
})
/** Terms the reader underlines: one fetch per folder, shared by every document. */
export const useTermHovers = (ws: string, enabled = true) => useQuery({
  queryKey: ['glossary-compact', ws], enabled, staleTime: 60_000, queryFn: () => api.get<GlossaryResponse>(`/api/w/${ws}/glossary?compact=1`), refetchInterval: whileBuilding,
})
export const useLinks = (ws: string, path: string | undefined) => useQuery({
  queryKey: ['links', ws, path], enabled: !!path, queryFn: () => api.get<LinksResponse>(`/api/w/${ws}/links?${qs({ path })}`), staleTime: 15_000,
})
export const useDocSummary = (ws: string, path: string | undefined) => useQuery({
  queryKey: ['doc-summary', ws, path], enabled: !!path, staleTime: 60_000, queryFn: () => api.get<DocSummary>(`/api/w/${ws}/doc/summary?${qs({ path })}`),
})
export const useMapData = (ws: string) => useQuery({ queryKey: ['knowledge-map', ws], queryFn: () => api.get<MapResponse>(`/api/w/${ws}/map`), refetchInterval: whileBuilding })

// ---- ask your whole folder
export const useAskStatus = (ws: string) => useQuery({
  queryKey: ['ask-status', ws], queryFn: () => api.get<AskStatus>(`/api/w/${ws}/ask/status`),
  refetchInterval: (q) => (q.state.data && (q.state.data.pulling || q.state.data.building || q.state.data.reading) ? 1000 : false),
})
export const useAskHistory = (ws: string) => useQuery({ queryKey: ['ask-history', ws], queryFn: () => api.get<AskEntry[]>(`/api/w/${ws}/ask/history`) })
export const askApi = {
  ask: (ws: string, question: string) => api.post<{ id: string; entry: AskEntry }>(`/api/w/${ws}/ask`, { question }),
  setup: (ws: string) => api.post<AskStatus>(`/api/w/${ws}/ask/setup`, {}),
  remove: (ws: string, id: string | null) => api.post<{ ok: true }>(`/api/w/${ws}/ask/delete`, { id }),
  saveNote: (ws: string, id: string, n: number) => api.post<{ doc: string }>(`/api/w/${ws}/ask/note`, { id, n }),
  stop: (ws: string, messageId: string) => api.post<{ stopped: boolean }>(`/api/w/${ws}/ai/cancel`, { messageId }),
}

// ---- cheat sheet
export const useSheet = (ws: string, path: string | undefined) => useQuery({
  queryKey: ['sheet', ws, path], enabled: !!path, queryFn: () => api.get<SheetResponse>(`/api/w/${ws}/sheet?${qs({ path })}`),
  refetchInterval: (q) => (q.state.data?.ideas.state === 'running' ? 1500 : false),
})
export const sheetApi = { ideas: (ws: string, path: string, regenerate = false) => api.post<SheetResponse['ideas']>(`/api/w/${ws}/sheet/ideas`, { path, regenerate }) }

// ---- editor
export const fileApi = {
  get: (ws: string, path: string) => api.get<FileInfo>(`/api/w/${ws}/file?${qs({ path })}`),
  save: (ws: string, body: { path: string; text: string; baseMtime?: number; overwrite?: boolean }) => api.post<{ mtime: number }>(`/api/w/${ws}/files/save`, body),
  create: (ws: string, path: string, text: string) => api.post<{ path: string; mtime: number }>(`/api/w/${ws}/files/create`, { path, text }),
  preview: (ws: string, path: string, text: string) => api.post<PreviewResponse>(`/api/w/${ws}/preview`, { path, text }),
  history: (ws: string, path: string) => api.get<HistoryEntry[]>(`/api/w/${ws}/history?${qs({ path })}`),
  version: (ws: string, path: string, id: string) => api.get<{ text: string }>(`/api/w/${ws}/history/version?${qs({ path, id })}`),
}

// ---- importers
export const importApi = {
  web: (ws: string, url: string) => api.post<ImportResult>(`/api/w/${ws}/import/web`, { url }),
  file: (ws: string, kind: 'pdf-fast' | 'pdf-quality' | 'anki' | 'notebook', file: File, extra: Record<string, string> = {}) => {
    const form = new FormData(); form.set('kind', kind); form.set('file', file); for (const [k, v] of Object.entries(extra)) form.set(k, v)
    return api.upload<ImportResult>(`/api/w/${ws}/import/file`, form)
  },
  folder: () => api.post<{ id: string; name: string; root: string }>('/api/workspaces/imports', {}),
}

// ---- a course for the whole folder
export const useBatchCandidates = (ws: string, enabled = true) => useQuery({ queryKey: ['batch-candidates', ws], enabled, queryFn: () => api.get<BatchCandidate[]>(`/api/w/${ws}/ai/batch/candidates`), staleTime: 10_000 })
export const useBatch = (ws: string, id: string | undefined) => useQuery({
  queryKey: ['batch', ws, id], enabled: !!id, queryFn: () => api.get<Batch>(`/api/w/${ws}/ai/batches/${id}`),
  refetchInterval: (q) => (q.state.data?.status === 'running' ? 1500 : false),
})
export const useBatches = (ws: string) => useQuery({ queryKey: ['batches', ws], queryFn: () => api.get<Batch[]>(`/api/w/${ws}/ai/batches`), refetchInterval: (q) => (q.state.data?.some((b) => b.status === 'running') ? 2000 : false) })
export const batchApi = {
  start: (ws: string, docs: string[], model: string) => api.post<Batch>(`/api/w/${ws}/ai/batches`, { docs, model }),
  stop: (ws: string, id: string) => api.post<Batch>(`/api/w/${ws}/ai/batches/${id}/stop`, {}),
  resume: (ws: string, id: string) => api.post<Batch>(`/api/w/${ws}/ai/batches/${id}/resume`, {}),
}

export type JobDetail = JobSummary & { events: JobEvent[]; prompt: string }
export const useJobs = (ws: string) => useQuery({ queryKey: keys.jobs(ws), queryFn: () => api.get<JobSummary[]>(`/api/w/${ws}/ai/jobs`) })
export const useJob = (ws: string, id: string | undefined) => useQuery({ queryKey: keys.job(ws, id ?? ''), enabled: !!id, queryFn: () => api.get<JobDetail>(`/api/w/${ws}/ai/jobs/${id}`) })
export type JobRequest =
  | { recipe: 'course.create'; doc: string }
  | { recipe: 'lesson.improve'; lesson: string; focus: 'questions' | 'clarity' | 'lint' | 'all' | 'leech'; note?: string; card?: { key: string; title: string; wrong: string[] } }
  | { recipe: 'custom'; request: string; scope?: string }
export const jobsApi = {
  start: (ws: string, req: JobRequest) => api.post<JobSummary>(`/api/w/${ws}/ai/jobs`, req),
  cancel: (ws: string, id: string) => api.post<{ stopped: boolean }>(`/api/w/${ws}/ai/jobs/${id}/cancel`, {}),
  undo: (ws: string, id: string) => api.post<{ restored: string[]; removed: string[]; skipped: string[] }>(`/api/w/${ws}/ai/jobs/${id}/undo`, {}),
  followup: (ws: string, id: string, request: string) => api.post<JobSummary>(`/api/w/${ws}/ai/jobs/${id}/followup`, { request }),
}
export const useNotes = (ws: string, doc: string | undefined) => useQuery({
  queryKey: keys.notes(ws, doc ?? ''), enabled: !!doc, queryFn: () => api.get<Note[]>(`/api/w/${ws}/notes?${qs({ path: doc })}`),
})
export const useEngines = () => useQuery({ queryKey: keys.engines, queryFn: () => api.get<EnginesInfo>('/api/engines'), staleTime: 30_000, refetchInterval: 60_000 })
export const notesApi = {
  create: (ws: string, doc: string, anchor: NoteAnchor, body: string) => api.post<Note>(`/api/w/${ws}/notes`, { doc, anchor, body }),
  update: (ws: string, doc: string, id: string, body: string) => api.post<Note>(`/api/w/${ws}/notes/${id}/update`, { doc, body }),
  remove: (ws: string, doc: string, id: string) => api.post<{ ok: true }>(`/api/w/${ws}/notes/${id}/delete`, { doc }),
  ask: (ws: string, body: { doc: string; anchor: NoteAnchor; question?: string; mode: 'ask' | 'explain'; noteId?: string }) => api.post<{ note: Note; messageId: string }>(`/api/w/${ws}/ai/ask`, body),
  cancel: (ws: string, messageId: string) => api.post<{ stopped: boolean }>(`/api/w/${ws}/ai/cancel`, { messageId }),
  passage: (ws: string, doc: string, quote: string) => api.get<Passage>(`/api/w/${ws}/doc/passage?${qs({ path: doc, quote })}`),
  addCard: (ws: string, body: { doc: string; section: { num: string | null; anchor: string } | null; card: { kind: 'cloze'; text: string; title?: string } | { kind: 'qa'; question: string; answer: string; title?: string } }) => api.post<{ path: string; cardKey: string; created: boolean }>(`/api/w/${ws}/cards`, body),
  visualise: (ws: string, doc: string, anchor: NoteAnchor, kind: 'auto' | 'plot' | 'formula' | 'animate') => api.post<VisualDraft>(`/api/w/${ws}/ai/visualise`, { doc, anchor, kind }),
  insert: (ws: string, path: string, quote: string, text: string, baseMtime: number) => api.post<{ line: number }>(`/api/w/${ws}/files/insert`, { path, quote, text, baseMtime }),
}
export interface VisualDraft { markdown: string; block: import('@mdlearn/core').Visual | null; diagnostics: import('@mdlearn/core').Diagnostic[]; attempts: number; kind: string }
export const useSession = () => useQuery({ queryKey: keys.session, queryFn: () => api.get<SessionInfo>('/api/session'), staleTime: Infinity })
export const useWorkspaces = () => useQuery({ queryKey: keys.workspaces, queryFn: () => api.get<WorkspaceSummary[]>('/api/workspaces') })
export const useTree = (ws: string) => useQuery({ queryKey: keys.tree(ws), queryFn: () => api.get<Tree>(`/api/w/${ws}/tree`), staleTime: 30_000 })
export const useDoc = (ws: string, path: string | undefined) => useQuery({
  queryKey: keys.doc(ws, path ?? ''), enabled: !!path, staleTime: Infinity,
  queryFn: () => api.get<DocResponse>(`/api/w/${ws}/doc?${qs({ path })}`),
})
export const useLesson = (ws: string, path: string | undefined) => useQuery({
  queryKey: keys.lesson(ws, path ?? ''), enabled: !!path, staleTime: Infinity,
  queryFn: () => api.get<LessonResponse>(`/api/w/${ws}/lesson?${qs({ path })}`),
})
export const useReport = (ws: string) => useQuery({ queryKey: keys.report(ws), queryFn: () => api.get<ReportResponse>(`/api/w/${ws}/study/report`) })
export const useSectionMap = (ws: string, path: string | undefined) => useQuery({
  queryKey: keys.map(ws, path ?? ''), enabled: !!path,
  queryFn: () => api.get<SectionMemory[]>(`/api/w/${ws}/study/map?${qs({ path })}`),
})
export const browseFolders = (path?: string) => api.get<BrowseResult>(`/api/fs/browse?${qs({ path })}`)
export const search = (ws: string, q: string) => api.get<SearchHit[]>(`/api/w/${ws}/search?${qs({ q })}`)
export function useOpenFolder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (path: string) => api.post<{ id: string; name: string }>('/api/workspaces/open', { path }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.workspaces }),
  })
}
export function useUpload() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (form: FormData) => api.upload<{ id: string; name: string; files: number; skipped: number }>('/api/workspaces/upload', form),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.workspaces }),
  })
}
// study (not cached: each call is one step of a session)
export const studyApi = {
  plan: (ws: string, o: { scope?: string; doc?: string; limit?: number; newCards?: number; due?: boolean }) =>
    api.get<StudyPlan>(`/api/w/${ws}/study/queue?${qs({ ...o, due: o.due ? 1 : undefined })}`),
  item: (ws: string, widget: string) => api.get<StudyItem>(`/api/w/${ws}/study/item?${qs({ widget })}`),
  check: (ws: string, body: { widgetId: string; answer: WebAnswer; sure?: boolean; practice?: boolean }) => api.post<{ checked: Checked }>(`/api/w/${ws}/study/check`, body),
  hint: (ws: string, widgetId: string, n: number) => api.post<{ hint: MdNode[] | null }>(`/api/w/${ws}/study/hint`, { widgetId, n }),
  record: (ws: string, cardKey: string, outcome: Outcome) => api.post<RecordResponse>(`/api/w/${ws}/study/record`, { cardKey, outcome }),
  judge: (ws: string, widgetId: string, text: string) => api.post<JudgeResult>(`/api/w/${ws}/study/judge`, { widgetId, text }),
}
export interface SectionMemory { num: string | null; anchor: string; title: string; depth: number; cards: number; seen: number; due: number; memory: number | null }
export interface ReportResponse {
  lessons: { lessonId: string; title: string; cards: number; seen: number; due: number; predictedRecall: number | null; path: string }[]
  totals: { cards: number; seen: number; due: number; reviews: number }
  accuracy: { today: { answered: number; correct: number }; last7Days: { answered: number; correct: number } }
  nextDue: string | null; nextDueText: string | null; streak: number
}
export interface JudgeResult { ideas: { index: number; verdict: 'covered' | 'partly' | 'missing'; evidence?: string }[]; feedback: string }
export interface Passage { text: string; startLine: number; endLine: number; section: { num: string | null; anchor: string; title: string } | null }
