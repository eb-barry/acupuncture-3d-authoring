import { describe, expect, it } from 'vitest'
import {
  IDLE_PIXEL_RATIO,
  IDLE_SHADOW_MAP_SIZE,
  ORBIT_IDLE_MS,
  ORBIT_PIXEL_RATIO,
  ORBIT_SHADOW_MAP_SIZE,
  clampPixelRatio,
  shouldUseFastOrbitView,
} from './orbitView.js'

describe('authoring orbit fast view', () => {
  it('caps pixel ratio at 1 while moving and 2 when idle', () => {
    expect(clampPixelRatio(3, true)).toBe(ORBIT_PIXEL_RATIO)
    expect(clampPixelRatio(3, false)).toBe(IDLE_PIXEL_RATIO)
    expect(clampPixelRatio(1, false)).toBe(1)
  })

  it('uses the cheaper shadow map while moving', () => {
    expect(ORBIT_SHADOW_MAP_SIZE).toBe(512)
    expect(IDLE_SHADOW_MAP_SIZE).toBe(2048)
    expect(ORBIT_SHADOW_MAP_SIZE).toBeLessThan(IDLE_SHADOW_MAP_SIZE)
  })

  it('stays in fast view while the pointer is down or damping is still changing', () => {
    expect(shouldUseFastOrbitView({ pointerDown: true, lastChangeAt: 0, now: 1000 })).toBe(true)
    expect(shouldUseFastOrbitView({
      pointerDown: false,
      lastChangeAt: 1000,
      now: 1000 + ORBIT_IDLE_MS - 1,
    })).toBe(true)
    expect(shouldUseFastOrbitView({
      pointerDown: false,
      lastChangeAt: 1000,
      now: 1000 + ORBIT_IDLE_MS + 1,
    })).toBe(false)
    expect(shouldUseFastOrbitView({ pointerDown: false, lastChangeAt: 0, now: 5000 })).toBe(false)
  })
})
