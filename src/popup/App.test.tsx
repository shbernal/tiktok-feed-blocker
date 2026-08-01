import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'
import { SETTINGS_STORAGE_KEY } from '../shared/settings'
import { getChromeMock } from '../test/chrome'

describe('popup app', () => {
  it('loads stored settings into the page toggles', async () => {
    const chromeMock = getChromeMock()
    const storedSettings = {
      active: true,
      home: true,
      explore: false,
      live: true,
      overlay: true,
    }

    chromeMock.storage.local.seed({
      [SETTINGS_STORAGE_KEY]: storedSettings,
    })

    render(<App />)

    expect(
      await screen.findByRole('checkbox', { name: 'Block all pages' }),
    ).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Block Home' })).toBeChecked()
    expect(
      screen.getByRole('checkbox', { name: 'Block Explore' }),
    ).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Block Live' })).toBeChecked()

    expect(chromeMock.storage.local.set).toHaveBeenCalledWith({
      [SETTINGS_STORAGE_KEY]: storedSettings,
    })
  })

  it('toggles the overlay without touching the page sections', async () => {
    const user = userEvent.setup()
    const chromeMock = getChromeMock()
    chromeMock.storage.local.seed({
      [SETTINGS_STORAGE_KEY]: {
        active: true,
        home: true,
        explore: true,
        live: true,
        overlay: true,
      },
    })

    render(<App />)

    const overlayToggle = await screen.findByRole('checkbox', {
      name: 'Show overlay',
    })
    expect(overlayToggle).toBeChecked()

    await user.click(overlayToggle)

    expect(overlayToggle).not.toBeChecked()
    expect(chromeMock.storage.local.set).toHaveBeenLastCalledWith({
      [SETTINGS_STORAGE_KEY]: {
        active: true,
        home: true,
        explore: true,
        live: true,
        overlay: false,
      },
    })

    // Blocking is untouched, so "Block all pages" stays on.
    expect(
      screen.getByRole('checkbox', { name: 'Block all pages' }),
    ).toBeChecked()
  })

  it('leaves the overlay preference alone when blocking all pages', async () => {
    const user = userEvent.setup()
    const chromeMock = getChromeMock()
    chromeMock.storage.local.seed({
      [SETTINGS_STORAGE_KEY]: {
        active: false,
        home: false,
        explore: false,
        live: false,
        overlay: false,
      },
    })

    render(<App />)

    await user.click(
      await screen.findByRole('checkbox', { name: 'Block all pages' }),
    )

    expect(chromeMock.storage.local.set).toHaveBeenLastCalledWith({
      [SETTINGS_STORAGE_KEY]: {
        active: true,
        home: true,
        explore: true,
        live: true,
        overlay: false,
      },
    })
  })

  it('toggles all page sections and persists the synced settings', async () => {
    const user = userEvent.setup()
    const chromeMock = getChromeMock()
    chromeMock.storage.local.seed({
      [SETTINGS_STORAGE_KEY]: {
        active: true,
        home: true,
        explore: true,
        live: true,
        overlay: true,
      },
    })
    chromeMock.tabs.query.mockImplementation((_queryInfo, callback) => {
      callback([
        {
          id: 9,
        } as chrome.tabs.Tab,
      ])
    })

    render(<App />)

    const toggleAll = await screen.findByRole('checkbox', {
      name: 'Block all pages',
    })
    await user.click(toggleAll)

    const nextSettings = {
      active: false,
      home: false,
      explore: false,
      live: false,
      overlay: true,
    }

    expect(toggleAll).not.toBeChecked()
    expect(chromeMock.storage.local.set).toHaveBeenLastCalledWith({
      [SETTINGS_STORAGE_KEY]: nextSettings,
    })
    await waitFor(() => {
      expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(
        9,
        {
          action: 'updateSettings',
          settings: nextSettings,
        },
        expect.any(Function),
      )
    })
  })

  it('toggles one section and keeps active true when any page is enabled', async () => {
    const user = userEvent.setup()
    const chromeMock = getChromeMock()
    chromeMock.storage.local.seed({
      [SETTINGS_STORAGE_KEY]: {
        active: false,
        home: false,
        explore: false,
        live: false,
        overlay: true,
      },
    })
    chromeMock.tabs.query.mockImplementation((_queryInfo, callback) => {
      callback([
        {
          id: 12,
        } as chrome.tabs.Tab,
      ])
    })

    render(<App />)

    const homeToggle = await screen.findByRole('checkbox', {
      name: 'Block Home',
    })
    await user.click(homeToggle)

    const nextSettings = {
      active: true,
      home: true,
      explore: false,
      live: false,
      overlay: true,
    }

    expect(homeToggle).toBeChecked()
    expect(chromeMock.storage.local.set).toHaveBeenLastCalledWith({
      [SETTINGS_STORAGE_KEY]: nextSettings,
    })
    await waitFor(() => {
      expect(chromeMock.tabs.sendMessage).toHaveBeenCalledWith(
        12,
        {
          action: 'updateSettings',
          settings: nextSettings,
        },
        expect.any(Function),
      )
    })
  })
})
