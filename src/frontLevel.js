/** Ideal slight elevation above the horizontal when viewing the front. */
export const IDEAL_FRONT_ELEVATION = 0.08

/** Radians — body faces camera closely enough for midline placement. */
export const FRONT_YAW_TOLERANCE = 0.08
export const FRONT_PITCH_TOLERANCE = 0.1

/**
 * Yaw / pitch error of the camera relative to a body forward axis.
 * yawErr = 0 and pitchErr ≈ 0 means the body faces the screen squarely.
 */
export function cameraFrontAlignment(
  cameraPosition,
  target,
  bodyForward,
  {
    idealElevation = IDEAL_FRONT_ELEVATION,
    yawTolerance = FRONT_YAW_TOLERANCE,
    pitchTolerance = FRONT_PITCH_TOLERANCE,
  } = {},
) {
  const toCam = [
    cameraPosition[0] - target[0],
    cameraPosition[1] - target[1],
    cameraPosition[2] - target[2],
  ]
  const horiz = [toCam[0], 0, toCam[2]]
  const horizLen = Math.hypot(horiz[0], horiz[2]) || 1e-6
  const horizDir = [horiz[0] / horizLen, horiz[2] / horizLen]

  const forwardH = [bodyForward[0], bodyForward[2]]
  const forwardLen = Math.hypot(forwardH[0], forwardH[1]) || 1e-6
  const forwardDir = [forwardH[0] / forwardLen, forwardH[1] / forwardLen]

  const dot = forwardDir[0] * horizDir[0] + forwardDir[1] * horizDir[1]
  const cross = forwardDir[0] * horizDir[1] - forwardDir[1] * horizDir[0]
  const yawErr = Math.atan2(cross, dot)
  const elevation = Math.atan2(toCam[1], horizLen)
  const pitchErr = elevation - idealElevation
  const aligned = Math.abs(yawErr) <= yawTolerance && Math.abs(pitchErr) <= pitchTolerance

  return { yawErr, pitchErr, elevation, aligned }
}

/** Map alignment errors to gauge bubble offsets in percent (-50 … 50). */
export function frontLevelBubbleOffset(yawErr, pitchErr, {
  yawScale = Math.PI / 4,
  pitchScale = Math.PI / 6,
} = {}) {
  const clamp = (value) => Math.max(-1, Math.min(1, value))
  return {
    x: clamp(yawErr / yawScale) * 50,
    y: clamp(-pitchErr / pitchScale) * 50,
  }
}
