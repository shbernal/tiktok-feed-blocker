// The in-page keydown fallback has to answer the *same* keys the browser has
// bound to `toggle-current-page-block`. `chrome.commands` is not exposed to
// content scripts, so the background script resolves the binding and mirrors it
// into this storage key for the content script to read. Kept out of
// `ExtensionSettings` on purpose: it is browser state, not a user preference,
// so `normalizeSettings` never has to carry a field for it.
export const TOGGLE_SHORTCUT_STORAGE_KEY = 'toggleShortcut'

// Matches the `default` suggested_key in `manifest.config.ts`. Used when the
// command is unbound, so the fallback keeps working.
export const DEFAULT_TOGGLE_SHORTCUT = 'Ctrl+Shift+8'

export type ParsedShortcut = {
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  metaKey: boolean
  code: string
}

type ModifierKey = 'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey'

// Chrome hands back `Command+Shift+8` on macOS and `Ctrl+Shift+8` elsewhere;
// `MacCtrl` is the macOS Control modifier and `Search` is the ChromeOS one.
const WORD_MODIFIERS: Record<string, ModifierKey> = {
  ctrl: 'ctrlKey',
  control: 'ctrlKey',
  macctrl: 'ctrlKey',
  command: 'metaKey',
  cmd: 'metaKey',
  search: 'metaKey',
  alt: 'altKey',
  option: 'altKey',
  shift: 'shiftKey',
}

// Some surfaces report the macOS binding as glyphs with no separators (`⌘⇧8`).
const SYMBOL_MODIFIERS: Record<string, ModifierKey> = {
  '⌃': 'ctrlKey',
  '⇧': 'shiftKey',
  '⌥': 'altKey',
  '⌘': 'metaKey',
}

// Named keys whose `KeyboardEvent.code` is not derivable from the token.
const NAMED_KEY_CODES: Record<string, string> = {
  comma: 'Comma',
  period: 'Period',
  space: 'Space',
  insert: 'Insert',
  delete: 'Delete',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  pagedown: 'PageDown',
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
}

const toKeyCode = (token: string): string | null => {
  if (/^[a-z]$/.test(token)) {
    return `Key${token.toUpperCase()}`
  }

  if (/^[0-9]$/.test(token)) {
    return `Digit${token}`
  }

  if (/^f([1-9]|1[0-2])$/.test(token)) {
    return token.toUpperCase()
  }

  return NAMED_KEY_CODES[token] ?? null
}

/**
 * Parses a `chrome.commands` shortcut string into a keydown matcher.
 *
 * Returns `null` when the string names a key the page can never observe (media
 * keys) or uses a token we do not understand. Callers must treat that as "match
 * nothing" rather than falling back to the default binding — silently answering
 * the default keys is the exact divergence this module exists to remove.
 */
export const parseShortcut = (value: string): ParsedShortcut | null => {
  const modifiers = {
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
  }

  let rest = value.trim()
  if (rest === '') {
    return null
  }

  while (rest.length > 0 && rest[0] in SYMBOL_MODIFIERS) {
    modifiers[SYMBOL_MODIFIERS[rest[0]]] = true
    rest = rest.slice(1)
  }

  const tokens = rest
    .split('+')
    .map(token => token.trim())
    .filter(token => token !== '')

  if (tokens.length === 0) {
    return null
  }

  let code: string | null = null

  for (const token of tokens) {
    const normalized = token.toLowerCase()
    const modifier = WORD_MODIFIERS[normalized]

    if (modifier) {
      modifiers[modifier] = true
      continue
    }

    if (code !== null) {
      return null
    }

    code = toKeyCode(normalized)
    if (code === null) {
      return null
    }
  }

  if (code === null) {
    return null
  }

  return { ...modifiers, code }
}

/**
 * Resolves the mirrored storage value into a matcher. A missing or blank value
 * means the command is unbound, so the default binding stays live.
 */
export const resolveToggleShortcut = (
  value: unknown,
): ParsedShortcut | null => {
  if (typeof value !== 'string' || value.trim() === '') {
    return parseShortcut(DEFAULT_TOGGLE_SHORTCUT)
  }

  return parseShortcut(value)
}

export const matchesShortcut = (
  event: KeyboardEvent,
  shortcut: ParsedShortcut | null,
) => {
  if (!shortcut) {
    return false
  }

  return (
    event.ctrlKey === shortcut.ctrlKey &&
    event.shiftKey === shortcut.shiftKey &&
    event.altKey === shortcut.altKey &&
    event.metaKey === shortcut.metaKey &&
    event.code === shortcut.code
  )
}
