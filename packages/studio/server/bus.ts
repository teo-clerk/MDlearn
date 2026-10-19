// Server → browser events. Each event gets a sequence id; a ring buffer lets a reconnecting tab replay
// what it missed (Last-Event-ID), or tells it to resync when the gap is too old.
import type { ServerEvent } from '../shared/types.js'

export interface Envelope { id: number; event: ServerEvent }
export class EventBus {
  private seq = 0
  private ring: Envelope[] = []
  private subs = new Set<(e: Envelope) => void>()
  constructor(private size = 500) {}
  publish(event: ServerEvent): void {
    const e = { id: ++this.seq, event }
    this.ring.push(e)
    if (this.ring.length > this.size) this.ring.shift()
    for (const s of this.subs) s(e)
  }
  subscribe(fn: (e: Envelope) => void): () => void { this.subs.add(fn); return () => this.subs.delete(fn) }
  /** Events after `lastId`, or null when some of them have already left the buffer. */
  since(lastId: number): Envelope[] | null {
    if (lastId >= this.seq) return []
    const first = this.ring[0]?.id ?? this.seq + 1
    return lastId + 1 < first ? null : this.ring.filter((e) => e.id > lastId)
  }
}
