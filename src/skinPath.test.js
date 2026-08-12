import { describe, expect, it } from 'vitest'
import {
  SKIN_LIFT,
  marchStandoff,
  routeShouldBeVisible,
  segmentInflate,
  segmentSampleCount,
  slerpUnitVectors,
  surfaceStepLength,
} from './skinPath.js'

describe('skin path wrapping', () => {
  it('slerps nearly-opposite normals toward a hint side (palm wrap)', () => {
    const dorsum = [0, 0, 1]
    const palm = [0, 0, -1]
    const towardThumb = [1, 0, 0]
    const mid = slerpUnitVectors(dorsum, palm, 0.5, towardThumb)
    expect(Math.hypot(...mid)).toBeCloseTo(1, 5)
    expect(Math.abs(mid[0])).toBeGreaterThan(0.7)
    expect(Math.abs(mid[2])).toBeLessThan(0.35)
  })

  it('uses denser samples and taller inflate when normals oppose', () => {
    expect(segmentSampleCount(0.08, -0.8)).toBeGreaterThan(segmentSampleCount(0.08, 0.95))
    expect(segmentInflate(0.5, -1)).toBeGreaterThan(segmentInflate(0.5, 1))
    expect(marchStandoff(0.5, -1)).toBeGreaterThan(marchStandoff(0.5, 1))
    expect(surfaceStepLength(0.2, -1)).toBeLessThanOrEqual(surfaceStepLength(0.2, 1) + 1e-9)
  })

  it('keeps a small positive skin lift constant', () => {
    expect(SKIN_LIFT).toBeGreaterThan(0)
    expect(SKIN_LIFT).toBeLessThan(0.02)
  })

  it('hides routes until enough nodes face the camera', () => {
    expect(routeShouldBeVisible(0, 11)).toBe(false)
    expect(routeShouldBeVisible(1, 11)).toBe(false)
    expect(routeShouldBeVisible(3, 11)).toBe(true)
    expect(routeShouldBeVisible(1, 3)).toBe(true)
  })
})
