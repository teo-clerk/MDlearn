// AI answers as they stream in (message id → text so far), until the note on disk has the final text.
import { create } from 'zustand'
interface StreamState { text: Record<string, string>; done: Record<string, boolean>; append(id: string, t: string): void; finish(id: string): void }
export const useStream = create<StreamState>((set) => ({
  text: {}, done: {},
  append: (id, t) => set((s) => ({ text: { ...s.text, [id]: (s.text[id] ?? '') + t } })),
  finish: (id) => set((s) => ({ done: { ...s.done, [id]: true } })),
}))
