/** A folder for a command someone pastes into a terminal: quoted so nothing in its name can run. */
export function shellPath(path: string): string {
  const windows = /^[a-zA-Z]:\\/.test(path)
  return (windows ? /["$`]/ : /["$`!\\]/).test(path) ? `'${path.replace(/'/g, `'\\''`)}'` : `"${path}"`
}
