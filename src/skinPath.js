/** Skin-following helpers for meridian polylines (no Three.js dependency). */

/** Keep lines just above the mesh so they stay glued without looking floaty. */
export const SKIN_LIFT = 0.01

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
    // Ambiguous great-circle: rotate na toward nb around an axis from hint.
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

/** March step length along the skin between two acupoints. */
export function surfaceStepLength(distance, normalDot) {
  const wrap = Math.max(0, 1 - normalDot)
  return Math.min(0.01, Math.max(0.005, distance / (18 + wrap * 24)))
}

/** Outside cast distance while marching; larger when wrapping palm↔dorsum. */
export function marchStandoff(t, normalDot) {
  const wrap = Math.max(0, 1 - normalDot)
  const arch = Math.sin(Math.PI * Math.min(1, Math.max(0, t)))
  return 0.06 + wrap * 0.12 * arch
}

/** @deprecated kept for tests / callers that still inflate chord samples */
export function segmentSampleCount(distance, normalDot) {
  const wrap = Math.max(0, 1 - normalDot)
  return Math.max(12, Math.ceil(distance / surfaceStepLength(distance, normalDot)) + Math.ceil(wrap * 20))
}

/** @deprecated chord inflate helper */
export function segmentInflate(t, normalDot) {
  return marchStandoff(t, normalDot)
}

/**
 * Decide whether a bilateral meridian route should stay visible.
 * Requires enough on-facing, unoccluded nodes so whole-arm lines with
 * depthTest disabled do not show through the torso.
 */
export function routeShouldBeVisible(facingCount, totalNodes) {
  if (totalNodes <= 0) return false
  if (facingCount <= 0) return false
  return facingCount >= Math.max(1, Math.ceil(totalNodes * 0.2))
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
