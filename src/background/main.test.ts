import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getChromeMock } from '../test/chrome'
import { TOGGLE_SHORTCUT_STORAGE_KEY } from '../shared/shortcut'

const loadBackgroundScript = async () => {
  vi.resetModules()
  await import('./main')
}

describe('background command handling', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('sends a toggle message to the active TikTok tab', async () => {
    const chromeMock = getChromeMock()
    chromeMock.tabs.query.mockImplementation((_queryInfo, callback) => {
      callback([
        {
          id: 42,
          url: 'https://www.tiktok.com/@creator/video/123',
        } as chrome.tabs.Tab,
      ])
    })

    await loadBackgroundScript()

    const [listener] = chromeMock.commands.onCommand.listeners()
    await listener?.('toggle-current-page-block')

    expect(chromeMock.tabs.query).toHaveBeenCalledWith(
      {
        active: true,
        currentWindow: true,
      },
      expect.any(Function),
    )
    expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(
      42,
      {
        action: 'toggleCurrentPageBlock',
      },
      expect.any(Function),
    )
  })

  it('mirrors the resolved shortcut into storage for the content script', async () => {
    const chromeMock = getChromeMock()
    chromeMock.commands.getAll.mockImplementation(callback => {
      callback([
        {
          name: 'toggle-current-page-block',
          description: 'Toggle blocking for the current TikTok page',
          shortcut: 'Command+Shift+8',
        },
      ])
    })

    await loadBackgroundScript()

    expect(chromeMock.storage.local.set).toHaveBeenCalledWith({
      [TOGGLE_SHORTCUT_STORAGE_KEY]: 'Command+Shift+8',
    })
  })

  it('mirrors an empty string when the command is unbound', async () => {
    const chromeMock = getChromeMock()
    chromeMock.commands.getAll.mockImplementation(callback => {
      callback([])
    })

    await loadBackgroundScript()

    expect(chromeMock.storage.local.set).toHaveBeenCalledWith({
      [TOGGLE_SHORTCUT_STORAGE_KEY]: '',
    })
  })

  it('ignores unrelated commands', async () => {
    const chromeMock = getChromeMock()

    await loadBackgroundScript()

    const [listener] = chromeMock.commands.onCommand.listeners()
    await listener?.('open-popup')

    expect(chromeMock.tabs.query).not.toHaveBeenCalled()
    expect(chromeMock.tabs.sendMessage).not.toHaveBeenCalled()
  })

  it('does not message non-TikTok tabs', async () => {
    const chromeMock = getChromeMock()
    chromeMock.tabs.query.mockImplementation((_queryInfo, callback) => {
      callback([
        {
          id: 42,
          url: 'https://example.com/',
        } as chrome.tabs.Tab,
      ])
    })

    await loadBackgroundScript()

    const [listener] = chromeMock.commands.onCommand.listeners()
    await listener?.('toggle-current-page-block')

    expect(chromeMock.tabs.sendMessage).not.toHaveBeenCalled()
  })
})
