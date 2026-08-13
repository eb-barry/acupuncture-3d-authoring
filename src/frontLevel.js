/** Ideal slight elevation above the horizontal when viewing the front. */
export const IDEAL_FRONT_ELEVATION = 0.08

/**
 * Camera pose that looks straight at the body front (no yaw/roll skew).
 * `bodyForward` is the outward front axis of the model in world space.
 */
export function cameraPoseFacingForward(target, bodyForward, distance, {
  idealElevation = IDEAL_FRONT_ELEVATION,
} = {}) {
  const forward = [bodyForward[0], 0, bodyForward[2]]
  const forwardLen = Math.hypot(forward[0], forward[2]) || 1
  const dir = [forward[0] / forwardLen, forward[2] / forwardLen]
  const safeDistance = Math.max(distance, 0.05)
  const horizDist = safeDistance * Math.cos(idealElevation)
  const yOff = safeDistance * Math.sin(idealElevation)
  return {
    position: [
      target[0] + dir[0] * horizDist,
      target[1] + yOff,
      target[2] + dir[1] * horizDist,
    ],
    target: [target[0], target[1], target[2]],
    up: [0, 1, 0],
  }
}

/**
 * Yaw / pitch error of the camera relative to a body forward axis.
 * Used to verify an auto face-front pose.
 */
export function cameraFrontAlignment(
  cameraPosition,
  target,
  bodyForward,
  {
    idealElevation = IDEAL_FRONT_ELEVATION,
    yawTolerance = 0.08,
    pitchTolerance = 0.1,
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
