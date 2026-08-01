import { type PageSection } from '../shared/settings'

export const HIDDEN_HOME_ATTR = 'data-ttfb-home-hidden'
export const HIDDEN_EXPLORE_ATTR = 'data-ttfb-explore-hidden'
export const HIDDEN_LIVE_ATTR = 'data-ttfb-live-hidden'

const HOME_COMMENT_SIDEBAR_SELECTORS = [
  '[class*="DivCommentSidebarTransitionWrapper"]',
  'section[class*="SectionCommentSidebarContainer"]',
] as const

export const SELECTORS = {
  mainContent: '#main-content-explore_page',
  progressIndicator: '.progress-js-inner',
  columnListContainer: '#column-list-container',
  homeCommentSidebar: `:is(${HOME_COMMENT_SIDEBAR_SELECTORS.join(', ')})`,
  exploreLayout:
    '[class*="DivShareLayoutBase-StyledShareLayoutV2-ExploreLayout"]',
  feedNavigationContainer: '[class*="DivFeedNavigationContainer"]',
  livePageMainContainer:
    ':is(#tiktok-live-main-container-id, div[class*="ejpasz60"])',
} as const

export const isLivePage = () => window.location.pathname.startsWith('/live')

export const hasHomeTargets = () => {
  return (
    document.querySelector(SELECTORS.columnListContainer) !== null ||
    document.querySelector(SELECTORS.progressIndicator) !== null ||
    document.querySelectorAll(SELECTORS.feedNavigationContainer).length > 0
  )
}

export const hasExploreTargets = () => {
  return (
    document.querySelector(SELECTORS.mainContent) !== null ||
    document.querySelectorAll(SELECTORS.exploreLayout).length > 0
  )
}

export const hasLiveTargets = () => {
  return (
    isLivePage() &&
    document.querySelectorAll(SELECTORS.livePageMainContainer).length > 0
  )
}

export const getCurrentPageSection = (): PageSection | null => {
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

export const getPageSectionLabel = (pageSection: PageSection) => {
  switch (pageSection) {
    case 'home':
      return 'Home'
    case 'explore':
      return 'Explore'
    case 'live':
      return 'Live'
  }
}
