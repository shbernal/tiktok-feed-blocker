import { fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SETTINGS_STORAGE_KEY } from '../shared/settings'
import { TOGGLE_SHORTCUT_STORAGE_KEY } from '../shared/shortcut'
import { getChromeMock } from '../test/chrome'
import { clearAllBlocking } from './blocking'
import { cleanupContentScript, initContentScript } from './main'

const OVERLAY_ID = 'ttfb-feed-overlay'
const OVERLAY_TOGGLE_ID = 'ttfb-active-toggle'
const OVERLAY_TOGGLE_LABEL_ID = 'ttfb-active-toggle-label'
const OVERLAY_BLOCK_BUTTON_ID = 'ttfb-feed-overlay-block-button'

// Blocking now lives in a stylesheet and root attributes on `<html>`, neither
// of which the shared `document.body.innerHTML = ''` teardown reaches. This is
// the same pair the HMR dispose hook runs, so the tests tear down the way
// production does.
const teardownBlocking = () => {
  cleanupContentScript()
  clearAllBlocking()
}

const displayOf = (element: Element | null) => {
  return element === null ? null : window.getComputedStyle(element).display
}

const blockedAttributeFor = (section: 'home' | 'explore' | 'live') => {
  return `data-ttfb-${section}-blocked`
}

describe('content script', () => {
  afterEach(() => {
    teardownBlocking()
  })

  it('hides home targets, mutes managed media, and restores them when disabled', () => {
    const chromeMock = getChromeMock()
    chromeMock.storage.local.seed({
      [SETTINGS_STORAGE_KEY]: {
        active: true,
        home: true,
        explore: false,
        live: false,
        overlay: true,
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

    expect(displayOf(columnList)).toBe('none')
    expect(document.documentElement).toHaveAttribute(
      blockedAttributeFor('home'),
    )
    expect(video!.muted).toBe(true)
    expect(video!.volume).toBe(0)

    chromeMock.storage.local.set({
      [SETTINGS_STORAGE_KEY]: {
        active: false,
        home: false,
        explore: false,
        live: false,
        overlay: true,
      },
    })

    expect(displayOf(columnList)).toBe('block')
    expect(document.documentElement).not.toHaveAttribute(
      blockedAttributeFor('home'),
    )
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
        overlay: true,
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

    expect(displayOf(commentWrapper)).toBe('none')
    expect(displayOf(commentSidebar)).toBe('none')

    chromeMock.storage.local.set({
      [SETTINGS_STORAGE_KEY]: {
        active: false,
        home: false,
        explore: false,
        live: false,
        overlay: true,
      },
    })

    expect(displayOf(commentWrapper)).toBe('block')
    expect(displayOf(commentSidebar)).toBe('block')
  })

  it('renders an overlay for a blocked explore page and persists overlay toggles', () => {
    const chromeMock = getChromeMock()
    chromeMock.storage.local.seed({
      [SETTINGS_STORAGE_KEY]: {
        active: true,
        home: false,
        explore: true,
        live: false,
        overlay: true,
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
    expect(overlay).toHaveClass('ttfb-overlay-blocked')
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
        overlay: true,
      },
    })

    const availableOverlay = document.getElementById(OVERLAY_ID)
    const blockButton = document.getElementById(OVERLAY_BLOCK_BUTTON_ID)

    expect(availableOverlay).not.toBeNull()
    expect(availableOverlay).toHaveClass('ttfb-overlay-available')
    expect(blockButton).toHaveTextContent('Block Explore')
  })

  it('skips the overlay when the preference is off but still blocks', () => {
    const chromeMock = getChromeMock()
    chromeMock.storage.local.seed({
      [SETTINGS_STORAGE_KEY]: {
        active: true,
        home: false,
        explore: true,
        live: false,
        overlay: false,
      },
    })
    document.body.innerHTML = '<main id="main-content-explore_page"></main>'

    initContentScript()

    expect(document.getElementById(OVERLAY_ID)).toBeNull()

    const mainContent = document.getElementById('main-content-explore_page')
    expect(mainContent).toHaveStyle({ display: 'none' })
  })

  it('gives the overlay controls an accessible name in both states', () => {
    const chromeMock = getChromeMock()
    chromeMock.storage.local.seed({
      [SETTINGS_STORAGE_KEY]: {
        active: true,
        home: false,
        explore: true,
        live: false,
        overlay: true,
      },
    })
    document.body.innerHTML = '<main id="main-content-explore_page"></main>'

    initContentScript()

    // The input's own label element wraps only the slider span, so the name
    // has to come from the sibling paragraph via aria-labelledby.
    const toggle = screen.getByRole('checkbox', { name: 'Block Explore' })
    expect(toggle).toHaveAttribute('id', OVERLAY_TOGGLE_ID)

    // Flipping to the available state swaps in the block button, which names
    // itself with aria-label.
    ;(toggle as HTMLInputElement).checked = false
    fireEvent.change(toggle)

    expect(
      screen.getByRole('button', { name: 'Block Explore' }),
    ).toHaveAttribute('id', OVERLAY_BLOCK_BUTTON_ID)
  })

  it('renders a top-right corner overlay for an unblocked page and persists the block action', () => {
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
    document.body.innerHTML = '<div id="column-list-container"></div>'

    initContentScript()

    const columnList = document.querySelector<HTMLElement>(
      '#column-list-container',
    )
    const overlay = document.getElementById(OVERLAY_ID)
    const blockButton = document.getElementById(OVERLAY_BLOCK_BUTTON_ID)

    expect(columnList).not.toBeNull()
    expect(displayOf(columnList)).toBe('block')
    expect(overlay).not.toBeNull()
    expect(overlay).toHaveClass('ttfb-overlay-available')
    expect(blockButton).toHaveTextContent('Block Home')

    fireEvent.click(blockButton!)

    expect(chromeMock.storage.local.set).toHaveBeenLastCalledWith({
      [SETTINGS_STORAGE_KEY]: {
        active: true,
        home: true,
        explore: false,
        live: false,
        overlay: true,
      },
    })
    expect(displayOf(columnList)).toBe('none')
    expect(document.documentElement).toHaveAttribute(
      blockedAttributeFor('home'),
    )
    expect(document.getElementById(OVERLAY_ID)).toHaveClass(
      'ttfb-overlay-blocked',
    )
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
        overlay: true,
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
        overlay: true,
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
        overlay: true,
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
        overlay: true,
      },
    })
  })

  it('answers the mirrored binding after the command is rebound', () => {
    const chromeMock = getChromeMock()
    chromeMock.storage.local.seed({
      [SETTINGS_STORAGE_KEY]: {
        active: true,
        home: true,
        explore: false,
        live: false,
        overlay: true,
      },
      [TOGGLE_SHORTCUT_STORAGE_KEY]: 'Command+Shift+8',
    })
    document.body.innerHTML = '<div id="column-list-container"></div>'

    initContentScript()

    // The old hardcoded keys must no longer toggle once the real binding is
    // something else.
    fireEvent.keyDown(document.body, {
      code: 'Digit8',
      ctrlKey: true,
      shiftKey: true,
    })

    expect(chromeMock.storage.local.set).toHaveBeenLastCalledWith({
      [SETTINGS_STORAGE_KEY]: {
        active: true,
        home: true,
        explore: false,
        live: false,
        overlay: true,
      },
    })

    fireEvent.keyDown(document.body, {
      code: 'Digit8',
      metaKey: true,
      shiftKey: true,
    })

    expect(chromeMock.storage.local.set).toHaveBeenLastCalledWith({
      [SETTINGS_STORAGE_KEY]: {
        active: false,
        home: false,
        explore: false,
        live: false,
        overlay: true,
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
        overlay: true,
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

    expect(displayOf(liveContainer)).toBe('none')
    expect(document.documentElement).toHaveAttribute(
      blockedAttributeFor('live'),
    )
    expect(video!.muted).toBe(true)
    expect(video!.volume).toBe(0)

    chromeMock.storage.local.set({
      [SETTINGS_STORAGE_KEY]: {
        active: false,
        home: false,
        explore: false,
        live: false,
        overlay: true,
      },
    })

    expect(displayOf(liveContainer)).toBe('block')
    expect(document.documentElement).not.toHaveAttribute(
      blockedAttributeFor('live'),
    )
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
        overlay: true,
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

  it('coalesces a burst of DOM insertions into one deferred re-apply', async () => {
    const chromeMock = getChromeMock()
    chromeMock.storage.local.seed({
      [SETTINGS_STORAGE_KEY]: {
        active: true,
        home: true,
        explore: false,
        live: false,
        overlay: true,
      },
    })
    document.body.innerHTML = '<div id="column-list-container"></div>'

    initContentScript()

    vi.useFakeTimers()

    try {
      const scheduled = vi.spyOn(window, 'setTimeout')

      // Separate observer deliveries, not one batch: awaiting between the
      // insertions lets each MutationObserver callback run on its own, which is
      // what a scrolling feed produces and what used to schedule a timer each.
      for (let index = 0; index < 5; index += 1) {
        const inserted = document.createElement('nav')
        inserted.className = `DivFeedNavigationContainer-fixture-${index}`
        document.body.appendChild(inserted)
        await Promise.resolve()
      }

      const deferredApplies = scheduled.mock.calls.filter(
        ([, delay]) => delay === 100,
      )
      expect(deferredApplies).toHaveLength(1)

      // Hiding is a stylesheet gated on a root attribute that is already set,
      // so the burst is hidden as it mounts. Nothing here has advanced timers:
      // the pending sweep has not run, and does not need to for the elements
      // to be hidden. That window used to be up to 100ms of visible feed.
      const inserted = document.querySelectorAll<HTMLElement>(
        '[class*="DivFeedNavigationContainer"]',
      )
      expect(inserted).toHaveLength(5)
      inserted.forEach(element => {
        expect(displayOf(element)).toBe('none')
      })

      // The sweep still runs; it is what re-applies muting to media that
      // mounted with the burst.
      vi.advanceTimersByTime(100)
      expect(displayOf(inserted[0])).toBe('none')
    } finally {
      vi.useRealTimers()
    }
  })
})
