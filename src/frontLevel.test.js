import { describe, expect, it } from 'vitest'
import {
  cameraFrontAlignment,
  cameraPoseFacingForward,
} from './frontLevel.js'

describe('auto face-front camera pose', () => {
  it('places the camera on the body forward axis', () => {
    const pose = cameraPoseFacingForward([0, 1, 0], [0, 0, 1], 2)
    const alignment = cameraFrontAlignment(pose.position, pose.target, [0, 0, 1])
    expect(alignment.aligned).toBe(true)
    expect(pose.position[0]).toBeCloseTo(0)
    expect(pose.position[2]).toBeGreaterThan(0)
    expect(pose.up).toEqual([0, 1, 0])
  })

  it('supports a negative-Z facing model', () => {
    const pose = cameraPoseFacingForward([0, 1, 0], [0, 0, -1], 3)
    const alignment = cameraFrontAlignment(pose.position, pose.target, [0, 0, -1])
    expect(alignment.aligned).toBe(true)
    expect(pose.position[2]).toBeLessThan(0)
  })

  it('detects misalignment from a side view', () => {
    const result = cameraFrontAlignment(
      [2, 0.16, 0],
      [0, 0, 0],
      [0, 0, 1],
    )
    expect(result.aligned).toBe(false)
    expect(Math.abs(result.yawErr)).toBeGreaterThan(1)
  })
})
