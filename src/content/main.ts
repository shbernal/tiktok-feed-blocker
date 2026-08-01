import {
  deriveSettingsFromStorage,
  LEGACY_ACTIVE_STORAGE_KEY,
  normalizeSettings,
  SETTINGS_STORAGE_KEY,
  syncActiveWithPages,
  type ExtensionSettings,
} from '../shared/settings'
import {
  matchesShortcut,
  type ParsedShortcut,
  resolveToggleShortcut,
  TOGGLE_SHORTCUT_STORAGE_KEY,
} from '../shared/shortcut'
import { applyCurrentSettings, clearAllBlocking } from './blocking'
import {
  removeFeedOverlay,
  removeOverlayStyles,
  type OverlayHandlers,
} from './overlay'
import { getCurrentPageSection } from './selectors'

type UpdateSettingsMessage = {
  action: 'updateSettings'
  settings: ExtensionSettings
}

type ToggleCurrentPageBlockMessage = {
  action: 'toggleCurrentPageBlock'
}

const SHORTCUT_DUPLICATE_WINDOW_MS = 500

let settings: ExtensionSettings = {
  active: true,
  home: true,
  explore: true,
  live: true,
}
let observer: MutationObserver | null = null
let intervalId: number | null = null
const pendingApplyTimeouts = new Set<number>()
let lastShortcutToggleAt = 0
// Mirrored from `chrome.commands` by the background script; until it lands the
// manifest default keeps the fallback working.
let toggleShortcut: ParsedShortcut | null = resolveToggleShortcut(undefined)

const isUpdateSettingsMessage = (
  message: unknown,
): message is UpdateSettingsMessage => {
  return (
    typeof message === 'object' &&
    message !== null &&
    'action' in message &&
    'settings' in message &&
    (message as { action: unknown }).action === 'updateSettings'
  )
}

const isToggleCurrentPageBlockMessage = (
  message: unknown,
): message is ToggleCurrentPageBlockMessage => {
  return (
    typeof message === 'object' &&
    message !== null &&
    'action' in message &&
    (message as { action: unknown }).action === 'toggleCurrentPageBlock'
  )
}

const saveSettings = (nextSettings: ExtensionSettings) => {
  chrome.storage.local.set({
    [SETTINGS_STORAGE_KEY]: syncActiveWithPages(nextSettings),
  })
}

const setCurrentPageBlocking = (enabled: boolean) => {
  const currentPageSection = getCurrentPageSection()
  if (!currentPageSection) {
    return false
  }

  settings = syncActiveWithPages({
    ...settings,
    [currentPageSection]: enabled,
  })
  saveSettings(settings)
  applySettings()
  return true
}

// A stable singleton: overlay.ts keeps whatever it is handed as module state,
// so handing it a fresh object each render would churn for no reason.
const overlayHandlers: OverlayHandlers = {
  onToggle: enabled => {
    setCurrentPageBlocking(enabled)
  },
  onBlock: () => {
    setCurrentPageBlocking(true)
  },
}

const applySettings = () => {
  applyCurrentSettings(settings, overlayHandlers)
}

const toggleCurrentPageBlock = () => {
  const currentPageSection = getCurrentPageSection()
  if (!currentPageSection) {
    return false
  }

  return setCurrentPageBlocking(!settings[currentPageSection])
}

const toggleCurrentPageBlockFromShortcut = () => {
  lastShortcutToggleAt = Date.now()
  return toggleCurrentPageBlock()
}

const wasRecentlyToggledByShortcut = () => {
  return Date.now() - lastShortcutToggleAt < SHORTCUT_DUPLICATE_WINDOW_MS
}

const isTextInputTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  const tagName = target.tagName.toLowerCase()
  return (
    target.isContentEditable ||
    tagName === 'input' ||
    tagName === 'select' ||
    tagName === 'textarea'
  )
}

const isToggleShortcut = (event: KeyboardEvent) => {
  return matchesShortcut(event, toggleShortcut)
}

const onKeyDown = (event: KeyboardEvent) => {
  if (!isToggleShortcut(event) || isTextInputTarget(event.target)) {
    return
  }

  if (toggleCurrentPageBlockFromShortcut()) {
    event.preventDefault()
    event.stopPropagation()
  }
}

const onRuntimeMessage: Parameters<
  typeof chrome.runtime.onMessage.addListener
>[0] = (message, _sender, sendResponse) => {
  if (isUpdateSettingsMessage(message)) {
    settings = normalizeSettings(message.settings, settings)
    applySettings()

    sendResponse({ success: true })
    return false
  }

  if (isToggleCurrentPageBlockMessage(message)) {
    if (wasRecentlyToggledByShortcut()) {
      sendResponse({ success: true })
      return false
    }

    sendResponse({ success: toggleCurrentPageBlock() })
    return false
  }

  return false
}

const onStorageChanged: Parameters<
  typeof chrome.storage.onChanged.addListener
>[0] = (changes, areaName) => {
  if (areaName !== 'local') {
    return
  }

  const shortcutChange = changes[TOGGLE_SHORTCUT_STORAGE_KEY]
  if (shortcutChange) {
    toggleShortcut = resolveToggleShortcut(shortcutChange.newValue)
  }

  const settingsChange = changes[SETTINGS_STORAGE_KEY]
  if (!settingsChange) {
    return
  }

  settings = normalizeSettings(settingsChange.newValue, settings)
  applySettings()
}

// Observer callbacks defer the re-apply so a burst of DOM insertions settles
// first. The ids are tracked so teardown can cancel work that has not run yet —
// otherwise a queued re-apply lands after cleanupContentScript and re-hides
// elements clearAllBlocking just restored.
const scheduleApplySettings = () => {
  const timeoutId = window.setTimeout(() => {
    pendingApplyTimeouts.delete(timeoutId)
    applySettings()
  }, 100)

  pendingApplyTimeouts.add(timeoutId)
}

const cancelPendingApplySettings = () => {
  pendingApplyTimeouts.forEach(timeoutId => {
    window.clearTimeout(timeoutId)
  })
  pendingApplyTimeouts.clear()
}

const setupObserver = () => {
  if (!document.body) {
    return
  }

  observer = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type !== 'childList' || mutation.addedNodes.length === 0) {
        continue
      }

      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          scheduleApplySettings()
          return
        }
      }
    }
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  })
}

const startBlockingLoop = () => {
  if (intervalId !== null) {
    window.clearInterval(intervalId)
  }

  intervalId = window.setInterval(() => {
    applySettings()
  }, 1000)
}

export const initContentScript = () => {
  chrome.storage.local.get(
    [
      SETTINGS_STORAGE_KEY,
      LEGACY_ACTIVE_STORAGE_KEY,
      TOGGLE_SHORTCUT_STORAGE_KEY,
    ],
    result => {
      settings = deriveSettingsFromStorage(
        result[SETTINGS_STORAGE_KEY],
        result[LEGACY_ACTIVE_STORAGE_KEY],
      )
      toggleShortcut = resolveToggleShortcut(
        result[TOGGLE_SHORTCUT_STORAGE_KEY],
      )
      saveSettings(settings)
      applySettings()
    },
  )

  chrome.runtime.onMessage.addListener(onRuntimeMessage)
  chrome.storage.onChanged.addListener(onStorageChanged)
  document.addEventListener('keydown', onKeyDown, true)
  setupObserver()
  startBlockingLoop()
}

export const cleanupContentScript = () => {
  chrome.runtime.onMessage.removeListener(onRuntimeMessage)
  chrome.storage.onChanged.removeListener(onStorageChanged)
  document.removeEventListener('keydown', onKeyDown, true)
  removeFeedOverlay()
  removeOverlayStyles()

  if (observer) {
    observer.disconnect()
    observer = null
  }

  if (intervalId !== null) {
    window.clearInterval(intervalId)
    intervalId = null
  }

  cancelPendingApplySettings()
}

const startContentScript = () => {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initContentScript, {
      once: true,
    })
  } else {
    initContentScript()
  }
}

if (import.meta.env.MODE !== 'test' && typeof chrome !== 'undefined') {
  startContentScript()
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    cleanupContentScript()
    clearAllBlocking()
  })
}
