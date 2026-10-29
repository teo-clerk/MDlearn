// The LaTeX files of a folder: which ones to list, and which document a chapter file belongs to.
import { readFileSync } from 'node:fs'
import { basename, posix, relative, sep } from 'node:path'
import { walk } from '@mdlearn/core/node'
import type { TexDoc } from '../shared/types.js'

export const TEX_FILE = /\.tex$/i
const MAX_TREE = 300

/** The .tex files of a folder for the file tree, titled by their \title when they have one. */
export function texDocs(root: string): TexDoc[] {
  return walk(root, (f) => TEX_FILE.test(f)).slice(0, MAX_TREE).map((abs) => {
    let head = ''
    try { head = readFileSync(abs, 'utf8').slice(0, 4000) } catch { /* unreadable: listed by name */ }
    const title = /\\title\s*(?:\[[^\]]*\])?\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/.exec(head)?.[1].replace(/\\[a-zA-Z]+\*?|[{}~]|\\\\/g, ' ').replace(/\s+/g, ' ').trim()
    return { path: relative(root, abs).split(sep).join(posix.sep), title: title || basename(abs).replace(TEX_FILE, '') }
  })
}

/** `% !TEX root = main.tex` in a chapter file names the document to compile (TeXShop's convention). */
export function texRoot(text: string): string | null {
  const m = /^%\s*!\s*TEX\s+root\s*=\s*(\S.*?)\s*$/im.exec(text.split('\n', 30).join('\n'))
  return m ? m[1] : null
}

