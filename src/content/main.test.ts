import { fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SETTINGS_STORAGE_KEY } from '../shared/settings'
import { getChromeMock } from '../test/chrome'
import { cleanupContentScript, initContentScript } from './main'

const OVERLAY_ID = 'ttfb-feed-overlay'
const OVERLAY_TOGGLE_ID = 'ttfb-active-toggle'
const OVERLAY_TOGGLE_LABEL_ID = 'ttfb-active-toggle-label'

describe('content script', () => {
  afterEach(() => {
    cleanupContentScript()
  })

  it('hides home targets, mutes managed media, and restores them when disabled', () => {
    const chromeMock = getChromeMock()
    chromeMock.storage.local.seed({
      [SETTINGS_STORAGE_KEY]: {
        active: true,
        home: true,
        explore: false,
        live: false,
      },
    })
    document.body.innerHTML = `
      <div id="column-list-container">
        <video></video>
      </div>
      <div class="progress-js-inner"></div>
    `

    const columnList = document.querySelector<HTMLElement>(
      '#column-list-container',
    )
    const video = document.querySelector<HTMLVideoElement>('video')

    expect(columnList).not.toBeNull()
    expect(video).not.toBeNull()

    video!.muted = false
    video!.volume = 0.75

    initContentScript()

    expect(columnList!.style.display).toBe('none')
    expect(columnList).toHaveAttribute('data-ttfb-home-hidden', 'true')
    expect(video!.muted).toBe(true)
    expect(video!.volume).toBe(0)

    chromeMock.storage.local.set({
      [SETTINGS_STORAGE_KEY]: {
        active: false,
        home: false,
        explore: false,
        live: false,
      },
    })

    expect(columnList!.style.display).toBe('')
    expect(columnList).not.toHaveAttribute('data-ttfb-home-hidden')
    expect(video!.muted).toBe(false)
    expect(video!.volume).toBe(0.75)
  })

  it('hides an open home comments sidebar and restores it when disabled', () => {
    const chromeMock = getChromeMock()
    chromeMock.storage.local.seed({
      [SETTINGS_STORAGE_KEY]: {
        active: true,
        home: true,
        explore: false,
        live: false,
      },
    })
    document.body.innerHTML = `
      <div id="column-list-container"></div>
      <aside>
        <div class="DivCommentSidebarTransitionWrapper-fixture">
          <section class="SectionCommentSidebarContainer-fixture">
            Comments 3150
          </section>
        </div>
      </aside>
    `

    const commentWrapper = document.querySelector<HTMLElement>(
      '.DivCommentSidebarTransitionWrapper-fixture',
    )
    const commentSidebar = document.querySelector<HTMLElement>(
      '.SectionCommentSidebarContainer-fixture',
    )

    expect(commentWrapper).not.toBeNull()
    expect(commentSidebar).not.toBeNull()

    initContentScript()

    expect(commentWrapper!.style.display).toBe('none')
    expect(commentWrapper).toHaveAttribute('data-ttfb-home-hidden', 'true')
    expect(commentSidebar!.style.display).toBe('none')
    expect(commentSidebar).toHaveAttribute('data-ttfb-home-hidden', 'true')

    chromeMock.storage.local.set({
      [SETTINGS_STORAGE_KEY]: {
        active: false,
        home: false,
        explore: false,
        live: false,
      },
    })

    expect(commentWrapper!.style.display).toBe('')
    expect(commentWrapper).not.toHaveAttribute('data-ttfb-home-hidden')
    expect(commentSidebar!.style.display).toBe('')
    expect(commentSidebar).not.toHaveAttribute('data-ttfb-home-hidden')
  })

  it('renders an overlay for a blocked explore page and persists overlay toggles', () => {
    const chromeMock = getChromeMock()
    chromeMock.storage.local.seed({
      [SETTINGS_STORAGE_KEY]: {
        active: true,
        home: false,
        explore: true,
        live: false,
      },
    })
    document.body.innerHTML = '<main id="main-content-explore_page"></main>'

    initContentScript()

    const overlay = document.getElementById(OVERLAY_ID)
    const toggleLabel = document.getElementById(OVERLAY_TOGGLE_LABEL_ID)
    const toggle = document.getElementById(
      OVERLAY_TOGGLE_ID,
    ) as HTMLInputElement | null

    expect(overlay).not.toBeNull()
    expect(toggleLabel).toHaveTextContent('Block Explore')
    expect(toggle).not.toBeNull()
    expect(toggle).toBeChecked()

    toggle!.checked = false
    fireEvent.change(toggle!)

    expect(chromeMock.storage.local.set).toHaveBeenLastCalledWith({
      [SETTINGS_STORAGE_KEY]: {
        active: false,
        home: false,
        explore: false,
        live: false,
      },
    })
    expect(document.getElementById(OVERLAY_ID)).toBeNull()
  })

  it('handles runtime messages that toggle the current page section', () => {
    const chromeMock = getChromeMock()
    const sendResponse = vi.fn()
    chromeMock.storage.local.seed({
      [SETTINGS_STORAGE_KEY]: {
        active: true,
        home: true,
        explore: false,
        live: false,
      },
    })
    document.body.innerHTML = '<div id="column-list-container"></div>'

    initContentScript()

    const [listener] = chromeMock.runtime.onMessage.listeners()
    const result = listener?.(
      {
        action: 'toggleCurrentPageBlock',
      },
      {},
      sendResponse,
    )

    expect(result).toBe(false)
    expect(sendResponse).toHaveBeenCalledWith({ success: true })
    expect(chromeMock.storage.local.set).toHaveBeenLastCalledWith({
      [SETTINGS_STORAGE_KEY]: {
        active: false,
        home: false,
        explore: false,
        live: false,
      },
    })
  })

  it('toggles the current page section from the focused page shortcut', () => {
    const chromeMock = getChromeMock()
    chromeMock.storage.local.seed({
      [SETTINGS_STORAGE_KEY]: {
        active: true,
        home: true,
        explore: false,
        live: false,
      },
    })
    document.body.innerHTML = '<div id="column-list-container"></div>'

    initContentScript()

    fireEvent.keyDown(document.body, {
      code: 'Digit8',
      ctrlKey: true,
      shiftKey: true,
    })

    expect(chromeMock.storage.local.set).toHaveBeenLastCalledWith({
      [SETTINGS_STORAGE_KEY]: {
        active: false,
        home: false,
        explore: false,
        live: false,
      },
    })
  })

  it('hides the current live page container selector and restores media', () => {
    window.history.pushState({}, '', '/live')

    const chromeMock = getChromeMock()
    chromeMock.storage.local.seed({
      [SETTINGS_STORAGE_KEY]: {
        active: true,
        home: false,
        explore: false,
        live: true,
      },
    })
    document.body.innerHTML = `
      <main id="tiktok-live-main-container-id">
        <video></video>
      </main>
    `

    const liveContainer = document.getElementById(
      'tiktok-live-main-container-id',
    )
    const video = document.querySelector<HTMLVideoElement>('video')

    expect(liveContainer).not.toBeNull()
    expect(video).not.toBeNull()

    video!.muted = false
    video!.volume = 0.75

    initContentScript()

    expect(liveContainer!.style.display).toBe('none')
    expect(liveContainer).toHaveAttribute('data-ttfb-live-hidden', 'true')
    expect(video!.muted).toBe(true)
    expect(video!.volume).toBe(0)

    chromeMock.storage.local.set({
      [SETTINGS_STORAGE_KEY]: {
        active: false,
        home: false,
        explore: false,
        live: false,
      },
    })

    expect(liveContainer!.style.display).toBe('')
    expect(liveContainer).not.toHaveAttribute('data-ttfb-live-hidden')
    expect(video!.muted).toBe(false)
    expect(video!.volume).toBe(0.75)
  })

  it('ignores the focused page shortcut inside editable fields', () => {
    const chromeMock = getChromeMock()
    chromeMock.storage.local.seed({
      [SETTINGS_STORAGE_KEY]: {
        active: true,
        home: true,
        explore: false,
        live: false,
      },
    })
    document.body.innerHTML = `
      <input id="search" />
      <div id="column-list-container"></div>
    `

    initContentScript()

    const search = document.getElementById('search')
    expect(search).not.toBeNull()

    fireEvent.keyDown(search!, {
      code: 'Digit8',
      ctrlKey: true,
      shiftKey: true,
    })

    expect(chromeMock.storage.local.set).toHaveBeenCalledTimes(1)
  })
})
