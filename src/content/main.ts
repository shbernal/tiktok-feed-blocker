import {
  deriveSettingsFromStorage,
  type PageSection,
  isAnyPageActive,
  LEGACY_ACTIVE_STORAGE_KEY,
  normalizeSettings,
  SETTINGS_STORAGE_KEY,
  syncActiveWithPages,
  type ExtensionSettings,
} from '../shared/settings'

const OVERLAY_ID = 'ttfb-feed-overlay'
const OVERLAY_STYLE_ID = 'ttfb-feed-overlay-style'
const OVERLAY_TOGGLE_ID = 'ttfb-active-toggle'
const OVERLAY_TOGGLE_LABEL_ID = 'ttfb-active-toggle-label'
const HIDDEN_HOME_ATTR = 'data-ttfb-home-hidden'
const HIDDEN_EXPLORE_ATTR = 'data-ttfb-explore-hidden'
const HIDDEN_LIVE_ATTR = 'data-ttfb-live-hidden'
const MEDIA_PREVIOUS_MUTED_ATTR = 'data-ttfb-previous-muted'
const MEDIA_PREVIOUS_VOLUME_ATTR = 'data-ttfb-previous-volume'
const MEDIA_PREVIOUS_PAUSED_ATTR = 'data-ttfb-previous-paused'

const SELECTORS = {
  mainContent: '#main-content-explore_page',
  progressIndicator: '.progress-js-inner',
  columnListContainer: '#column-list-container',
  exploreLayout:
    '[class*="DivShareLayoutBase-StyledShareLayoutV2-ExploreLayout"]',
  feedNavigationContainer: '[class*="DivFeedNavigationContainer"]',
  progressElements: '[class*="progress"]',
  livePageMainContainer: 'div[class*="ejpasz60"]',
} as const

type UpdateSettingsMessage = {
  action: 'updateSettings'
  settings: ExtensionSettings
}

type ToggleCurrentPageBlockMessage = {
  action: 'toggleCurrentPageBlock'
}

let settings: ExtensionSettings = {
  active: true,
  home: true,
  explore: true,
  live: true,
}
let observer: MutationObserver | null = null
let intervalId: number | null = null

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

const hideElement = (element: HTMLElement, hiddenAttr: string) => {
  if (element.getAttribute(hiddenAttr) === 'true') {
    return
  }

  if (element.style.display === 'none') {
    return
  }

  element.style.display = 'none'
  element.setAttribute(hiddenAttr, 'true')
}

const hideElements = (selector: string, hiddenAttr: string) => {
  document.querySelectorAll<HTMLElement>(selector).forEach(element => {
    hideElement(element, hiddenAttr)
  })
}

const restoreManagedMedia = (media: HTMLMediaElement) => {
  const previousMuted = media.getAttribute(MEDIA_PREVIOUS_MUTED_ATTR)
  const previousVolume = media.getAttribute(MEDIA_PREVIOUS_VOLUME_ATTR)
  const previousPaused = media.getAttribute(MEDIA_PREVIOUS_PAUSED_ATTR)

  if (
    previousMuted === null ||
    previousVolume === null ||
    previousPaused === null
  ) {
    return
  }

  media.muted = previousMuted === 'true'
  media.volume = Number(previousVolume)

  if (previousPaused === 'false' && media.paused) {
    void media.play().catch(() => {
      // Autoplay restrictions can block resume; restoring mute/volume is still useful.
    })
  }

  media.removeAttribute(MEDIA_PREVIOUS_MUTED_ATTR)
  media.removeAttribute(MEDIA_PREVIOUS_VOLUME_ATTR)
  media.removeAttribute(MEDIA_PREVIOUS_PAUSED_ATTR)
}

const restoreMediaInContainers = (containers: Element[]) => {
  containers.forEach(container => {
    container
      .querySelectorAll<HTMLMediaElement>('video, audio')
      .forEach(media => {
        restoreManagedMedia(media)
      })
  })
}

const showElements = (selector: string, hiddenAttr: string) => {
  document
    .querySelectorAll<HTMLElement>(`${selector}[${hiddenAttr}="true"]`)
    .forEach(element => {
      element.style.display = ''
      element.removeAttribute(hiddenAttr)
      restoreMediaInContainers([element])
    })
}

const muteMediaInContainers = (containers: Element[]) => {
  containers.forEach(container => {
    container
      .querySelectorAll<HTMLMediaElement>('video, audio')
      .forEach(media => {
        if (!media.hasAttribute(MEDIA_PREVIOUS_MUTED_ATTR)) {
          media.setAttribute(MEDIA_PREVIOUS_MUTED_ATTR, String(media.muted))
          media.setAttribute(MEDIA_PREVIOUS_VOLUME_ATTR, String(media.volume))
          media.setAttribute(MEDIA_PREVIOUS_PAUSED_ATTR, String(media.paused))
        }

        if (!media.muted || media.volume !== 0) {
          media.muted = true
          media.volume = 0
        }
      })
  })
}

const isLivePage = () => window.location.pathname.startsWith('/live')

const muteMediaInLivePages = () => {
  if (!isLivePage()) {
    return
  }

  document.querySelectorAll<HTMLMediaElement>('video, audio').forEach(media => {
    if (!media.hasAttribute(MEDIA_PREVIOUS_MUTED_ATTR)) {
      media.setAttribute(MEDIA_PREVIOUS_MUTED_ATTR, String(media.muted))
      media.setAttribute(MEDIA_PREVIOUS_VOLUME_ATTR, String(media.volume))
      media.setAttribute(MEDIA_PREVIOUS_PAUSED_ATTR, String(media.paused))
    }

    if (!media.muted || media.volume !== 0) {
      media.muted = true
      media.volume = 0
    }
  })
}

const restoreMediaInLivePages = () => {
  if (!isLivePage()) {
    return
  }

  document.querySelectorAll<HTMLMediaElement>('video, audio').forEach(media => {
    restoreManagedMedia(media)
  })
}

const ensureOverlayStyles = () => {
  if (document.getElementById(OVERLAY_STYLE_ID)) {
    return
  }

  const style = document.createElement('style')
  style.id = OVERLAY_STYLE_ID
  style.textContent = `
#${OVERLAY_ID} {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 2147483647;
  background: #fff;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
  padding: 20px 24px;
  min-width: 320px;
  text-align: center;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.ttfb-title {
  margin: 0 0 16px 0;
  color: #111;
  font-size: 20px;
  font-weight: 700;
}

.ttfb-toggle-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.ttfb-toggle-label {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.ttfb-switch {
  position: relative;
  width: 60px;
  height: 32px;
  cursor: pointer;
}

.ttfb-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.ttfb-slider {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #ccc;
  border-radius: 32px;
  transition: all 0.3s ease;
}

.ttfb-slider::before {
  position: absolute;
  content: '';
  height: 24px;
  width: 24px;
  left: 4px;
  bottom: 4px;
  background-color: white;
  border-radius: 50%;
  transition: all 0.3s ease;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.ttfb-switch input:checked + .ttfb-slider {
  background: linear-gradient(135deg, #ff0050, #ff4081);
}

.ttfb-switch input:checked + .ttfb-slider::before {
  transform: translateX(28px);
}

.ttfb-slider:hover {
  box-shadow: 0 0 8px rgba(255, 0, 80, 0.3);
}

.ttfb-switch input:checked + .ttfb-slider:hover {
  box-shadow: 0 0 8px rgba(255, 0, 80, 0.5);
}

.ttfb-switch input:focus + .ttfb-slider {
  outline: 2px solid #ff4081;
  outline-offset: 2px;
}

`

  document.documentElement.appendChild(style)
}

const removeFeedOverlay = () => {
  const overlay = document.getElementById(OVERLAY_ID)
  if (overlay) {
    overlay.remove()
  }
}

const saveSettings = (nextSettings: ExtensionSettings) => {
  chrome.storage.local.set({
    [SETTINGS_STORAGE_KEY]: syncActiveWithPages(nextSettings),
  })
}

const clearHomeBlocking = () => {
  showElements(SELECTORS.columnListContainer, HIDDEN_HOME_ATTR)
  showElements(SELECTORS.progressIndicator, HIDDEN_HOME_ATTR)
  showElements(SELECTORS.feedNavigationContainer, HIDDEN_HOME_ATTR)
  showElements(SELECTORS.progressElements, HIDDEN_HOME_ATTR)
}

const clearExploreBlocking = () => {
  showElements(SELECTORS.mainContent, HIDDEN_EXPLORE_ATTR)
  showElements(SELECTORS.exploreLayout, HIDDEN_EXPLORE_ATTR)
}

const clearLiveBlocking = () => {
  showElements(SELECTORS.livePageMainContainer, HIDDEN_LIVE_ATTR)
  restoreMediaInLivePages()
}

const applyHomeBlocking = () => {
  const columnListContainer = document.querySelector<HTMLElement>(
    SELECTORS.columnListContainer,
  )
  if (columnListContainer) {
    hideElement(columnListContainer, HIDDEN_HOME_ATTR)
    muteMediaInContainers([columnListContainer])
  }

  const progressIndicator = document.querySelector<HTMLElement>(
    SELECTORS.progressIndicator,
  )
  if (progressIndicator) {
    hideElement(progressIndicator, HIDDEN_HOME_ATTR)
  }

  hideElements(SELECTORS.feedNavigationContainer, HIDDEN_HOME_ATTR)
  hideElements(SELECTORS.progressElements, HIDDEN_HOME_ATTR)
}

const applyExploreBlocking = () => {
  const containers: Element[] = []
  const mainContent = document.querySelector<HTMLElement>(SELECTORS.mainContent)
  if (mainContent) {
    hideElement(mainContent, HIDDEN_EXPLORE_ATTR)
    containers.push(mainContent)
  }

  const exploreLayouts = document.querySelectorAll<HTMLElement>(
    SELECTORS.exploreLayout,
  )
  exploreLayouts.forEach(layout => {
    hideElement(layout, HIDDEN_EXPLORE_ATTR)
    containers.push(layout)
  })

  muteMediaInContainers(containers)
}

const applyLiveBlocking = () => {
  if (!isLivePage()) {
    return
  }

  hideElements(SELECTORS.livePageMainContainer, HIDDEN_LIVE_ATTR)
  muteMediaInLivePages()
}

const clearAllBlocking = () => {
  clearHomeBlocking()
  clearExploreBlocking()
  clearLiveBlocking()
}

const hasHomeTargets = () => {
  return (
    document.querySelector(SELECTORS.columnListContainer) !== null ||
    document.querySelector(SELECTORS.progressIndicator) !== null ||
    document.querySelectorAll(SELECTORS.feedNavigationContainer).length > 0 ||
    document.querySelectorAll(SELECTORS.progressElements).length > 0
  )
}

const hasExploreTargets = () => {
  return (
    document.querySelector(SELECTORS.mainContent) !== null ||
    document.querySelectorAll(SELECTORS.exploreLayout).length > 0
  )
}

const hasLiveTargets = () => {
  return (
    isLivePage() &&
    document.querySelectorAll(SELECTORS.livePageMainContainer).length > 0
  )
}

const getCurrentPageSection = (): PageSection | null => {
  if (hasLiveTargets()) {
    return 'live'
  }

  if (hasExploreTargets()) {
    return 'explore'
  }

  if (hasHomeTargets()) {
    return 'home'
  }

  return null
}

const getPageSectionLabel = (pageSection: PageSection) => {
  switch (pageSection) {
    case 'home':
      return 'Home'
    case 'explore':
      return 'Explore'
    case 'live':
      return 'Live'
  }
}

const shouldRenderOverlay = () => {
  const currentPageSection = getCurrentPageSection()
  if (currentPageSection === null) {
    return false
  }

  return settings[currentPageSection]
}

const applyCurrentSettings = () => {
  if (settings.home) {
    applyHomeBlocking()
  } else {
    clearHomeBlocking()
  }

  if (settings.explore) {
    applyExploreBlocking()
  } else {
    clearExploreBlocking()
  }

  if (settings.live) {
    applyLiveBlocking()
  } else {
    clearLiveBlocking()
  }

  if (shouldRenderOverlay()) {
    renderFeedOverlay()
  } else {
    removeFeedOverlay()
  }
}

const handleOverlayToggle = (event: Event) => {
  const currentPageSection = getCurrentPageSection()
  if (!currentPageSection) {
    return
  }

  const input = event.currentTarget as HTMLInputElement
  settings = syncActiveWithPages({
    ...settings,
    [currentPageSection]: input.checked,
  })
  saveSettings(settings)
  applyCurrentSettings()
}

const toggleCurrentPageBlock = () => {
  const currentPageSection = getCurrentPageSection()
  if (!currentPageSection) {
    return false
  }

  settings = syncActiveWithPages({
    ...settings,
    [currentPageSection]: !settings[currentPageSection],
  })
  saveSettings(settings)
  applyCurrentSettings()
  return true
}

const renderFeedOverlay = () => {
  const currentPageSection = getCurrentPageSection()
  if (!document.body || !currentPageSection || !isAnyPageActive(settings)) {
    removeFeedOverlay()
    return
  }

  ensureOverlayStyles()

  let overlay = document.getElementById(OVERLAY_ID)
  if (!overlay) {
    overlay = document.createElement('div')
    overlay.id = OVERLAY_ID
    overlay.innerHTML = `
      <p class="ttfb-title">TikTok Feed Blocker Extension</p>
      <div class="ttfb-toggle-row">
        <p id="${OVERLAY_TOGGLE_LABEL_ID}" class="ttfb-toggle-label"></p>
        <label class="ttfb-switch">
          <input id="${OVERLAY_TOGGLE_ID}" type="checkbox" />
          <span class="ttfb-slider"></span>
        </label>
      </div>
    `

    document.body.appendChild(overlay)

    const toggleInput = overlay.querySelector<HTMLInputElement>(
      `#${OVERLAY_TOGGLE_ID}`,
    )
    if (toggleInput) {
      toggleInput.addEventListener('change', handleOverlayToggle)
    }
  }

  const toggleLabel = overlay.querySelector<HTMLParagraphElement>(
    `#${OVERLAY_TOGGLE_LABEL_ID}`,
  )
  if (toggleLabel) {
    toggleLabel.textContent = `Block ${getPageSectionLabel(currentPageSection)}`
  }

  const toggleInput = overlay.querySelector<HTMLInputElement>(
    `#${OVERLAY_TOGGLE_ID}`,
  )
  if (toggleInput) {
    toggleInput.checked = settings[currentPageSection]
  }
}

const onRuntimeMessage: Parameters<
  typeof chrome.runtime.onMessage.addListener
>[0] = (message, _sender, sendResponse) => {
  if (isUpdateSettingsMessage(message)) {
    settings = normalizeSettings(message.settings, settings)
    applyCurrentSettings()

    sendResponse({ success: true })
    return false
  }

  if (isToggleCurrentPageBlockMessage(message)) {
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

  const settingsChange = changes[SETTINGS_STORAGE_KEY]
  if (!settingsChange) {
    return
  }

  settings = normalizeSettings(settingsChange.newValue, settings)
  applyCurrentSettings()
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
          setTimeout(() => {
            applyCurrentSettings()
          }, 100)
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
    applyCurrentSettings()
  }, 1000)
}

const init = () => {
  chrome.storage.local.get(
    [SETTINGS_STORAGE_KEY, LEGACY_ACTIVE_STORAGE_KEY],
    result => {
      settings = deriveSettingsFromStorage(
        result[SETTINGS_STORAGE_KEY],
        result[LEGACY_ACTIVE_STORAGE_KEY],
      )
      saveSettings(settings)
      applyCurrentSettings()
    },
  )

  chrome.runtime.onMessage.addListener(onRuntimeMessage)
  chrome.storage.onChanged.addListener(onStorageChanged)
  setupObserver()
  startBlockingLoop()
}

const cleanup = () => {
  chrome.runtime.onMessage.removeListener(onRuntimeMessage)
  chrome.storage.onChanged.removeListener(onStorageChanged)
  removeFeedOverlay()

  const style = document.getElementById(OVERLAY_STYLE_ID)
  if (style) {
    style.remove()
  }

  if (observer) {
    observer.disconnect()
    observer = null
  }

  if (intervalId !== null) {
    window.clearInterval(intervalId)
    intervalId = null
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true })
} else {
  init()
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    cleanup()
    clearAllBlocking()
  })
}
