const LEGACY_PREFIXES = ['md-notes-', 'moji-notes-']
const PREFIX = 'marknote-'

export function prefKey(name: string): string {
  return `${PREFIX}${name}`
}

export function loadPref(name: string): string | null {
  const key = prefKey(name)
  const current = localStorage.getItem(key)
  if (current !== null) return current

  const legacy = LEGACY_PREFIXES.map((p) => localStorage.getItem(`${p}${name}`)).find((v) => v !== null)
  if (legacy !== undefined && legacy !== null) {
    localStorage.setItem(key, legacy)
    return legacy
  }

  return null
}

export function savePref(name: string, value: string): void {
  localStorage.setItem(prefKey(name), value)
}
