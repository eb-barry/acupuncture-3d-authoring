/** Skin-following helpers for meridian polylines (no Three.js dependency). */

/** Tiny lift so tubes clear the mesh without looking floaty. */
export const SKIN_LIFT = 0.0055

/**
 * Unit-vector slerp. When a and b are nearly opposite (palm ↔ dorsum),
 * `hint` picks which way to wrap around the limb.
 */
export function slerpUnitVectors(a, b, t, hint = [0, 1, 0]) {
  const clamp01 = (value) => Math.min(1, Math.max(0, value))
  const tt = clamp01(t)
  const na = normalize(a)
  const nb = normalize(b)
  const dot = dot3(na, nb)

  if (dot > 0.9995) return normalize(lerp3(na, nb, tt))

  if (dot < -0.95) {
    let axis = normalize(cross(na, hint))
    if (length3(axis) < 1e-6) axis = normalize(cross(na, [0, 1, 0]))
    if (length3(axis) < 1e-6) axis = normalize(cross(na, [1, 0, 0]))
    const mid = normalize(cross(axis, na))
    if (dot3(mid, nb) < 0) axis = scale3(axis, -1)
    const angle = Math.acos(Math.min(1, Math.max(-1, dot))) * tt
    return normalize(add3(scale3(na, Math.cos(angle)), scale3(normalize(cross(axis, na)), Math.sin(angle))))
  }

  const theta = Math.acos(Math.min(1, Math.max(-1, dot))) * tt
  const relative = normalize(add3(nb, scale3(na, -dot)))
  return normalize(add3(scale3(na, Math.cos(theta)), scale3(relative, Math.sin(theta))))
}

/** Step length while marching on skin between two nodes. */
export function surfaceStepLength(distance, normalDot) {
  const wrap = Math.max(0, 1 - normalDot)
  // Smaller steps on wrap segments (手掌魚際) keep a single clean arc.
  return Math.min(0.007, Math.max(0.0022, distance / (28 + wrap * 40)))
}

/** Tight outside cast while marching — large enough to leave the surface, not the limb. */
export function marchStandoff(normalDot) {
  const wrap = Math.max(0, 1 - normalDot)
  return 0.026 + wrap * 0.012
}

/**
 * Convert UI pixel line width to world-space tube radius at a camera distance.
 * Matches on-screen stroke width: diameter ≈ pixelWidth px.
 */
export function pixelWidthToWorldRadius(pixelWidth, distance, fovDeg, viewportHeight) {
  const height = Math.max(Number(viewportHeight) || 1, 1)
  const fov = (Number(fovDeg) || 45) * Math.PI / 180
  const worldPerPixel = (2 * Math.max(Number(distance) || 0.01, 0.01) * Math.tan(fov / 2)) / height
  return Math.max(0.00035, (Number(pixelWidth) || 4) * worldPerPixel * 0.5)
}

/** @deprecated */
export function meridianTubeRadius(lineWidth) {
  return pixelWidthToWorldRadius(lineWidth, 2.4, 40, 820)
}

/** @deprecated chord-sample helpers kept for older tests */
export function segmentSampleCount(distance, normalDot) {
  const wrap = Math.max(0, 1 - normalDot)
  return Math.max(16, Math.ceil(distance / surfaceStepLength(distance, normalDot)) + Math.ceil(wrap * 24))
}

/** @deprecated */
export function segmentStandoff(t, normalDot) {
  const wrap = Math.max(0, 1 - normalDot)
  const arch = Math.sin(Math.PI * Math.min(1, Math.max(0, t)))
  return marchStandoff(normalDot) + wrap * 0.04 * arch
}

/**
 * Drop back-tracking spikes that create spaghetti around palm wraps.
 * points/end are [x,y,z] arrays.
 */
export function pruneBacktracking(points, end) {
  if (points.length < 4) return points
  const cleaned = [points[0]]
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = cleaned[cleaned.length - 1]
    const curr = points[i]
    const next = points[i + 1]
    const toCurr = [curr[0] - prev[0], curr[1] - prev[1], curr[2] - prev[2]]
    const toNext = [next[0] - curr[0], next[1] - curr[1], next[2] - curr[2]]
    const len1 = length3(toCurr)
    const len2 = length3(toNext)
    if (len1 < 1e-6) continue
    const dot = (toCurr[0] * toNext[0] + toCurr[1] * toNext[1] + toCurr[2] * toNext[2]) / (len1 * Math.max(len2, 1e-6))
    const distPrev = length3([end[0] - prev[0], end[1] - prev[1], end[2] - prev[2]])
    const distCurr = length3([end[0] - curr[0], end[1] - curr[1], end[2] - curr[2]])
    // Skip spikes that reverse and move away from the destination.
    if (dot < -0.25 && distCurr > distPrev + 0.002) continue
    cleaned.push(curr)
  }
  cleaned.push(points[points.length - 1])
  return cleaned
}

/**
 * Opposite-normal palm wraps still march. Perpendicular convex wraps
 * (肩井→淵腋) snap the interior chord onto the outer skin.
 */
export function useConvexChordWrap(normalDot) {
  return Number(normalDot) > -0.05
}

/**
 * Push an interior chord sample toward the outer silhouette.
 * 肩井→淵腋 drops through the shoulder mass; bias anterior (+Z) so the
 * line rides the front of the chest instead of the back of the scapula.
 */
export function outwardWrapGuide(chordPoint = [0, 0, 0], sideX = 0, { dropY = 0 } = {}) {
  const x = Number(chordPoint[0])
  const z = Number(chordPoint[2])
  const lateral = Number.isFinite(sideX) && Math.abs(sideX) > 1e-6
    ? Math.sign(sideX)
    : (Number.isFinite(x) && Math.abs(x) > 1e-6 ? Math.sign(x) : 1)
  let gx = Number.isFinite(x) ? x : lateral * 0.08
  let gz = Number.isFinite(z) ? z : 0
  if (Math.hypot(gx, gz) < 1e-5) gx = lateral
  // Through-shoulder (lateral, not already behind the neck): go in front.
  const throughShoulder = Number(dropY) > 0.1 && Math.abs(gx) > 0.09 && gz > -0.035
  if (throughShoulder) gz += 0.55
  return normalize([gx, 0, gz])
}

/** 肩井→淵腋 and front-chest locators should wrap on the anterior skin. */
export function shouldFrontWrap(from = [0, 0, 0], to = [0, 0, 0]) {
  const dropY = Math.abs((Number(from[1]) || 0) - (Number(to[1]) || 0))
  const meanX = ((Number(from[0]) || 0) + (Number(to[0]) || 0)) / 2
  const meanZ = ((Number(from[2]) || 0) + (Number(to[2]) || 0)) / 2
  const maxZ = Math.max(Number(from[2]) || 0, Number(to[2]) || 0)
  if (maxZ > 0.04 || meanZ > 0.015) return true
  return dropY > 0.1 && Math.abs(meanX) > 0.09 && meanZ > -0.035
}

/**
 * 肩井→淵腋 lives in the upper torso. A* through the armpit crease
 * freezes the tab; wrap the chord onto the front skin instead.
 * 陰谷→橫骨 is lower on the thigh and must keep the geodesic.
 */
export function isShoulderAxillaWrap(from = [0, 0, 0], to = [0, 0, 0]) {
  if (!shouldFrontWrap(from, to)) return false
  const minY = Math.min(Number(from[1]) || 0, Number(to[1]) || 0)
  const maxY = Math.max(Number(from[1]) || 0, Number(to[1]) || 0)
  const dropY = Math.abs((Number(from[1]) || 0) - (Number(to[1]) || 0))
  const meanX = ((Number(from[0]) || 0) + (Number(to[0]) || 0)) / 2
  return minY > 0.88 && maxY > 1.08 && dropY > 0.04 && Math.abs(meanX) > 0.07
}

/**
 * Pick the tightest acupoint pair whose polyline span contains `clickIndex`.
 * `nodeIndexes[i]` is the sample index of pair i's start; the last value is
 * the final acupoint. Prefer the smallest span so a click on a short segment
 * is not swallowed by a longer neighbour.
 */
export function pickPairAlongPolyline(clickIndex, nodeIndexes = []) {
  if (!nodeIndexes.length || clickIndex == null) return -1
  let best = -1
  let bestSpan = Infinity
  for (let index = 0; index < nodeIndexes.length - 1; index += 1) {
    const lo = Math.min(nodeIndexes[index], nodeIndexes[index + 1])
    const hi = Math.max(nodeIndexes[index], nodeIndexes[index + 1])
    if (clickIndex < lo || clickIndex > hi) continue
    const span = Math.max(1, hi - lo)
    if (span <= bestSpan) {
      bestSpan = span
      best = index
    }
  }
  return best
}

/**
 * Reject a wrap sample that jumped onto the scapula / opposite laterality
 * and would tunnel through the shoulder.
 */
export function isHitOnWrapSide(hit = [0, 0, 0], from = [0, 0, 0], to = [0, 0, 0]) {
  const hitX = Number(hit[0])
  const hitZ = Number(hit[2])
  if (!Number.isFinite(hitX) || !Number.isFinite(hitZ)) return false
  const side = Math.sign(((Number(from[0]) || 0) + (Number(to[0]) || 0)) / 2) || Math.sign(hitX) || 1
  if (side * hitX < 0 && Math.abs(hitX) > 0.04) return false
  if (!shouldFrontWrap(from, to)) return true
  const minZ = Math.min(Number(from[2]) || 0, Number(to[2]) || 0)
  const meanZ = ((Number(from[2]) || 0) + (Number(to[2]) || 0)) / 2
  const floor = Math.min(minZ, meanZ) - 0.025
  return hitZ >= floor
}

/** True when `probe` sits inside the mesh relative to a surface hit. */
export function isPointBehindSurface(probe, surfacePoint, surfaceNormal, minDepth = 0.007) {
  if (!probe || !surfacePoint || !surfaceNormal) return false
  const delta = [
    surfacePoint[0] - probe[0],
    surfacePoint[1] - probe[1],
    surfacePoint[2] - probe[2],
  ]
  const dist = length3(delta)
  if (dist < minDepth) return false
  const aligned = dot3(normalize(delta), normalize(surfaceNormal))
  return aligned > 0.15
}

export function length3(v) {
  return Math.hypot(v[0], v[1], v[2])
}

export function normalize(v) {
  const len = length3(v) || 1
  return [v[0] / len, v[1] / len, v[2] / len]
}

function dot3(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function add3(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

function scale3(v, s) {
  return [v[0] * s, v[1] * s, v[2] * s]
}

function lerp3(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ]
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
}
