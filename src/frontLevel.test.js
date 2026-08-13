import { describe, expect, it } from 'vitest'
import {
  cameraFrontAlignment,
  cameraPoseFacingAxis,
  inferFrontFromHeadPoint,
  snapHorizontalToCardinal,
} from './frontLevel.js'

describe('front/back body facing helpers', () => {
  it('snaps horizontal directions to cardinal axes', () => {
    expect(snapHorizontalToCardinal([0.9, 0, 0.2])).toEqual([1, 0, 0])
    expect(snapHorizontalToCardinal([-0.1, 0, -0.8])).toEqual([0, 0, -1])
  })

  it('infers front from a protruding head/nose point', () => {
    expect(inferFrontFromHeadPoint([0, 1.7, 0.12], [0, 1, 0])).toEqual([0, 0, 1])
    expect(inferFrontFromHeadPoint([0, 1.7, -0.12], [0, 1, 0])).toEqual([0, 0, -1])
  })

  it('places the camera on the requested view axis', () => {
    const front = cameraPoseFacingAxis([0, 1, 0], [0, 0, 1], 2)
    expect(cameraFrontAlignment(front.position, front.target, [0, 0, 1]).aligned).toBe(true)
    expect(front.position[2]).toBeGreaterThan(0)

    const back = cameraPoseFacingAxis([0, 1, 0], [0, 0, -1], 2)
    expect(cameraFrontAlignment(back.position, back.target, [0, 0, -1]).aligned).toBe(true)
    expect(back.position[2]).toBeLessThan(0)
  })
})
