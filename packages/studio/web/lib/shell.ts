/** Only the letters of something typed, so it can go inside the double quotes of a pasted command on any system. */
export const plainWords = (text: string) => text.replace(/[^\p{L}\p{M} -]/gu, '').trim()

/** A folder for a command someone pastes into a terminal: quoted so nothing in its name can run. */
export function shellPath(path: string): string {
  const windows = /^[a-zA-Z]:\\/.test(path)
  if (!(windows ? /["$`]/ : /["$`!\\]/).test(path)) return `"${path}"`
  return `'${path.replace(/'/g, windows ? `''` : `'\\''`)}'`
}
