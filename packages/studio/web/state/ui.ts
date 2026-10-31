// UI state that is not server data: theme, panels, the text currently selected in a document.
import { create } from 'zustand'

export type Theme = 'system' | 'light' | 'dark'
export type PanelTab = 'outline' | 'notes' | 'links' | 'related'
interface UiState {
  theme: Theme
  sidebar: boolean
  panel: boolean
  panelTab: PanelTab
  captureOpen: boolean
  setCaptureOpen(open: boolean): void
  notice: string | null
  notify(text: string | null): void
  palette: boolean
  /** The import dialog (web page, PDF, Anki deck, notebook). */
  importOpen: boolean
  setImportOpen(open: boolean): void
  /** Underline defined terms in documents (hover for the definition). */
  termHints: boolean
  setTermHints(on: boolean): void
  /** Pages currently providing side-panel content. */
  panelSlots: number
  addPanelSlot(delta: 1 | -1): void
  setTheme(t: Theme): void
  toggleSidebar(open?: boolean): void
  togglePanel(open?: boolean): void
  setPanelTab(t: PanelTab): void
  setPalette(open: boolean): void
  /** The welcome tour, open now (first run, or replayed from Help). */
  tour: boolean
  setTour(open: boolean): void
}
const saved = (): Theme => { try { const t = localStorage.getItem('mdl-theme'); return t === 'light' || t === 'dark' ? t : 'system' } catch { return 'system' } }
const wide = () => typeof window === 'undefined' || window.matchMedia('(min-width: 1100px)').matches

export const useUi = create<UiState>((set) => ({
  theme: saved(),
  sidebar: typeof window === 'undefined' || window.matchMedia('(min-width: 900px)').matches,
  panel: wide(),
  panelTab: 'outline',
  captureOpen: false,
  setCaptureOpen: (captureOpen) => set({ captureOpen }),
  notice: null,
  notify: (notice) => set({ notice }),
  palette: false,
  tour: false,
  setTour: (tour) => set({ tour }),
  importOpen: false,
  setImportOpen: (importOpen) => set({ importOpen }),
  termHints: (() => { try { return localStorage.getItem('mdl-term-hints') !== '0' } catch { return true } })(),
  setTermHints(termHints) { try { localStorage.setItem('mdl-term-hints', termHints ? '1' : '0') } catch { /* private mode */ } set({ termHints }) },
  panelSlots: 0,
  addPanelSlot: (delta) => set((s) => ({ panelSlots: Math.max(0, s.panelSlots + delta) })),
  setTheme(theme) {
    try { if (theme === 'system') localStorage.removeItem('mdl-theme'); else localStorage.setItem('mdl-theme', theme) } catch { /* private mode */ }
    if (theme === 'system') delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = theme
    set({ theme })
  },
  toggleSidebar: (open) => set((s) => ({ sidebar: open ?? !s.sidebar })),
  togglePanel: (open) => set((s) => ({ panel: open ?? !s.panel })),
  setPanelTab: (panelTab) => set({ panelTab, panel: true }),
  setPalette: (palette) => set({ palette }),
}))
