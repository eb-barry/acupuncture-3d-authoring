/**
 * Locator drag / snap limits are per built-in body.
 * Male values stay the historical authoring units (~1.8 tall mesh).
 * Female values are for `female-character.glb` in its own framed world
 * (Maya export, stature ≈ 416); they are not a live multiple of the male set.
 */

export const MALE_HANDLE_LIMITS = {
  stretchMaxOffPath: 0.36,
  snapRadius: 0.4,
  projectRadius: 0.28,
  commitMinGap: 0.01,
  teHeadMinGap: 0.002,
  yPad: 0.22,
  midlineX: 0.035,
  mirrorMargin: 0.03,
  limbGapMinAbsX: 0.16,
  limbGapFloor: 0.05,
}

export const FEMALE_HANDLE_LIMITS = {
  stretchMaxOffPath: 86,
  snapRadius: 95,
  projectRadius: 67,
  commitMinGap: 2.4,
  teHeadMinGap: 0.5,
  yPad: 52,
  midlineX: 8,
  mirrorMargin: 7,
  limbGapMinAbsX: 38,
  limbGapFloor: 12,
}

export function handleLimitsForBody(body) {
  return body === 'female' ? FEMALE_HANDLE_LIMITS : MALE_HANDLE_LIMITS
}
