// Study offline (a phone on the local network, no certificate): take a pack of the next days' cards, study it
// with no connection (the page must stay open: without https the browser cannot reopen it offline), and the
// answers go back to the computer when it is reachable again. Outside the main layout, so nothing on screen
// waits for the network.
import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Link, useLocation, useParams } from 'wouter'
import { CloudOff, RefreshCw, Wifi } from 'lucide-react'
import { api } from '../api/client'
import { Button, Spinner } from '../ui/primitives'
import type { OfflinePack, SyncResult } from '../../shared/types'
import { NOTHING, answered, queueNow, type Pending } from './engine'
import { addPending, latestPackWs, loadOffline, markSynced, removePack, savePack } from './store'
import { OfflineCard, type Result } from './OfflineCard'
import { t, tp, locale } from '../i18n'
import { whenText } from '../lib/when'

const DAYS = [1, 3, 7]
const online = () => navigator.onLine
const onOnline = (cb: () => void) => { window.addEventListener('online', cb); window.addEventListener('offline', cb); return () => { window.removeEventListener('online', cb); window.removeEventListener('offline', cb) } }
type Sync = { state: 'idle' } | { state: 'busy' } | { state: 'done'; at: number } | { state: 'failed'; message: string }

/** /offline (the home-screen icon): the folder of the latest pack on this device. */
export function OfflineHome() {
  const [, navigate] = useLocation()
  const [none, setNone] = useState(false)
  useEffect(() => { void latestPackWs().then((ws) => (ws ? navigate(`/offline/${ws}`, { replace: true }) : setNone(true))).catch(() => setNone(true)) }, [navigate])
  if (!none) return <div className="p-10"><Spinner /></div>
  return <Frame><p className="mt-6 text-[14.5px]">{t('No cards are kept on this device yet.')} <Link href="/" className="underline underline-offset-2">{t('Open a folder')}</Link>{t(', then choose Study offline.')}</p></Frame>
}

export default function OfflinePage() {
  const { ws } = useParams<{ ws: string }>()
  const isOnline = useSyncExternalStore(onOnline, online, () => true)
  const [loaded, setLoaded] = useState<{ pack: OfflinePack | null; pending: Pending } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sync, setSync] = useState<Sync>({ state: 'idle' })
  const [days, setDays] = useState(3)
  const [taking, setTaking] = useState(false)
  const [current, setCurrent] = useState<{ key: string; rated: { rating: 1 | 2 | 3; next: string | null } | null } | null>(null)
  const [now, setNow] = useState(() => Date.now())
  // one card on screen per round: a card that comes back later starts from a clean slate
  const [round, setRound] = useState(0)
  useEffect(() => { document.title = t('Study offline · MDlearn') }, [])
  useEffect(() => { void loadOffline(ws).then(setLoaded).catch((e: Error) => setError(e.message)) }, [ws])
  // cards answered "again" come back after a few minutes: look again every half minute
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(id) }, [])

  const pushAnswers = useCallback(async () => {
    const p = loaded?.pending
    if (!p || (!p.reviews.length && !p.attempts.length) || sync.state === 'busy') return
    setSync({ state: 'busy' })
    try {
      await api.post<SyncResult>(`/api/w/${ws}/study/sync`, p)
      setLoaded(await markSynced(ws, p))
      setSync({ state: 'done', at: Date.now() })
    } catch (e) { setSync({ state: 'failed', message: (e as Error).message }) }
  }, [loaded?.pending, sync.state, ws])
  // on opening and when back in reach: send what is waiting (also answers left from an earlier visit)
  const ready = !!loaded
  useEffect(() => { if (isOnline && loaded?.pending.reviews.length) void pushAnswers() }, [isOnline, ready]) // eslint-disable-line react-hooks/exhaustive-deps

  const take = async () => {
    setTaking(true); setError(null)
    try {
      if (loaded?.pending.reviews.length) await pushAnswers()
      const pack = await api.get<OfflinePack>(`/api/w/${ws}/study/pack?days=${days}`)
      await savePack(pack)
      setLoaded((l) => ({ pack, pending: l?.pending ?? NOTHING }))
      setCurrent(null)
      // the parts of a card that load on demand, fetched now while the network is here
      void import('../prose/CodeBlock').catch(() => {}); void import('../prose/Mermaid').catch(() => {})
    } catch (e) { setError((e as Error).message) } finally { setTaking(false) }
  }
  const forget = async () => { await removePack(ws); setLoaded((l) => ({ pack: null, pending: l?.pending ?? NOTHING })); setCurrent(null) }

  if (error && !loaded) return <Frame><p className="mt-6 text-bad" role="alert">{error}</p></Frame>
  if (!loaded) return <div className="p-10"><Spinner /></div>
  const { pack, pending } = loaded
  const waiting = pending.reviews.length
  const q = pack ? queueNow(pack, pending, now) : null
  const card = pack && q ? (current ? pack.cards.find((c) => c.cardKey === current.key) : q.cards[0]) : undefined
  const onAnswered = async (r: Result) => {
    if (!pack || !card) return
    const a = answered(pack, pending, card, r)
    setCurrent({ key: card.cardKey, rated: { rating: a.rating, next: a.next } })
    try { setLoaded({ pack, pending: await addPending(ws, a.add) }) } catch (e) { setError((e as Error).message) }
  }
  const next = () => { setCurrent(null); setRound((r) => r + 1); setNow(Date.now()); if (isOnline) void pushAnswers() }

  return (
    <Frame status={<Status online={isOnline} waiting={waiting} sync={sync} onSync={() => void pushAnswers()} />}>
      {!pack ? (
        <section className="mt-6" aria-labelledby="off-title">
          <h1 id="off-title" className="text-[22px] font-semibold tracking-[-0.015em]">{t('Study offline')}</h1>
          <p className="mt-1.5 text-[14.5px] text-muted">{t('This device keeps the cards due in the next days, with their answers, and marks them itself. When it can reach the computer again, your answers join your progress there.')}</p>
          <p id="off-days" className="mt-5 text-[12.5px] text-muted">{t('Cards for')}</p>
          <div role="radiogroup" aria-labelledby="off-days" className="mt-1.5 flex gap-1.5">
            {DAYS.map((d) => <button key={d} type="button" role="radio" aria-checked={days === d} onClick={() => setDays(d)}
              className={`inline-flex h-9 min-w-[4.5rem] items-center justify-center rounded-[6px] border px-3 text-[13.5px] cursor-pointer ${days === d ? 'border-accent bg-accent-soft font-medium' : 'border-border hover:bg-hover'}`}>{tp(d, '{n} day', '{n} days')}</button>)}
          </div>
          <Button className="mt-4" variant="primary" icon={CloudOff} busy={taking} disabled={!isOnline} onClick={() => void take()}>{t('Take offline')}</Button>
          {error && <p className="mt-2 text-[13px] text-bad" role="alert">{error}</p>}
          <ul className="mt-6 flex flex-col gap-1.5 text-[13px] text-muted">
            <li>{t('Keep this page open while you are offline: without a secure (https) connection the browser cannot reopen it with no network.')}</li>
            <li>{t('Add it to your home screen (browser menu → Add to Home screen) to come back with one tap when you are connected.')}</li>
            <li>{t('The answers are on this device, so anyone using it can see them.')}</li>
          </ul>
        </section>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h1 className="text-[15px] font-semibold">{q!.cards.length ? tp(q!.cards.length, '{n} card now', '{n} cards now') : t('Done for now')}</h1>
            <p className="tabular text-[12.5px] text-muted">{t('Pack of {date} · {days}', { date: new Date(pack.createdAt).toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' }), days: tp(pack.days, '{n} day', '{n} days') })}</p>
          </div>
          {card ? (
            <OfflineCard key={`${card.cardKey}-${round}`} pack={pack} card={card} rated={current?.rated ?? null} onAnswered={(r) => void onAnswered(r)} onNext={next} />
          ) : (
            <p className="mt-6 text-[14.5px]">{q!.nextDue ? t('Nothing is due. The next card comes back {when}.', { when: whenText(new Date(q!.nextDue).toISOString()) }) : q!.left ? t('That is all for today. More new cards tomorrow.') : t('You have done the whole pack.')}</p>
          )}
          <div className="mt-8 flex flex-wrap items-center gap-2 border-t border-border pt-4">
            <Button size="sm" variant="secondary" icon={RefreshCw} busy={taking} disabled={!isOnline} onClick={() => void take()}>{t('Refresh the pack')}</Button>
            <Button size="sm" variant="ghost" disabled={waiting > 0} title={waiting ? t('Sync your answers first') : undefined} onClick={() => void forget()}>{t('Remove from this device')}</Button>
            {error && <p className="w-full text-[13px] text-bad" role="alert">{error}</p>}
          </div>
        </>
      )}
    </Frame>
  )
}

function Frame({ children, status }: { children: ReactNode; status?: ReactNode }) {
  return (
    <div className="h-full overflow-y-auto bg-bg">
      <div className="mx-auto max-w-[640px] px-4 pb-16 pt-3 sm:px-6">
        <header className="flex items-center gap-2 border-b border-border pb-2.5 text-[13px]">
          <span className="font-semibold">MDlearn</span><span className="text-muted">· {t('Offline')}</span>
          <span className="ml-auto">{status}</span>
        </header>
        {children}
      </div>
    </div>
  )
}

function Status({ online: on, waiting, sync, onSync }: { online: boolean; waiting: number; sync: Sync; onSync: () => void }) {
  const text = sync.state === 'busy' ? t('Syncing…')
    : waiting ? (sync.state === 'failed' ? tp(waiting, '{n} answer kept here: the computer cannot be reached', '{n} answers kept here: the computer cannot be reached') : tp(waiting, '{n} answer to sync', '{n} answers to sync'))
    : sync.state === 'done' ? t('Synced') : on ? t('Online') : t('No connection')
  return (
    <span className="flex items-center gap-1.5 text-[12.5px] text-muted" role="status">
      {on ? <Wifi className="size-3.5" aria-hidden /> : <CloudOff className="size-3.5" aria-hidden />}
      {text}
      {waiting > 0 && on && sync.state !== 'busy' && <button type="button" onClick={onSync} className="underline underline-offset-2 hover:text-text cursor-pointer">{t('Sync now')}</button>}
    </span>
  )
}
