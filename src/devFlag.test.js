import { describe, expect, it } from 'vitest'
import { isDevMode } from './devFlag.js'

describe('isDevMode', () => {
  it('is false when Vite env is missing (GitHub Pages / raw ESM)', () => {
    expect(isDevMode(undefined)).toBe(false)
    expect(isDevMode(null)).toBe(false)
    expect(isDevMode({})).toBe(false)
  })

  it('is true only when Vite sets DEV', () => {
    expect(isDevMode({ DEV: true })).toBe(true)
    expect(isDevMode({ DEV: false })).toBe(false)
  })
})
