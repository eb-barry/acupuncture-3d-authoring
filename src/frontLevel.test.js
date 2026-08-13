import { describe, expect, it } from 'vitest'
import {
  cameraFrontAlignment,
  frontLevelBubbleOffset,
} from './frontLevel.js'

describe('front-facing level', () => {
  it('reports aligned when camera sits on the body forward axis', () => {
    const distance = 2
    const idealY = Math.tan(0.08) * distance
    const result = cameraFrontAlignment(
      [0, idealY, distance],
      [0, 0, 0],
      [0, 0, 1],
    )
    expect(result.aligned).toBe(true)
    expect(Math.abs(result.yawErr)).toBeLessThan(0.01)
    expect(Math.abs(result.pitchErr)).toBeLessThan(0.01)
  })

  it('detects yaw error when viewing from the side', () => {
    const result = cameraFrontAlignment(
      [2, 0.16, 0],
      [0, 0, 0],
      [0, 0, 1],
    )
    expect(result.aligned).toBe(false)
    expect(Math.abs(result.yawErr)).toBeGreaterThan(1)
  })

  it('maps errors into bubble offsets', () => {
    const center = frontLevelBubbleOffset(0, 0)
    expect(center.x).toBeCloseTo(0)
    expect(center.y).toBeCloseTo(0)
    expect(frontLevelBubbleOffset(Math.PI / 4, 0).x).toBeCloseTo(50)
    expect(frontLevelBubbleOffset(0, Math.PI / 6).y).toBeCloseTo(-50)
  })
})
