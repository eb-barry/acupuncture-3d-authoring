import { describe, expect, it } from 'vitest'
import {
  cameraFrontAlignment,
  cameraPoseFacingAxis,
  inferBodyFrontFromBounds,
  snapHorizontalToCardinal,
} from './frontLevel.js'

describe('front/back body facing helpers', () => {
  it('snaps horizontal directions to cardinal axes', () => {
    expect(snapHorizontalToCardinal([0.9, 0, 0.2])).toEqual([1, 0, 0])
    expect(snapHorizontalToCardinal([-0.1, 0, -0.8])).toEqual([0, 0, -1])
  })

  it('uses the thin depth axis, not left/right shoulder width', () => {
    // Male-like: wider X than Z, face protrudes toward -Z.
    expect(inferBodyFrontFromBounds(
      { x: 1.088, z: 0.334 },
      { maxAlong: 0.0975, minAlong: -0.1668, maxY: 1.3, minY: 1.42 },
    )).toEqual([0, 0, -1])

    // Female-like: wider X than Z, face protrudes toward +Z.
    expect(inferBodyFrontFromBounds(
      { x: 2.504, z: 0.762 },
      { maxAlong: 0.3795, minAlong: -0.2122, maxY: 3.8, minY: 3.2 },
    )).toEqual([0, 0, 1])
  })

  it('places the camera on the requested view axis', () => {
    const front = cameraPoseFacingAxis([0, 1, 0], [0, 0, -1], 2)
    expect(cameraFrontAlignment(front.position, front.target, [0, 0, -1]).aligned).toBe(true)
    expect(front.position[2]).toBeLessThan(0)

    const back = cameraPoseFacingAxis([0, 1, 0], [0, 0, 1], 2)
    expect(cameraFrontAlignment(back.position, back.target, [0, 0, 1]).aligned).toBe(true)
    expect(back.position[2]).toBeGreaterThan(0)
  })
})
