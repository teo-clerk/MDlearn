// What this computer is: the Linux distribution (to say how to install a program) and whether a program is there.
import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'

/** /etc/os-release as a map (ID, ID_LIKE, …); empty off Linux. */
export function osRelease(): Record<string, string> {
  try { return Object.fromEntries(readFileSync('/etc/os-release', 'utf8').split('\n').map((l) => /^(\w+)="?([^"]*)"?$/.exec(l)).filter((m) => !!m).map((m) => [m[1], m[2]])) } catch { return {} }
}

/** A word of the distribution's ID or ID_LIKE ("arch", "debian", …). */
export const distroIs = (release: Record<string, string>, ...ids: string[]) => ids.some((id) => new RegExp(`\\b${id}\\b`).test(`${release.ID ?? ''} ${release.ID_LIKE ?? ''}`))

/** Whether `cmd --version` runs. */
export function onPath(cmd: string, env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  return new Promise((done) => { execFile(cmd, ['--version'], { env, timeout: 3000, windowsHide: true }, (e) => done(!e)) })
}
