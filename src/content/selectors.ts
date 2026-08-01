import { type PageSection } from '../shared/settings'

const HOME_COMMENT_SIDEBAR_SELECTORS = [
  '[class*="DivCommentSidebarTransitionWrapper"]',
  'section[class*="SectionCommentSidebarContainer"]',
] as const

// TikTok interpolates a per-build hash between styled-component name segments
// (`css-9bjk8h-7937d88b--DivShareLayoutBase-7937d88b--StyledShareLayoutV2`), so
// a `[class*=...]` selector may only ever name one segment. Two joined by `-`
// cannot match on a real page, whatever the fixtures say.
export const SELECTORS = {
  mainContent: '#main-content-explore_page',
  progressIndicator: '.progress-js-inner',
  columnListContainer: '#column-list-container',
  homeCommentSidebar: `:is(${HOME_COMMENT_SIDEBAR_SELECTORS.join(', ')})`,
  feedNavigationContainer: '[class*="DivFeedNavigationContainer"]',
  livePageMainContainer: '#tiktok-live-main-container-id',
} as const

export const isLivePage = () => window.location.pathname.startsWith('/live')

// Opening a video from the Explore grid pushes `/@user/video/<id>` and renders
// the player in a modal, but leaves `#main-content-explore_page` mounted,
// visible and full size behind it. The container alone therefore does not mean
// the Explore grid is the page in front of the user, and without this gate the
// video page offers a "Block Explore" button that hides a grid nobody can see.
//
// Home gets no equivalent gate on purpose: the For You feed rewrites the URL to
// `/@user/video/<id>` as it scrolls, so gating it would drop the overlay on the
// feed itself.
const isExplorePage = () => window.location.pathname.startsWith('/explore')

export const hasHomeTargets = () => {
  return (
    document.querySelector(SELECTORS.columnListContainer) !== null ||
    document.querySelector(SELECTORS.progressIndicator) !== null ||
    document.querySelectorAll(SELECTORS.feedNavigationContainer).length > 0
  )
}

export const hasExploreTargets = () => {
  return (
    isExplorePage() && document.querySelector(SELECTORS.mainContent) !== null
  )
}

export const hasLiveTargets = () => {
  return (
    isLivePage() &&
    document.querySelector(SELECTORS.livePageMainContainer) !== null
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
