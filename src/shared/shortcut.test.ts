import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TOGGLE_SHORTCUT,
  matchesShortcut,
  parseShortcut,
  resolveToggleShortcut,
} from './shortcut'

const keyboardEvent = (init: KeyboardEventInit) => {
  return new KeyboardEvent('keydown', init)
}

describe('parseShortcut', () => {
  it('parses the Chrome default binding', () => {
    expect(parseShortcut('Ctrl+Shift+8')).toEqual({
      ctrlKey: true,
      shiftKey: true,
      altKey: false,
      metaKey: false,
      code: 'Digit8',
    })
  })

  it('maps the macOS Command modifier to the meta key', () => {
    expect(parseShortcut('Command+Shift+8')).toEqual({
      ctrlKey: false,
      shiftKey: true,
      altKey: false,
      metaKey: true,
      code: 'Digit8',
    })
  })

  it('maps MacCtrl to the control key, not the meta key', () => {
    expect(parseShortcut('MacCtrl+Shift+8')).toMatchObject({
      ctrlKey: true,
      metaKey: false,
    })
  })

  it('parses glyph-style macOS bindings without separators', () => {
    expect(parseShortcut('⌘⇧8')).toEqual({
      ctrlKey: false,
      shiftKey: true,
      altKey: false,
      metaKey: true,
      code: 'Digit8',
    })
  })

  it('parses letter, function and named keys', () => {
    expect(parseShortcut('Ctrl+Shift+K')).toMatchObject({ code: 'KeyK' })
    expect(parseShortcut('Alt+F5')).toMatchObject({ code: 'F5' })
    expect(parseShortcut('Ctrl+Shift+Comma')).toMatchObject({ code: 'Comma' })
    expect(parseShortcut('Ctrl+Shift+Up')).toMatchObject({ code: 'ArrowUp' })
  })

  it('returns null for keys a page can never observe', () => {
    expect(parseShortcut('MediaNextTrack')).toBeNull()
  })

  it('returns null for unknown tokens, blank input and two key tokens', () => {
    expect(parseShortcut('Ctrl+Shift+Frobnicate')).toBeNull()
    expect(parseShortcut('   ')).toBeNull()
    expect(parseShortcut('Ctrl+8+9')).toBeNull()
  })
})

describe('resolveToggleShortcut', () => {
  it('falls back to the manifest default when the command is unbound', () => {
    expect(resolveToggleShortcut('')).toEqual(
      parseShortcut(DEFAULT_TOGGLE_SHORTCUT),
    )
    expect(resolveToggleShortcut(undefined)).toEqual(
      parseShortcut(DEFAULT_TOGGLE_SHORTCUT),
    )
  })

  it('does not fall back to the default when a real binding is unparseable', () => {
    // Answering the default keys here would recreate the divergence this
    // module exists to remove.
    expect(resolveToggleShortcut('MediaPlayPause')).toBeNull()
  })

  it('uses the mirrored binding when the user rebinds the command', () => {
    expect(resolveToggleShortcut('Alt+Shift+J')).toMatchObject({
      altKey: true,
      shiftKey: true,
      ctrlKey: false,
      metaKey: false,
      code: 'KeyJ',
    })
  })
})

describe('matchesShortcut', () => {
  const macBinding = parseShortcut('Command+Shift+8')

  it('matches the advertised macOS binding', () => {
    expect(
      matchesShortcut(
        keyboardEvent({ metaKey: true, shiftKey: true, code: 'Digit8' }),
        macBinding,
      ),
    ).toBe(true)
  })

  it('does not match Ctrl when the binding asks for Command', () => {
    expect(
      matchesShortcut(
        keyboardEvent({ ctrlKey: true, shiftKey: true, code: 'Digit8' }),
        macBinding,
      ),
    ).toBe(false)
  })

  it('rejects extra modifiers', () => {
    expect(
      matchesShortcut(
        keyboardEvent({
          metaKey: true,
          shiftKey: true,
          altKey: true,
          code: 'Digit8',
        }),
        macBinding,
      ),
    ).toBe(false)
  })

  it('never matches when there is no resolved shortcut', () => {
    expect(
      matchesShortcut(
        keyboardEvent({ ctrlKey: true, shiftKey: true, code: 'Digit8' }),
        null,
      ),
    ).toBe(false)
  })
})
