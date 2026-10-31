// Highlights with a purpose: one click, no text, and each leads somewhere. Icon and label say what the colour says.
import { CircleHelp, GraduationCap, Star, type LucideIcon } from 'lucide-react'
import type { NoteColor } from '../../shared/types'
import { t } from '../i18n'

export const NOTE_MARKS: { color: NoteColor; icon: LucideIcon }[] = [
  { color: 'important', icon: Star },
  { color: 'confusing', icon: CircleHelp },
  { color: 'exam', icon: GraduationCap },
]
export const markLabel = (color: NoteColor) => (color === 'important' ? t('Important') : color === 'confusing' ? t('Confusing') : t('For the exam'))
