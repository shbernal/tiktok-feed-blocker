import path from 'node:path'

const defaultProfilePath = '.e2e/tiktok-real-profile'

export const resolveRealTikTokProfilePath = () => {
  return path.resolve(
    process.cwd(),
    process.env.TIKTOK_REAL_PROFILE_DIR ?? defaultProfilePath,
  )
}
