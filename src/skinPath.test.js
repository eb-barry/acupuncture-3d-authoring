import { describe, expect, it } from 'vitest'
import {
  SKIN_LIFT,
  marchStandoff,
  pixelWidthToWorldRadius,
  pruneBacktracking,
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

  it('uses tighter steps/standoff on wrap segments', () => {
    expect(surfaceStepLength(0.08, -0.8)).toBeLessThan(surfaceStepLength(0.08, 0.95))
    expect(marchStandoff(-1)).toBeGreaterThan(marchStandoff(1))
    expect(marchStandoff(-1)).toBeLessThan(0.06)
  })

  it('keeps a small skin lift and maps pixel width proportionally', () => {
    expect(SKIN_LIFT).toBeGreaterThan(0.001)
    expect(SKIN_LIFT).toBeLessThan(0.008)
    const near = pixelWidthToWorldRadius(4, 0.6, 40, 800)
    const far = pixelWidthToWorldRadius(4, 6, 40, 800)
    expect(near).toBeLessThan(far)
  })

  it('prunes back-tracking spikes on palm paths', () => {
    const end = [0, 0, 0]
    const points = [
      [0, 0, 1],
      [0, 0.02, 0.8],
      [0, 0.2, 0.9], // spike away from end
      [0, 0.04, 0.5],
      [0, 0, 0],
    ]
    const cleaned = pruneBacktracking(points, end)
    expect(cleaned.length).toBeLessThan(points.length)
    expect(cleaned[0]).toEqual(points[0])
    expect(cleaned[cleaned.length - 1]).toEqual(points[points.length - 1])
  })
})
