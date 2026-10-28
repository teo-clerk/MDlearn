// The pack and the answers not yet synced, kept in this browser (IndexedDB), so closing the tab offline loses
// nothing. One pack per folder; a sync moves the answers into the pack's history in one transaction.
import { mergeLogs } from '@mdlearn/core'
import type { OfflinePack } from '../../shared/types'
import { NOTHING, type Pending } from './engine'

const DB = 'mdlearn-offline'
const PACKS = 'packs', PENDING = 'pending'
let db: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  db ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(PACKS, { keyPath: 'ws' })
      req.result.createObjectStore(PENDING, { keyPath: 'ws' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => { db = null; reject(req.error ?? new Error('This browser cannot keep data offline.')) }
  })
  return db
}
const done = (tx: IDBTransaction) => new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('Could not save on this device.')) })
const read = <T>(req: IDBRequest) => new Promise<T>((resolve, reject) => { req.onsuccess = () => resolve(req.result as T); req.onerror = () => reject(req.error) })
type PendingRow = Pending & { ws: string }

export async function loadOffline(ws: string): Promise<{ pack: OfflinePack | null; pending: Pending }> {
  const tx = (await open()).transaction([PACKS, PENDING], 'readonly')
  const [pack, pending] = await Promise.all([read<OfflinePack | undefined>(tx.objectStore(PACKS).get(ws)), read<PendingRow | undefined>(tx.objectStore(PENDING).get(ws))])
  return { pack: pack ?? null, pending: pending ? { reviews: pending.reviews, attempts: pending.attempts } : NOTHING }
}
/** The folder of the most recent pack on this device (the home-screen icon opens it). */
export async function latestPackWs(): Promise<string | null> {
  const packs = await read<OfflinePack[]>((await open()).transaction(PACKS, 'readonly').objectStore(PACKS).getAll())
  return packs.sort((a, b) => b.createdAt - a.createdAt)[0]?.ws ?? null
}
export async function savePack(pack: OfflinePack): Promise<void> {
  const tx = (await open()).transaction(PACKS, 'readwrite')
  tx.objectStore(PACKS).put(pack)
  await done(tx)
}
export async function removePack(ws: string): Promise<void> {
  const tx = (await open()).transaction(PACKS, 'readwrite')
  tx.objectStore(PACKS).delete(ws)
  await done(tx)
}
/** Keep new answers (read and written in one transaction, so two quick answers never overwrite each other). */
export async function addPending(ws: string, add: Pending): Promise<Pending> {
  const tx = (await open()).transaction(PENDING, 'readwrite')
  const store = tx.objectStore(PENDING)
  const row = (await read<PendingRow | undefined>(store.get(ws))) ?? { ws, ...NOTHING }
  const next: PendingRow = { ws, reviews: [...row.reviews, ...add.reviews], attempts: [...row.attempts, ...add.attempts] }
  store.put(next)
  await done(tx)
  return { reviews: next.reviews, attempts: next.attempts }
}
/** After a sync: what was sent leaves the queue and joins the pack's history. */
export async function markSynced(ws: string, sent: Pending): Promise<{ pack: OfflinePack | null; pending: Pending }> {
  const tx = (await open()).transaction([PACKS, PENDING], 'readwrite')
  const packs = tx.objectStore(PACKS), queue = tx.objectStore(PENDING)
  const [pack, row] = await Promise.all([read<OfflinePack | undefined>(packs.get(ws)), read<PendingRow | undefined>(queue.get(ws))])
  const ids = new Set([...sent.reviews, ...sent.attempts].map((e) => e.id))
  const left: Pending = { reviews: (row?.reviews ?? []).filter((r) => !ids.has(r.id)), attempts: (row?.attempts ?? []).filter((a) => !ids.has(a.id)) }
  queue.put({ ws, ...left })
  const merged = pack ? { ...pack, reviews: mergeLogs(pack.reviews, sent.reviews) } : null
  if (merged) packs.put(merged)
  await done(tx)
  return { pack: merged, pending: left }
}
