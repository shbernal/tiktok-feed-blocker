import { describe, expect, it } from 'vitest'
import { isTikTokUrl } from './tiktok'

describe('isTikTokUrl', () => {
  it('accepts TikTok hostnames', () => {
    expect(isTikTokUrl('https://tiktok.com/')).toBe(true)
    expect(isTikTokUrl('https://www.tiktok.com/@account')).toBe(true)
    expect(isTikTokUrl('https://m.tiktok.com/foryou')).toBe(true)
  })

  it('rejects missing, invalid, and non-TikTok URLs', () => {
    expect(isTikTokUrl(undefined)).toBe(false)
    expect(isTikTokUrl('not a url')).toBe(false)
    expect(isTikTokUrl('https://example.com/')).toBe(false)
    expect(isTikTokUrl('https://not-tiktok.com/')).toBe(false)
  })
})
