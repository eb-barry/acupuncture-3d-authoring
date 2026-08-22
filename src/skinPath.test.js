import { describe, expect, it } from 'vitest'
import {
  SKIN_LIFT,
  isHitOnWrapSide,
  isPointBehindSurface,
  marchStandoff,
  outwardWrapGuide,
  pixelWidthToWorldRadius,
  pruneBacktracking,
  isFacingLimbSpan,
  isShoulderAxillaWrap,
  pathFollowsFacingChord,
  pickPairAlongPolyline,
  shouldFrontWrap,
  slerpUnitVectors,
  surfaceStepLength,
  useConvexChordWrap,
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

  it('wraps perpendicular shoulder chords on the outer skin, not the palm way', () => {
    expect(useConvexChordWrap(0.5)).toBe(true)
    expect(useConvexChordWrap(0)).toBe(true)
    expect(useConvexChordWrap(-0.8)).toBe(false)
  })

  it('biases a 肩井→淵腋 chord in front of the chest, not behind the scapula', () => {
    const lateral = outwardWrapGuide([0.1, 1.28, 0.01], 0.12, { dropY: 0 })
    expect(lateral[0]).toBeGreaterThan(0.7)
    expect(Math.abs(lateral[2])).toBeLessThan(0.35)

    const shoulder = outwardWrapGuide([0.1, 1.28, 0.01], 0.12, { dropY: 0.24 })
    expect(shoulder[0]).toBeGreaterThan(0)
    expect(shoulder[2]).toBeGreaterThan(0.7)

    const neck = outwardWrapGuide([0.08, 1.45, -0.05], 0.09, { dropY: 0.16 })
    expect(neck[2]).toBeLessThan(0)
  })

  it('detects probes that sit behind an outward surface hit', () => {
    expect(isPointBehindSurface([0, 0, 0], [0.05, 0, 0], [1, 0, 0])).toBe(true)
    expect(isPointBehindSurface([0.08, 0, 0], [0.05, 0, 0], [1, 0, 0])).toBe(false)
    expect(isPointBehindSurface([0.051, 0, 0], [0.05, 0, 0], [1, 0, 0])).toBe(false)
  })

  it('keeps 肩井→淵腋 wrap samples on the front, not the scapula', () => {
    const jianjing = [0.12, 1.42, -0.02]
    const yuanye = [0.15, 1.18, 0.03]
    expect(shouldFrontWrap(jianjing, yuanye)).toBe(true)
    expect(shouldFrontWrap(jianjing, [0.11, 1.28, 0.08])).toBe(true)
    expect(isHitOnWrapSide([0.13, 1.30, 0.07], jianjing, yuanye)).toBe(true)
    expect(isHitOnWrapSide([0.13, 1.30, -0.09], jianjing, yuanye)).toBe(false)
    expect(isHitOnWrapSide([-0.13, 1.30, 0.07], jianjing, yuanye)).toBe(false)
  })

  it('treats 少海→靈道 as a straight inner-arm span, not a wrap through the limb', () => {
    const shaohai = [-0.22, 1.04, 0.02]
    const lingdao = [-0.24, 0.78, 0.01]
    expect(isFacingLimbSpan(shaohai, lingdao, 0.86)).toBe(true)
    expect(isShoulderAxillaWrap(shaohai, lingdao)).toBe(false)
    expect(isFacingLimbSpan([0.12, 1.42, -0.02], [0.15, 1.18, 0.03], 0.4)).toBe(false)
    expect(isFacingLimbSpan([-0.08, 0.49, -0.08], [-0.03, 0.90, 0.08], 0.5)).toBe(false)
    expect(pathFollowsFacingChord([
      shaohai,
      [-0.23, 0.91, 0.015],
      lingdao,
    ], shaohai, lingdao)).toBe(true)
    expect(pathFollowsFacingChord([
      shaohai,
      [0.22, 0.91, 0.02],
      lingdao,
    ], shaohai, lingdao)).toBe(false)
  })

  it('wraps 肩井→淵腋 without a geodesic, but keeps 陰谷→橫骨 on the thigh', () => {
    const jianjing = [0.12, 1.42, -0.02]
    const yuanye = [0.15, 1.18, 0.03]
    const ki10 = [-0.08, 0.49, -0.08]
    const ki11 = [-0.03, 0.90, 0.08]
    expect(isShoulderAxillaWrap(jianjing, yuanye)).toBe(true)
    expect(isShoulderAxillaWrap(jianjing, [0.13, 1.10, 0.04])).toBe(true)
    expect(isShoulderAxillaWrap(ki10, ki11)).toBe(false)
  })

  it('picks the tightest polyline span that contains the click', () => {
    expect(pickPairAlongPolyline(15, [0, 10, 20, 30])).toBe(1)
    expect(pickPairAlongPolyline(10, [0, 10, 20])).toBe(1)
    expect(pickPairAlongPolyline(6, [0, 20, 5, 8])).toBe(2)
    expect(pickPairAlongPolyline(50, [0, 10, 20])).toBe(-1)
  })
})
