import { isLivePage } from './selectors'

// The three attributes are written together and read together: restore bails
// unless all three are present, so a partial write would strand the element in
// a muted state with no way back.
const MEDIA_PREVIOUS_MUTED_ATTR = 'data-ttfb-previous-muted'
const MEDIA_PREVIOUS_VOLUME_ATTR = 'data-ttfb-previous-volume'
const MEDIA_PREVIOUS_PAUSED_ATTR = 'data-ttfb-previous-paused'

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

export const restoreMediaInContainers = (containers: Element[]) => {
  containers.forEach(container => {
    container
      .querySelectorAll<HTMLMediaElement>('video, audio')
      .forEach(media => {
        restoreManagedMedia(media)
      })
  })
}

export const muteMediaInContainers = (containers: Element[]) => {
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

// Live pages mute document-wide rather than per hidden container: the player
// can sit outside the container the live selectors match. `querySelectorAll`
// skips the container itself, which is harmless here because media are always
// descendants of `documentElement`.
const livePageMediaContainers = () => {
  return isLivePage() ? [document.documentElement] : []
}

export const muteMediaInLivePages = () => {
  muteMediaInContainers(livePageMediaContainers())
}

export const restoreMediaInLivePages = () => {
  restoreMediaInContainers(livePageMediaContainers())
}
