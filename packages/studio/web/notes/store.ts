// Which note is active, and the note being written (not saved yet).
import { create } from 'zustand'
import type { NoteAnchor } from '../../shared/types'

export interface DraftNote { anchor: NoteAnchor; mode: 'note' | 'ask' | 'visual' | 'card' }
interface NotesUi { active: string | null; draft: DraftNote | null; setActive(id: string | null): void; setDraft(d: DraftNote | null): void }
export const useNotesUi = create<NotesUi>((set) => ({
  active: null, draft: null,
  setActive: (active) => set({ active }),
  setDraft: (draft) => set({ draft, active: draft ? 'draft' : null }),
}))
