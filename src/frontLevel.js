/** Ideal slight elevation above the horizontal when viewing front/back. */
export const IDEAL_FRONT_ELEVATION = 0.08

/** Snap a horizontal direction to the nearest ±X / ±Z cardinal axis. */
export function snapHorizontalToCardinal(direction) {
  const x = direction[0] || 0
  const z = direction[2] ?? direction[1] ?? 0
  if (Math.abs(x) >= Math.abs(z)) {
    return [Math.sign(x) || 1, 0, 0]
  }
  return [0, 0, Math.sign(z) || 1]
}

/**
 * Infer anatomical front from body proportions + midline head extremes.
 * Humanoids are wider across the shoulders (X) than front-to-back (Z), so the
 * thinner horizontal axis is depth. Front is the more protruding midline side
 * of the head/face (nose), not the ears.
 *
 * Note: stylized heads can protrude farther at the occiput than the nose, so
 * callers should prefer {@link inferBodyFrontFromNormalVote} when normals are
 * available, and authored `frontAxis` for known built-in assets.
 *
 * @param {{ x: number, z: number }} size horizontal bounding size
 * @param {{ maxAlong: number, minAlong: number, maxY: number, minY: number }} extremes
 *        depth-axis extremes among near-midline upper-body samples
 */
export function inferBodyFrontFromBounds(size, extremes) {
  const depthIsZ = size.z <= size.x
  const absMax = Math.abs(extremes.maxAlong)
  const absMin = Math.abs(extremes.minAlong)
  let frontSign
  if (absMax > absMin * 1.05) {
    frontSign = Math.sign(extremes.maxAlong) || 1
  } else if (absMin > absMax * 1.05) {
    frontSign = Math.sign(extremes.minAlong) || -1
  } else {
    // Nearly symmetric depth: prefer the higher sample (face over occiput).
    frontSign = extremes.maxY >= extremes.minY
      ? (Math.sign(extremes.maxAlong) || 1)
      : (Math.sign(extremes.minAlong) || -1)
  }
  return depthIsZ ? [0, 0, frontSign] : [frontSign, 0, 0]
}

/**
 * Infer front from midline depth-normal votes (faces point outward).
 * Returns null when the vote is too weak / tied.
 *
 * @param {{ x: number, z: number }} size
 * @param {{ pos: number, neg: number }} vote counts of normals with |n_depth| > threshold
 */
export function inferBodyFrontFromNormalVote(size, vote, {
  minSamples = 80,
  majorityRatio = 0.55,
} = {}) {
  const depthIsZ = size.z <= size.x
  const pos = Number(vote?.pos) || 0
  const neg = Number(vote?.neg) || 0
  const total = pos + neg
  if (total < minSamples || pos === neg) return null
  const winner = pos > neg ? pos : neg
  if (winner / total < majorityRatio) return null
  const frontSign = pos > neg ? 1 : -1
  return depthIsZ ? [0, 0, frontSign] : [frontSign, 0, 0]
}

/**
 * Camera pose that looks straight along a body axis (front or back).
 * `viewAxis` is the outward axis the camera should sit on.
 */
export function cameraPoseFacingAxis(target, viewAxis, distance, {
  idealElevation = IDEAL_FRONT_ELEVATION,
} = {}) {
  const axis = [viewAxis[0], 0, viewAxis[2] ?? viewAxis[1] ?? 0]
  const axisLen = Math.hypot(axis[0], axis[2]) || 1
  const dir = [axis[0] / axisLen, axis[2] / axisLen]
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

/** @deprecated use cameraPoseFacingAxis */
export function cameraPoseFacingForward(target, bodyForward, distance, options) {
  return cameraPoseFacingAxis(target, bodyForward, distance, options)
}

/**
 * Yaw / pitch error of the camera relative to a body view axis.
 * Used to verify an auto face-front / face-back pose.
 */
export function cameraFrontAlignment(
  cameraPosition,
  target,
  viewAxis,
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

  const axisH = [viewAxis[0], viewAxis[2] ?? viewAxis[1] ?? 0]
  const axisLen = Math.hypot(axisH[0], axisH[1]) || 1e-6
  const axisDir = [axisH[0] / axisLen, axisH[1] / axisLen]

  const dot = axisDir[0] * horizDir[0] + axisDir[1] * horizDir[1]
  const cross = axisDir[0] * horizDir[1] - axisDir[1] * horizDir[0]
  const yawErr = Math.atan2(cross, dot)
  const elevation = Math.atan2(toCam[1], horizLen)
  const pitchErr = elevation - idealElevation
  const aligned = Math.abs(yawErr) <= yawTolerance && Math.abs(pitchErr) <= pitchTolerance

  return { yawErr, pitchErr, elevation, aligned }
}
