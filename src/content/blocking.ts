import { type ExtensionSettings } from '../shared/settings'
import { hideElement, hideElements, showElements } from './dom'
import {
  muteMediaInContainers,
  muteMediaInLivePages,
  restoreMediaInLivePages,
} from './media'
import {
  removeFeedOverlay,
  renderFeedOverlay,
  type OverlayHandlers,
} from './overlay'
import {
  getCurrentPageSection,
  HIDDEN_EXPLORE_ATTR,
  HIDDEN_HOME_ATTR,
  HIDDEN_LIVE_ATTR,
  isLivePage,
  SELECTORS,
} from './selectors'

export const clearHomeBlocking = () => {
  showElements(SELECTORS.columnListContainer, HIDDEN_HOME_ATTR)
  showElements(SELECTORS.progressIndicator, HIDDEN_HOME_ATTR)
  showElements(SELECTORS.homeCommentSidebar, HIDDEN_HOME_ATTR)
  showElements(SELECTORS.feedNavigationContainer, HIDDEN_HOME_ATTR)
  showElements(SELECTORS.progressElements, HIDDEN_HOME_ATTR)
}

export const clearExploreBlocking = () => {
  showElements(SELECTORS.mainContent, HIDDEN_EXPLORE_ATTR)
  showElements(SELECTORS.exploreLayout, HIDDEN_EXPLORE_ATTR)
}

export const clearLiveBlocking = () => {
  showElements(SELECTORS.livePageMainContainer, HIDDEN_LIVE_ATTR)
  restoreMediaInLivePages()
}

export const applyHomeBlocking = () => {
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
  hideElements(SELECTORS.homeCommentSidebar, HIDDEN_HOME_ATTR)
}

export const applyExploreBlocking = () => {
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

export const applyLiveBlocking = () => {
  if (!isLivePage()) {
    return
  }

  hideElements(SELECTORS.livePageMainContainer, HIDDEN_LIVE_ATTR)
  muteMediaInLivePages()
}

export const clearAllBlocking = () => {
  clearHomeBlocking()
  clearExploreBlocking()
  clearLiveBlocking()
}

const shouldRenderOverlay = () => {
  const currentPageSection = getCurrentPageSection()
  return currentPageSection !== null
}

export const applyCurrentSettings = (
  settings: ExtensionSettings,
  handlers: OverlayHandlers,
) => {
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
    renderFeedOverlay(settings, handlers)
  } else {
    removeFeedOverlay()
  }
}
