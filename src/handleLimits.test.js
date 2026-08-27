import { describe, expect, it } from 'vitest'
import { FEMALE_HANDLE_LIMITS, MALE_HANDLE_LIMITS, handleLimitsForBody } from './handleLimits.js'
import { isProbeOnSameLimbSegment } from './workflow.js'

describe('per-body locator drag limits', () => {
  it('keeps male limits on the original authoring units', () => {
    expect(handleLimitsForBody('male')).toBe(MALE_HANDLE_LIMITS)
    expect(MALE_HANDLE_LIMITS.stretchMaxOffPath).toBe(0.36)
    expect(MALE_HANDLE_LIMITS.snapRadius).toBe(0.4)
  })

  it('uses a separate female table, not a male×stature product', () => {
    expect(handleLimitsForBody('female')).toBe(FEMALE_HANDLE_LIMITS)
    expect(FEMALE_HANDLE_LIMITS.stretchMaxOffPath).toBe(86)
    expect(FEMALE_HANDLE_LIMITS.snapRadius).toBe(95)
    expect(FEMALE_HANDLE_LIMITS).not.toBe(MALE_HANDLE_LIMITS)
  })

  it('accepts a female-scale arm stretch only with female limits', () => {
    const rest = [[-52, 238, 12], [-48, 190, 10]]
    const pulled = [-66, 214, 19]
    expect(isProbeOnSameLimbSegment(rest, pulled, MALE_HANDLE_LIMITS.stretchMaxOffPath, MALE_HANDLE_LIMITS))
      .toBe(false)
    expect(isProbeOnSameLimbSegment(rest, pulled, FEMALE_HANDLE_LIMITS.stretchMaxOffPath, FEMALE_HANDLE_LIMITS))
      .toBe(true)
  })
})
