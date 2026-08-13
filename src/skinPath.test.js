import { describe, expect, it } from 'vitest'
import {
  SKIN_LIFT,
  pixelWidthToWorldRadius,
  segmentSampleCount,
  segmentStandoff,
  slerpUnitVectors,
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

  it('uses denser samples and taller standoff when normals oppose', () => {
    expect(segmentSampleCount(0.08, -0.8)).toBeGreaterThan(segmentSampleCount(0.08, 0.95))
    expect(segmentStandoff(0.5, -1)).toBeGreaterThan(segmentStandoff(0.5, 1))
    expect(segmentStandoff(0, -1)).toBeLessThan(segmentStandoff(0.5, -1))
  })

  it('keeps a modest skin lift and maps pixel width to screen-proportional radius', () => {
    expect(SKIN_LIFT).toBeGreaterThan(0.005)
    expect(SKIN_LIFT).toBeLessThan(0.03)
    const near = pixelWidthToWorldRadius(4, 0.6, 40, 800)
    const far = pixelWidthToWorldRadius(4, 6, 40, 800)
    expect(near).toBeLessThan(far)
    expect(pixelWidthToWorldRadius(8, 2, 40, 800))
      .toBeCloseTo(pixelWidthToWorldRadius(4, 2, 40, 800) * 2, 5)
  })
})
