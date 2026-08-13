/** Skin-following helpers for meridian polylines (no Three.js dependency). */

/** Tiny lift so tubes clear the mesh without looking floaty. */
export const SKIN_LIFT = 0.0035

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
