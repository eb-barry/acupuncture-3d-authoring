import { describe, expect, it } from 'vitest'
import {
  SKIN_LIFT,
  segmentInflate,
  segmentSampleCount,
  slerpUnitVectors,
} from './skinPath.js'

describe('skin path wrapping', () => {
  it('slerps nearly-opposite normals toward a hint side (palm wrap)', () => {
    const dorsum = [0, 0, 1]
    const palm = [0, 0, -1]
    const towardThumb = [1, 0, 0]
    const mid = slerpUnitVectors(dorsum, palm, 0.5, towardThumb)
    // Mid guide should point sideways, not collapse to zero / flip randomly.
    expect(Math.hypot(...mid)).toBeCloseTo(1, 5)
    expect(Math.abs(mid[0])).toBeGreaterThan(0.7)
    expect(Math.abs(mid[2])).toBeLessThan(0.35)
  })

  it('uses denser samples and taller inflate when normals oppose', () => {
    expect(segmentSampleCount(0.08, -0.8)).toBeGreaterThan(segmentSampleCount(0.08, 0.95))
    expect(segmentInflate(0.5, -1)).toBeGreaterThan(segmentInflate(0.5, 1))
    expect(segmentInflate(0, -1)).toBeLessThan(segmentInflate(0.5, -1))
  })

  it('keeps a small positive skin lift constant', () => {
    expect(SKIN_LIFT).toBeGreaterThan(0)
    expect(SKIN_LIFT).toBeLessThan(0.02)
  })
})
