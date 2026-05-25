const TIKTOK_HOST_SUFFIX = '.tiktok.com'

export const isTikTokUrl = (value: string | undefined) => {
  if (!value) {
    return false
  }

  try {
    const url = new URL(value)
    return (
      url.hostname === 'tiktok.com' || url.hostname.endsWith(TIKTOK_HOST_SUFFIX)
    )
  } catch {
    return false
  }
}
