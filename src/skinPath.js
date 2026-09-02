/** Skin-following helpers for meridian polylines (no Three.js dependency). */

import { isKiYinguChangqiangPair, isLiFutuHeliaoPair } from './catalog.js'

export { isKiYinguChangqiangPair, isLiFutuHeliaoPair }

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
  const wrap = Math.max(0, 1 - Number(normalDot) || 0)
  const dist = Math.max(Number(distance) || 0, 1e-6)
  const maleStep = Math.min(0.007, Math.max(0.0022, dist / (28 + wrap * 40)))
  // Female GLB is ~200× male. Keep the male millimetre step; do not march
  // 20k tiny steps that zigzag across the occiput.
  if (dist <= 0.5) return maleStep
  return Math.min(dist / 28, Math.max(dist / 80, 0.35))
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

/** 督脈 pairs on the posterior midline (啞門→大椎, 陶道→身柱, …). */
export function isDuBackWrapPair(fromCode = '', toCode = '') {
  return /^GV\d+$/.test(String(fromCode || '')) && /^GV\d+$/.test(String(toCode || ''))
}

/** Near-midline points that already sit on the back of the torso / neck. */
export function shouldPosteriorWrap(from = [0, 0, 0], to = [0, 0, 0]) {
  const ax = Number(from[0]) || 0
  const az = Number(from[2]) || 0
  const bx = Number(to[0]) || 0
  const bz = Number(to[2]) || 0
  const meanX = (ax + bx) / 2
  const meanZ = (az + bz) / 2
  const maxZ = Math.max(az, bz)
  const span = Math.max(length3(sub3(asPathPoint(to), asPathPoint(from))), 1e-6)
  // Span-relative so female (~200×) crown/nape still counts as back.
  // Male spans stay on the original 0.08 / 0.025 / 0.008 caps.
  if (Math.abs(meanX) > Math.max(0.08, span * 0.25)) return false
  if (maxZ > Math.max(0.025, span * 0.15) && meanZ > Math.max(0.008, span * 0.05)) return false
  return meanZ < Math.max(0.008, span * 0.05)
}

/** 陰谷 (KI10) → 長強 (GV1): posterior thigh then into the natal cleft. */
function kiYinguChangqiangEnds(from = [0, 0, 0], to = [0, 0, 0]) {
  const a = asPathPoint(from)
  const b = asPathPoint(to)
  const start = Math.abs(a[0]) >= Math.abs(b[0]) ? a : b
  const end = start === a ? b : a
  return { start, end, flipped: start !== a }
}

/**
 * Gluteal-fold parameter: hold the posterior-thigh X until here, then a
 * straight diagonal into 長強. Smoothstep-after-0.58 plus a posterior bulge
 * wrapped the natal cleft into a V.
 */
export const KI_YINGU_CHANGQIANG_FOLD_T = 0.50

/** 0 on the thigh; 0→1 linearly from the fold into 長強. */
export function kiYinguChangqiangMedialT(t = 0) {
  const tt = clamp01(t)
  if (tt <= KI_YINGU_CHANGQIANG_FOLD_T) return 0
  return (tt - KI_YINGU_CHANGQIANG_FOLD_T) / (1 - KI_YINGU_CHANGQIANG_FOLD_T)
}

/** Outside-skin sample: medial thigh, then a straight diagonal into 長強. */
export function kiYinguChangqiangOuterPoint(from = [0, 0, 0], to = [0, 0, 0], t = 0.5) {
  const { start, end, flipped } = kiYinguChangqiangEnds(from, to)
  const tt = flipped ? 1 - clamp01(t) : clamp01(t)
  const span = Math.max(length3(sub3(end, start)), 1e-6)
  const medial = kiYinguChangqiangMedialT(tt)
  const y = start[1] + (end[1] - start[1]) * tt
  const x = start[0] + (end[0] - start[0]) * medial
  const zLerp = start[2] + (end[2] - start[2]) * tt
  // Thigh-only posterior ease. It is zero at the fold so the last segment
  // does not wrap the gluteal bulge on the way into the cleft.
  const thighArc = Math.sin(Math.PI * clamp01(tt / KI_YINGU_CHANGQIANG_FOLD_T))
  const posteriorBulge = (1 - medial) * thighArc * Math.max(0.01, span * 0.035)
  return [x, y, zLerp - posteriorBulge]
}

/** Cast from behind the thigh / cleft onto the back skin (−Z outward). */
export function kiYinguChangqiangGuide(from = [0, 0, 0], to = [0, 0, 0], t = 0.5) {
  const { start, end, flipped } = kiYinguChangqiangEnds(from, to)
  const tt = flipped ? 1 - clamp01(t) : clamp01(t)
  const medial = kiYinguChangqiangMedialT(tt)
  const side = Math.sign(start[0]) || 1
  return normalize([side * 0.22 * (1 - medial), 0.08 + 0.06 * medial, -1])
}

export function kiYinguChangqiangCastStandoff(from = [0, 0, 0], to = [0, 0, 0]) {
  const span = Math.max(length3(sub3(asPathPoint(to), asPathPoint(from))), 1e-6)
  return Math.max(0.03, span * 0.14)
}

/** Keep samples on this thigh, posterior, then on the diagonal into the cleft. */
export function isKiYinguChangqiangHit(hit = [0, 0, 0], from = [0, 0, 0], to = [0, 0, 0], t = 0.5) {
  const { start, end, flipped } = kiYinguChangqiangEnds(from, to)
  const p = asPathPoint(hit)
  const span = Math.max(length3(sub3(end, start)), 1e-6)
  const tt = flipped ? 1 - clamp01(t) : clamp01(t)
  const yMin = Math.min(start[1], end[1]) - span * 0.08
  const yMax = Math.max(start[1], end[1]) + span * 0.08
  if (p[1] < yMin || p[1] > yMax) return false
  const posteriorCeiling = Math.max(start[2], end[2]) + Math.max(0.02, span * 0.08)
  if (p[2] > posteriorCeiling) return false
  const side = Math.sign(start[0]) || 1
  if (side * p[0] < -Math.max(0.02, span * 0.04)) return false
  const medial = kiYinguChangqiangMedialT(tt)
  const corridorX = Math.abs(start[0]) * (1 - medial) + Math.abs(end[0]) * medial
  const slack = span * (medial > 0.02 ? 0.07 : 0.12)
  if (Math.abs(p[0]) > corridorX + slack) return false
  return true
}

/** 扶突 is the lateral neck end; 禾髎 is the near-midline lip end. */
function liFutuHeliaoEnds(from = [0, 0, 0], to = [0, 0, 0]) {
  const a = asPathPoint(from)
  const b = asPathPoint(to)
  const neck = Math.abs(a[0]) >= Math.abs(b[0]) ? a : b
  const face = neck === a ? b : a
  return { neck, face, flipped: neck !== a }
}

/**
 * Hold neck laterality until here, then sweep across the cheek to 禾髎.
 * Earlier medial lerp cuts through the mandible.
 */
export const LI_FUTU_HELIAO_JAW_T = 0.18

/** 0 on the neck climb; 0→1 across the cheek to 禾髎. */
export function liFutuHeliaoCheekT(t = 0) {
  const tt = clamp01(t)
  if (tt <= LI_FUTU_HELIAO_JAW_T) return 0
  return (tt - LI_FUTU_HELIAO_JAW_T) / (1 - LI_FUTU_HELIAO_JAW_T)
}

/** Outside-skin sample: anterolateral neck, then the cheek, then 禾髎. */
export function liFutuHeliaoOuterPoint(from = [0, 0, 0], to = [0, 0, 0], t = 0.5) {
  const { neck, face, flipped } = liFutuHeliaoEnds(from, to)
  const tt = flipped ? 1 - clamp01(t) : clamp01(t)
  const span = Math.max(length3(sub3(face, neck)), 1e-6)
  const cheek = smoothstep01(liFutuHeliaoCheekT(tt))
  const x = neck[0] + (face[0] - neck[0]) * cheek
  const y = neck[1] + (face[1] - neck[1]) * tt
  const zLerp = neck[2] + (face[2] - neck[2]) * tt
  const anterior = Math.sin(Math.PI * tt) * span * 0.10
  return [x, y, zLerp + anterior]
}

/** Cast from in front of the cheek / neck onto the face (+Z, slightly lateral). */
export function liFutuHeliaoGuide(from = [0, 0, 0], to = [0, 0, 0], t = 0.5) {
  const { neck, flipped } = liFutuHeliaoEnds(from, to)
  const tt = flipped ? 1 - clamp01(t) : clamp01(t)
  const cheek = liFutuHeliaoCheekT(tt)
  const side = Math.sign(neck[0]) || 1
  return normalize([
    side * (0.72 - 0.38 * cheek),
    0.10,
    0.58 + 0.38 * cheek,
  ])
}

export function liFutuHeliaoCastStandoff(from = [0, 0, 0], to = [0, 0, 0]) {
  const span = Math.max(length3(sub3(asPathPoint(to), asPathPoint(from))), 1e-6)
  return Math.max(0.02, span * 0.12)
}

/** Keep samples on this neck–cheek; reject jaw interior and the far face. */
export function isLiFutuHeliaoHit(hit = [0, 0, 0], from = [0, 0, 0], to = [0, 0, 0], t = 0.5) {
  const { neck, face, flipped } = liFutuHeliaoEnds(from, to)
  const p = asPathPoint(hit)
  const span = Math.max(length3(sub3(face, neck)), 1e-6)
  const tt = flipped ? 1 - clamp01(t) : clamp01(t)
  const yMin = Math.min(neck[1], face[1]) - span * 0.14
  const yMax = Math.max(neck[1], face[1]) + span * 0.14
  if (p[1] < yMin || p[1] > yMax) return false
  const side = Math.sign(neck[0]) || 1
  if (side * p[0] < -span * 0.06) return false
  const maxAbsX = Math.max(Math.abs(neck[0]), Math.abs(face[0]))
  if (Math.abs(p[0]) > maxAbsX + span * 0.18) return false
  if (p[2] < Math.min(neck[2], face[2]) - span * 0.08) return false
  if (p[2] > Math.max(neck[2], face[2]) + span * 0.5) return false
  const chord = [
    neck[0] + (face[0] - neck[0]) * tt,
    neck[1] + (face[1] - neck[1]) * tt,
    neck[2] + (face[2] - neck[2]) * tt,
  ]
  const distChord = length3(sub3(p, chord))
  if (tt > 0.12 && tt < 0.88 && distChord < span * 0.08 && p[2] < chord[2] + span * 0.035) {
    return false
  }
  const outer = liFutuHeliaoOuterPoint(from, to, t)
  return length3(sub3(p, outer)) <= Math.max(0.04, span * 0.55)
}

/** Push a through-spine chord out onto the back skin (−Z). */
export function posteriorWrapGuide(chordPoint = [0, 0, 0]) {
  const x = Number(chordPoint[0]) || 0
  return normalize([x * 0.2, 0.08, -1])
}

/** Front-chest locators / generic convex wraps. 肩井→淵腋 uses the lateral corridor instead. */
export function shouldFrontWrap(from = [0, 0, 0], to = [0, 0, 0]) {
  const dropY = Math.abs((Number(from[1]) || 0) - (Number(to[1]) || 0))
  const meanX = ((Number(from[0]) || 0) + (Number(to[0]) || 0)) / 2
  const meanZ = ((Number(from[2]) || 0) + (Number(to[2]) || 0)) / 2
  const maxZ = Math.max(Number(from[2]) || 0, Number(to[2]) || 0)
  if (maxZ > 0.04 || meanZ > 0.015) return true
  return dropY > 0.1 && Math.abs(meanX) > 0.09 && meanZ > -0.035
}

/**
 * 任脈／督脈 (and other near-x=0 pairs). Span-relative so male and female
 * both count as midline; 肩井→淵腋 stays lateral.
 */
export function isSagittalMidlineSpan(from = [0, 0, 0], to = [0, 0, 0]) {
  const ax = Number(from[0]) || 0
  const bx = Number(to[0]) || 0
  const span = Math.max(length3(sub3(asPathPoint(to), asPathPoint(from))), 1e-6)
  const meanX = (ax + bx) / 2
  const maxAbs = Math.max(Math.abs(ax), Math.abs(bx))
  return Math.abs(meanX) <= Math.max(0.045, span * 0.12)
    && maxAbs <= Math.max(0.08, span * 0.22)
}

/** How far a midline sample may leave the sagittal strip. */
export function sagittalAbsXCap(from = [0, 0, 0], to = [0, 0, 0]) {
  const span = Math.max(length3(sub3(asPathPoint(to), asPathPoint(from))), 1e-6)
  return Math.max(
    Math.abs(Number(from[0]) || 0),
    Math.abs(Number(to[0]) || 0),
    span * 0.06,
    0.008,
  ) + Math.max(0.012, span * 0.05)
}

/** Reject wrap/geodesic samples that flew off the face or sternum into the sky. */
export function hitStaysOnSagittalSpan(hit = [0, 0, 0], from = [0, 0, 0], to = [0, 0, 0]) {
  if (!isSagittalMidlineSpan(from, to)) return true
  return Math.abs(Number(hit[0]) || 0) <= sagittalAbsXCap(from, to)
}

function meridianCodeNumber(code = '') {
  const match = /^[A-Z]+(\d+)$/.exec(String(code || ''))
  return match ? Number(match[1]) : Number.NaN
}

/** 風府→後頂 (GV16–GV19): occiput midline. */
export function isGvOcciputPair(fromCode = '', toCode = '') {
  if (!/^GV\d+$/.test(String(fromCode || '')) || !/^GV\d+$/.test(String(toCode || ''))) return false
  const a = meridianCodeNumber(fromCode)
  const b = meridianCodeNumber(toCode)
  return a >= 16 && a <= 19 && b >= 16 && b <= 19
}

/** 上星→齦交 (GV23–GV28): forehead, nose, philtrum. */
export function isGvFacePair(fromCode = '', toCode = '') {
  if (!/^GV\d+$/.test(String(fromCode || '')) || !/^GV\d+$/.test(String(toCode || ''))) return false
  const a = meridianCodeNumber(fromCode)
  const b = meridianCodeNumber(toCode)
  return a >= 23 && a <= 28 && b >= 23 && b <= 28
}

/** 任脈胸腹前正中（含玉堂→膻中、鳩尾→巨闕、中脘→建里）. */
export function isCvAnteriorPair(fromCode = '', toCode = '') {
  if (!/^CV\d+$/.test(String(fromCode || '')) || !/^CV\d+$/.test(String(toCode || ''))) return false
  const a = meridianCodeNumber(fromCode)
  const b = meridianCodeNumber(toCode)
  return a >= 8 && a <= 24 && b >= 8 && b <= 24
}

/** Front midline hits may not sit in the air in front of the nose / chest. */
export function hitStaysOnFrontMidline(hit = [0, 0, 0], from = [0, 0, 0], to = [0, 0, 0]) {
  if (!isSagittalMidlineSpan(from, to)) return true
  if (!hitStaysOnSagittalSpan(hit, from, to)) return false
  if (shouldPosteriorWrap(from, to)) return true
  const span = Math.max(length3(sub3(asPathPoint(to), asPathPoint(from))), 1e-6)
  const maxZ = Math.max(Number(from[2]) || 0, Number(to[2]) || 0)
  const minZ = Math.min(Number(from[2]) || 0, Number(to[2]) || 0)
  const hitZ = Number(hit[2]) || 0
  if (hitZ > maxZ + Math.max(0.016, span * 0.10)) return false
  // Through-skull occiput, but allow a recessed sternum / philtrum.
  // Female 鳩尾–巨闕 drops ~4 units at the xiphoid; span*0.45 was too tight.
  if (hitZ < minZ - Math.max(0.025, span * 0.80)) return false
  return true
}

/** 任脈短段應貼近穴位和弦，不要繞到胸骨旁邊. */
export function hitStaysNearMidlineChord(hit = [0, 0, 0], from = [0, 0, 0], to = [0, 0, 0]) {
  const a = asPathPoint(from)
  const b = asPathPoint(to)
  const p = asPathPoint(hit)
  const ab = sub3(b, a)
  const span = Math.max(length3(ab), 1e-6)
  const t = clamp01(dot3(sub3(p, a), ab) / (span * span))
  const proj = add3(a, scale3(ab, t))
  return length3(sub3(p, proj)) <= Math.max(0.008, span * 0.05)
}

/** Front-view straightness: stay on the chord X, even if Z follows the sternum / breasts. */
export function hitStaysOnMidlineX(hit = [0, 0, 0], from = [0, 0, 0], to = [0, 0, 0], t = 0.5) {
  const origin = midlineFrontProbeOrigin(from, to, t, 0)
  const span = Math.max(length3(sub3(asPathPoint(to), asPathPoint(from))), 1e-6)
  return Math.abs((Number(hit[0]) || 0) - origin[0]) <= Math.max(0.008, span * 0.05)
}

/**
 * Probe origin in front of the face/chest at sample t.
 * A −Z ray from here hits skin at that Y, not the nose tip from every Y.
 */
export function midlineFrontProbeOrigin(from = [0, 0, 0], to = [0, 0, 0], t = 0.5, standoff = 0) {
  const a = asPathPoint(from)
  const b = asPathPoint(to)
  const u = clamp01(t)
  const maxZ = Math.max(a[2], b[2])
  return [
    a[0] + (b[0] - a[0]) * u,
    a[1] + (b[1] - a[1]) * u,
    maxZ + Math.max(0, Number(standoff) || 0),
  ]
}

/** Origin behind the occiput at sample t. A +Z ray hits the back of the skull at that Y. */
export function midlineBackProbeOrigin(from = [0, 0, 0], to = [0, 0, 0], t = 0.5, standoff = 0) {
  const a = asPathPoint(from)
  const b = asPathPoint(to)
  const u = clamp01(t)
  const minZ = Math.min(a[2], b[2])
  return [
    a[0] + (b[0] - a[0]) * u,
    a[1] + (b[1] - a[1]) * u,
    minZ - Math.max(0, Number(standoff) || 0),
  ]
}

/** Face samples must keep their own Y — snapping every t to 素髎 is the sky loop. */
export function hitMatchesMidlineSampleY(hit = [0, 0, 0], from = [0, 0, 0], to = [0, 0, 0], t = 0.5) {
  const origin = midlineFrontProbeOrigin(from, to, t, 0)
  const span = Math.max(length3(sub3(asPathPoint(to), asPathPoint(from))), 1e-6)
  return Math.abs((Number(hit[1]) || 0) - origin[1]) <= Math.max(0.008, span * 0.06)
}

/** 肩井 GB21 ↔ 淵腋 GB22 only. Geodesic through the armpit crease is skipped; a lateral-chest corridor is used instead. */
export function isJianjingYuanyePair(fromCode = '', toCode = '') {
  const codes = new Set([String(fromCode || ''), String(toCode || '')])
  return codes.has('GB21') && codes.has('GB22')
}

/** Code pair, or the same upper-torso geometry when codes are missing. */
export function isGbShoulderAxillaSpan(fromCode = '', toCode = '', from = [0, 0, 0], to = [0, 0, 0]) {
  return isJianjingYuanyePair(fromCode, toCode) || isShoulderAxillaWrap(from, to)
}

/**
 * Geometry fallback for 肩井→淵腋 when codes are missing.
 * Upper-torso, moderate laterality, descending. Must not match 雲門→天府
 * (more lateral, lower) or 食竇→腹哀 (ribs, lower still).
 */
export function isShoulderAxillaWrap(from = [0, 0, 0], to = [0, 0, 0]) {
  const minY = Math.min(Number(from[1]) || 0, Number(to[1]) || 0)
  const maxY = Math.max(Number(from[1]) || 0, Number(to[1]) || 0)
  const dropY = Math.abs((Number(from[1]) || 0) - (Number(to[1]) || 0))
  const meanX = ((Number(from[0]) || 0) + (Number(to[0]) || 0)) / 2
  return minY > 1.20 && maxY > 1.47 && dropY > 0.12
    && Math.abs(meanX) > 0.07 && Math.abs(meanX) < 0.20
}

/**
 * Pairs that must wrap instead of trying a geodesic first.
 * 肩井→淵腋 and 小海→肩貞 have dedicated on-skin corridors, not this generic wrap.
 */
export function pairPrefersWrap(fromCode = '', toCode = '', from = [0, 0, 0], to = [0, 0, 0]) {
  if (
    isTeHeadPair(fromCode, toCode)
    || isSiXiaohaiJianzhenPair(fromCode, toCode)
    || isJianjingYuanyePair(fromCode, toCode)
    || isKiYinguChangqiangPair(fromCode, toCode)
    || isLiFutuHeliaoPair(fromCode, toCode)
  ) {
    return false
  }
  if (isDuBackWrapPair(fromCode, toCode) && shouldPosteriorWrap(from, to)) return true
  return false
}

/** Chord length, used to scale 肩井→淵腋 offsets on male and female bodies. */
export function gbPairSpan(from = [0, 0, 0], to = [0, 0, 0]) {
  const a = asPathPoint(from)
  const b = asPathPoint(to)
  return Math.max(length3(sub3(b, a)), 1e-6)
}

/**
 * Cast onto the lateral chest wall: mostly ±X, slightly up.
 * Only a hint of anterior so the line leaves the axilla hollow without
 * wrapping onto the pecs or jumping onto the T-pose arm.
 */
export function gbLateralChestGuide(chordPoint = [0, 0, 0], sideX = 0) {
  const side = Math.sign(Number(sideX) || Number(chordPoint[0]) || 1) || 1
  return normalize([side * 0.90, 0.16, 0.38])
}

/** Stand-off that clears the female torso before the inward skin ray. */
export function gbLocatorCastStandoff(from = [0, 0, 0], to = [0, 0, 0]) {
  return Math.max(0.05, gbPairSpan(from, to) * 0.28)
}

/**
 * Push a 肩井–淵腋 locator-curve sample outside the ribcage. Catmull-Rom
 * chords dive into the thorax; casting from there hits pecs/pit or keeps the
 * sample interior, so the red line ignores the black dots.
 */
export function gbLocatorOutsideProbe(sample = [0, 0, 0], from = [0, 0, 0], to = [0, 0, 0]) {
  const p = asPathPoint(sample)
  const a = asPathPoint(from)
  const b = asPathPoint(to)
  const side = Math.sign((a[0] + b[0]) / 2) || Math.sign(p[0]) || 1
  const guide = gbLateralChestGuide(p, side)
  const standoff = gbLocatorCastStandoff(a, b)
  return [
    p[0] + guide[0] * standoff,
    p[1] + guide[1] * standoff,
    p[2] + guide[2] * standoff,
  ]
}

function smoothstep01(value) {
  const x = clamp01(value)
  return x * x * (3 - 2 * x)
}

/**
 * Mid-axillary 側胸 target at climb `yT` (0 = 淵腋, 1 = 肩井).
 * 淵腋 sits in the axillary crease, more posterior and slightly more
 * lateral than the chest wall. The corridor leaves that pit onto the
 * side of the thorax, holds laterality until near the shoulder cap,
 * then eases onto 肩井. Z goes posterior earlier so the last third
 * rides the shoulder onto 肩頸 instead of punching through it.
 */
function gbJianjingYuanyeCorridorAtYT(from = [0, 0, 0], to = [0, 0, 0], yT = 0.5) {
  const a = asPathPoint(from)
  const b = asPathPoint(to)
  const lower = a[1] <= b[1] ? a : b
  const upper = a[1] <= b[1] ? b : a
  const side = Math.sign((a[0] + b[0]) / 2) || 1
  const span = gbPairSpan(a, b)
  const yt = clamp01(yT)
  const leave = smoothstep01(yt / 0.16)
  const shoulderX = smoothstep01((yt - 0.78) / 0.22)
  const shoulderZ = smoothstep01((yt - 0.50) / 0.50)
  const onSideX = Math.max(0, leave - shoulderX)
  const onSideZ = Math.max(0, leave - shoulderZ)
  const cap = Math.sin(Math.PI * Math.min(1, Math.max(0, (yt - 0.55) / 0.45)))
  const wallAbsX = Math.max(span * 0.18, Math.abs(lower[0]) - span * 0.05)
  const wallZ = lower[2] + span * 0.30
  const x = side * (
    Math.abs(lower[0]) * (1 - leave)
    + wallAbsX * onSideX
    + Math.abs(upper[0]) * shoulderX
  )
  const y = lower[1] * (1 - yt) + upper[1] * yt + span * 0.12 * cap
  const z = lower[2] * (1 - leave) + wallZ * onSideZ + upper[2] * shoulderZ
  return {
    point: [x, y, z],
    yT: yt,
    onSide: Math.max(onSideX, onSideZ),
    cap,
    wallAbsX,
    wallZ,
    span,
    side,
    lower,
    upper,
  }
}

/**
 * Corridor on the mid-axillary wall. Leave 淵腋 onto 側胸, then climb to 肩頸.
 */
export function gbJianjingYuanyeOuterPoint(from = [0, 0, 0], to = [0, 0, 0], t = 0.5) {
  const a = asPathPoint(from)
  const b = asPathPoint(to)
  const tt = clamp01(t)
  const yT = a[1] <= b[1] ? tt : 1 - tt
  const corridor = gbJianjingYuanyeCorridorAtYT(a, b, yT)
  const guide = gbLateralChestGuide(corridor.point, corridor.side)
  const standoff = corridor.span * (0.035 * corridor.onSide + 0.04 * corridor.cap)
  return [
    corridor.point[0] + guide[0] * standoff,
    corridor.point[1] + guide[1] * standoff,
    corridor.point[2] + guide[2] * standoff,
  ]
}

/**
 * Axilla pit, T-pose inner arm, through-shoulder chord, or anterior pec —
 * not the mid-axillary wall the span should ride.
 */
export function isGbAxillaHollow(point = [0, 0, 0], from = [0, 0, 0], to = [0, 0, 0]) {
  const p = asPathPoint(point)
  const a = asPathPoint(from)
  const b = asPathPoint(to)
  const span = gbPairSpan(a, b)
  const y0 = Math.min(a[1], b[1])
  const y1 = Math.max(a[1], b[1])
  const midSpan = p[1] > y0 + span * 0.10 && p[1] < y1 - span * 0.10
  const yT = y1 - y0 > 1e-8 ? clamp01((p[1] - y0) / (y1 - y0)) : 0.5
  const corridor = gbJianjingYuanyeCorridorAtYT(a, b, yT)
  const onChest = p[2] > Math.max(corridor.wallZ, corridor.point[2]) + span * 0.14
  const expectedAbsX = Math.abs(corridor.point[0])
  const tooMedial = midSpan && Math.abs(p[0]) < expectedAbsX - span * 0.10
  const tooLateral = midSpan && Math.abs(p[0]) > Math.max(corridor.wallAbsX, expectedAbsX) + span * 0.18
  const throughPit = midSpan && yT > 0.12 && yT < 0.82
    && p[2] < corridor.point[2] - span * 0.10
  return onChest || tooMedial || tooLateral || throughPit
}

/**
 * User locators may leave the default mid-axillary corridor to reshape the
 * span. Opposite side, a y jump, the pecs, the T-pose inner arm, or the
 * deep axillary crease is rejected. Posterior-lateral wraps along the ribs
 * (the usual “drag the black dots to the right” on this span) stay legal.
 */
export function isGbJianjingYuanyeHandleOk(point = [0, 0, 0], from = [0, 0, 0], to = [0, 0, 0]) {
  const p = asPathPoint(point)
  const a = asPathPoint(from)
  const b = asPathPoint(to)
  const side = Math.sign((a[0] + b[0]) / 2) || Math.sign(p[0]) || 1
  const span = gbPairSpan(a, b)
  if (p[0] * side < 0 && Math.abs(p[0]) > span * 0.12) return false
  const yMin = Math.min(a[1], b[1]) - span * 0.28
  const yMax = Math.max(a[1], b[1]) + span * 0.28
  if (p[1] < yMin || p[1] > yMax) return false
  const y0 = Math.min(a[1], b[1])
  const y1 = Math.max(a[1], b[1])
  const midSpan = p[1] > y0 + span * 0.08 && p[1] < y1 - span * 0.08
  const yT = y1 - y0 > 1e-8 ? clamp01((p[1] - y0) / (y1 - y0)) : 0.5
  const corridor = gbJianjingYuanyeCorridorAtYT(a, b, yT)
  const wallAbs = Math.max(corridor.wallAbsX, Math.abs(a[0]), Math.abs(b[0]))
  const onChest = p[2] > Math.max(corridor.wallZ, corridor.point[2]) + span * 0.40
  // T-pose inner arm is often near 淵腋 height, so do not require midSpan.
  const tooLateral = Math.abs(p[0]) > wallAbs + span * 0.38
  const throughPit = midSpan
    && p[2] < Math.min(a[2], b[2], corridor.point[2]) - span * 0.22
    && Math.abs(p[0]) < wallAbs - span * 0.06
  return !onChest && !tooLateral && !throughPit
}

/** Reject samples that fell into the axilla crease or jumped onto the chest. */
export function isGbJianjingYuanyeHit(point = [0, 0, 0], from = [0, 0, 0], to = [0, 0, 0], t = null) {
  const p = asPathPoint(point)
  const a = asPathPoint(from)
  const b = asPathPoint(to)
  const side = Math.sign((a[0] + b[0]) / 2) || Math.sign(p[0]) || 1
  const span = gbPairSpan(a, b)
  if (p[0] * side < 0 && Math.abs(p[0]) > span * 0.12) return false
  const yMin = Math.min(a[1], b[1]) - span * 0.14
  const yMax = Math.max(a[1], b[1]) + span * 0.14
  if (p[1] < yMin || p[1] > yMax) return false
  if (isGbAxillaHollow(p, a, b)) return false
  const progress = Number.isFinite(Number(t))
    ? clamp01(t)
    : clamp01((
      (p[0] - a[0]) * (b[0] - a[0])
      + (p[1] - a[1]) * (b[1] - a[1])
      + (p[2] - a[2]) * (b[2] - a[2])
    ) / (span * span))
  if (progress > 0.14 && progress < 0.86) {
    const chord = lerp3(a, b, progress)
    const outer = gbJianjingYuanyeOuterPoint(a, b, progress)
    const toChord = length3(sub3(p, chord))
    const toOuter = length3(sub3(p, outer))
    if (toChord + span * 0.045 < toOuter && toChord < span * 0.14) return false
  }
  return true
}

export function gbJianjingYuanyeGuidePoints(from = [0, 0, 0], to = [0, 0, 0], samplesPerSpan = 12) {
  const a = asPathPoint(from)
  const b = asPathPoint(to)
  const count = Math.max(8, Math.floor(Number(samplesPerSpan) || 12))
  const out = []
  for (let index = 0; index <= count; index += 1) {
    if (index === 0) out.push([...a])
    else if (index === count) out.push([...b])
    else out.push(gbJianjingYuanyeOuterPoint(a, b, index / count))
  }
  return out
}

/**
 * 少海→靈道 and other same-face limb spans (inner arm / inner thigh).
 * These should ride a nearly-straight skin chord, not wrap around or
 * through the hollow limb.
 */
export function isFacingLimbSpan(from = [0, 0, 0], to = [0, 0, 0], normalDot = 1) {
  if (isShoulderAxillaWrap(from, to)) return false
  const ax = Number(from[0]) || 0
  const ay = Number(from[1]) || 0
  const az = Number(from[2]) || 0
  const bx = Number(to[0]) || 0
  const by = Number(to[1]) || 0
  const bz = Number(to[2]) || 0
  if (ax * bx <= 0) return false
  const meanX = (ax + bx) / 2
  if (Math.abs(meanX) < 0.13) return false
  if (Number(normalDot) < 0.2) return false
  const dx = Math.abs(ax - bx)
  const dy = Math.abs(ay - by)
  const dz = Math.abs(az - bz)
  const chord = Math.hypot(dx, dy, dz)
  if (chord < 0.04 || chord > 0.55) return false
  if (dy < 0.06) return false
  if (dy < dx * 1.05 && dy < dz * 1.05) return false
  const maxY = Math.max(ay, by)
  const minY = Math.min(ay, by)
  return maxY <= 1.52 && minY >= 0.55
}

/**
 * 少府→少衝 (and 魚際→少商): palm/pad to the nail of the same digit.
 * The 3D chord cuts through the finger; the skin path must run to the
 * fingertip on the palmar side, then wrap onto the nail.
 */
export function isDigitTipWrap(from = [0, 0, 0], to = [0, 0, 0], normalDot = 0) {
  const ax = Number(from[0]) || 0
  const ay = Number(from[1]) || 0
  const az = Number(from[2]) || 0
  const bx = Number(to[0]) || 0
  const by = Number(to[1]) || 0
  const bz = Number(to[2]) || 0
  if (ax * bx <= 0) return false
  if (Math.abs((ax + bx) / 2) < 0.28) return false
  if (Number(normalDot) >= 0.25) return false
  const chord = Math.hypot(ax - bx, ay - by, az - bz)
  if (chord < 0.03 || chord > 0.18) return false
  const maxY = Math.max(ay, by)
  const minY = Math.min(ay, by)
  return maxY <= 1.25 && minY >= 0.55
}

export function digitDistalDir(from = [0, 0, 0], to = [0, 0, 0]) {
  return normalize([
    (Number(to[0]) || 0) - (Number(from[0]) || 0),
    (Number(to[1]) || 0) - (Number(from[1]) || 0),
    (Number(to[2]) || 0) - (Number(from[2]) || 0),
  ])
}

/** Away from the neighbouring fingers (ulnar for the little finger). */
export function digitUlnarDir(from = [0, 0, 0], to = [0, 0, 0]) {
  const distal = digitDistalDir(from, to)
  const side = Math.sign((Number(to[0]) || 0) + (Number(from[0]) || 0)) || 1
  const raw = [side, 0, 0]
  const parallel = raw[0] * distal[0] + raw[1] * distal[1] + raw[2] * distal[2]
  const perp = [raw[0] - distal[0] * parallel, raw[1] - distal[1] * parallel, raw[2] - distal[2] * parallel]
  return length3(perp) < 1e-6 ? raw : normalize(perp)
}

/** Palmar side of the fingertip: opposite the nail, not toward the palm centre. */
export function digitPalmarDir(fromNormal = [0, 0, 1], toNormal = [0, 0, 1]) {
  const nail = normalize(toNormal)
  const palm = normalize(fromNormal)
  const antiNail = [-nail[0], -nail[1], -nail[2]]
  return dot3(antiNail, palm) > 0.05 ? antiNail : palm
}

export function digitAxisEnds(from = [0, 0, 0], to = [0, 0, 0]) {
  const distal = digitDistalDir(from, to)
  const ulnar = digitUlnarDir(from, to)
  return [
    [
      (Number(from[0]) || 0) + ulnar[0] * 0.01,
      (Number(from[1]) || 0) + ulnar[1] * 0.01,
      (Number(from[2]) || 0) + ulnar[2] * 0.01,
    ],
    [
      (Number(to[0]) || 0) + distal[0] * 0.034,
      (Number(to[1]) || 0) + distal[1] * 0.034,
      (Number(to[2]) || 0) + distal[2] * 0.034,
    ],
  ]
}

export const DIGIT_CORRIDOR_RADIUS = 0.022

export function isOnDigitCorridor(point = [0, 0, 0], from = [0, 0, 0], to = [0, 0, 0], radius = DIGIT_CORRIDOR_RADIUS) {
  const [start, end] = digitAxisEnds(from, to)
  return distanceToSegment(point, start, end) <= radius
}

/** Palm → pinky pad → fingertip (nail free edge) → nail (少衝). */
export function digitWrapAnchors(from = [0, 0, 0], to = [0, 0, 0], fromNormal = [0, 0, 1], toNormal = [0, 0, 1]) {
  const distal = digitDistalDir(from, to)
  const ulnar = digitUlnarDir(from, to)
  const palmar = digitPalmarDir(fromNormal, toNormal)
  const base = [
    (Number(from[0]) || 0) * 0.55 + (Number(to[0]) || 0) * 0.45 + ulnar[0] * 0.012 + palmar[0] * 0.006,
    (Number(from[1]) || 0) * 0.55 + (Number(to[1]) || 0) * 0.45 + ulnar[1] * 0.012 + palmar[1] * 0.006,
    (Number(from[2]) || 0) * 0.55 + (Number(to[2]) || 0) * 0.45 + ulnar[2] * 0.012 + palmar[2] * 0.006,
  ]
  const tip = [
    (Number(to[0]) || 0) + distal[0] * 0.03 + palmar[0] * 0.01 + ulnar[0] * 0.006,
    (Number(to[1]) || 0) + distal[1] * 0.03 + palmar[1] * 0.01 + ulnar[1] * 0.006,
    (Number(to[2]) || 0) + distal[2] * 0.03 + palmar[2] * 0.01 + ulnar[2] * 0.006,
  ]
  return { base, tip, distal, ulnar, palmar }
}

export function digitTipWaypoint(from = [0, 0, 0], to = [0, 0, 0], fromNormal = [0, 0, 1], toNormal = [0, 0, 1]) {
  return digitWrapAnchors(from, to, fromNormal, toNormal).tip
}

/**
 * Probe a few millimetres past 少衝 on the palmar face of the same fingertip.
 * Must stay next to the nail — never an ulnar/air offset beside the hand.
 */
export function digitTipProbe(from = [0, 0, 0], to = [0, 0, 0], fromNormal = [0, 0, 1], toNormal = [0, 0, 1]) {
  const distal = digitDistalDir(from, to)
  const palmar = digitPalmarDir(fromNormal, toNormal)
  return [
    (Number(to[0]) || 0) + distal[0] * 0.006 + palmar[0] * 0.008,
    (Number(to[1]) || 0) + distal[1] * 0.006 + palmar[1] * 0.008,
    (Number(to[2]) || 0) + distal[2] * 0.006 + palmar[2] * 0.008,
  ]
}

/** True when a sample still sits inside the pinky volume (HT8 → just past HT9). */
export function isOnDigitSkin(point = [0, 0, 0], from = [0, 0, 0], to = [0, 0, 0], radius = 0.022) {
  const distal = digitDistalDir(from, to)
  const tip = [
    (Number(to[0]) || 0) + distal[0] * 0.01,
    (Number(to[1]) || 0) + distal[1] * 0.01,
    (Number(to[2]) || 0) + distal[2] * 0.01,
  ]
  return distanceToSegment(point, from, tip) <= radius
}

export function maxPolylineEdge(points = []) {
  let max = 0
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1]
    const b = points[index]
    const pa = a?.isVector3 ? [a.x, a.y, a.z] : a
    const pb = b?.isVector3 ? [b.x, b.y, b.z] : b
    if (!pa || !pb) continue
    const span = length3([pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]])
    if (span > max) max = span
  }
  return max
}

const TE_EAR_ARC_CODES = new Set(['TE17', 'TE18', 'TE19', 'TE20', 'TE21'])
const TE_HEAD_CODES = new Set(['TE17', 'TE18', 'TE19', 'TE20', 'TE21', 'TE22', 'TE23'])

function teSequence(code) {
  const match = /^TE(\d+)$/.exec(String(code || ''))
  return match ? Number(match[1]) : NaN
}

function asPathPoint(point) {
  if (!point) return [0, 0, 0]
  if (point.isVector3) return [point.x, point.y, point.z]
  return [Number(point[0]) || 0, Number(point[1]) || 0, Number(point[2]) || 0]
}

function sub3(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

/** 絲竹空 TE23 ↔ 耳和髎 TE22 only. */
export function isTeTempleHandlePair(fromCode = '', toCode = '') {
  const codes = new Set([String(fromCode || ''), String(toCode || '')])
  return codes.has('TE22') && codes.has('TE23')
}

/** 耳門 TE21 ↔ 耳和髎 TE22, or 耳和髎 TE22 ↔ 絲竹空 TE23. */
export function isTeTempleRunPair(fromCode = '', toCode = '') {
  const codes = new Set([String(fromCode || ''), String(toCode || '')])
  return (codes.has('TE21') && codes.has('TE22')) || (codes.has('TE22') && codes.has('TE23'))
}

/** 翳風 TE17 … 耳門 TE21 consecutive pairs. */
export function isTeEarArcPair(fromCode = '', toCode = '') {
  const a = String(fromCode || '')
  const b = String(toCode || '')
  if (!TE_EAR_ARC_CODES.has(a) || !TE_EAR_ARC_CODES.has(b)) return false
  return Math.abs(teSequence(a) - teSequence(b)) === 1
}

/** Consecutive 三焦經 head pairs 翳風 TE17 … 絲竹空 TE23. */
export function isTeHeadPair(fromCode = '', toCode = '') {
  const a = String(fromCode || '')
  const b = String(toCode || '')
  if (!TE_HEAD_CODES.has(a) || !TE_HEAD_CODES.has(b)) return false
  return Math.abs(teSequence(a) - teSequence(b)) === 1
}

/** 角孫 TE20 ↔ 耳門 TE21: around the top/front of the ear. */
export function isTeHelixPair(fromCode = '', toCode = '') {
  const codes = new Set([String(fromCode || ''), String(toCode || '')])
  return codes.has('TE20') && codes.has('TE21')
}

/** Relaxed geodesic gate for the high-curvature ear root (TE only). */
export const TE_EAR_GEODESIC_STABLE = Object.freeze({
  maxLengthRatio: 3.8,
  maxEdge: 0.055,
  maxTurningPerPoint: 0.32,
})

/**
 * Approximate ear-canal centre so a short slerp around it traces the pinna
 * instead of the chord through the helix.
 */
export function teEarCenter(from = [0, 0, 0], to = [0, 0, 0]) {
  const a = asPathPoint(from)
  const b = asPathPoint(to)
  const side = Math.sign((a[0] + b[0]) / 2) || 1
  const surface = Math.min(Math.abs(a[0]), Math.abs(b[0]))
  return [
    side * Math.max(0.038, surface - 0.02),
    (a[1] + b[1]) * 0.5 * 0.45 + 1.658 * 0.55,
    (a[2] + b[2]) * 0.5 * 0.45 + -0.032 * 0.55,
  ]
}

export function teEarArcHint(fromCode = '', toCode = '', from = [0, 0, 0], to = [0, 0, 0]) {
  const side = Math.sign(((Number(from[0]) || 0) + (Number(to[0]) || 0)) / 2) || 1
  if (isTeHelixPair(fromCode, toCode) || (String(fromCode) === 'TE19' && String(toCode) === 'TE20')
    || (String(fromCode) === 'TE20' && String(toCode) === 'TE19')) {
    return normalize([side * 0.2, 0.85, 0.45])
  }
  if (isTeTempleRunPair(fromCode, toCode)) {
    return normalize([side * 0.55, 0.2, 0.8])
  }
  return normalize([side * 0.25, 0.2, -0.95])
}

export function teEarArcGuide(fromCode = '', toCode = '', from = [0, 0, 0], to = [0, 0, 0]) {
  return teEarArcHint(fromCode, toCode, from, to)
}

export function quadraticArcPoints(from = [0, 0, 0], to = [0, 0, 0], guide = [1, 0, 0], {
  bulge = 0.24,
  samples = 22,
} = {}) {
  const a = asPathPoint(from)
  const b = asPathPoint(to)
  const mid = lerp3(a, b, 0.5)
  const span = length3([b[0] - a[0], b[1] - a[1], b[2] - a[2]])
  const g = normalize(guide)
  const rise = Math.max(0.006, span * Math.max(0, Number(bulge) || 0))
  const control = [mid[0] + g[0] * rise, mid[1] + g[1] * rise, mid[2] + g[2] * rise]
  const count = Math.max(8, Math.floor(Number(samples) || 22))
  const out = []
  for (let index = 0; index <= count; index += 1) {
    const t = index / count
    const u = 1 - t
    out.push([
      u * u * a[0] + 2 * u * t * control[0] + t * t * b[0],
      u * u * a[1] + 2 * u * t * control[1] + t * t * b[1],
      u * u * a[2] + 2 * u * t * control[2] + t * t * b[2],
    ])
  }
  return out
}

/** Smooth circumference around the pinna: slerp on a sphere about the canal. */
export function teEarCircumferenceArc(from = [0, 0, 0], to = [0, 0, 0], fromCode = '', toCode = '') {
  const a = asPathPoint(from)
  const b = asPathPoint(to)
  const center = teEarCenter(a, b)
  const va = sub3(a, center)
  const vb = sub3(b, center)
  const ra = length3(va)
  const rb = length3(vb)
  if (ra < 1e-5 || rb < 1e-5) return quadraticArcPoints(a, b, teEarArcHint(fromCode, toCode, a, b), { bulge: 0.2, samples: 18 })
  const na = normalize(va)
  const nb = normalize(vb)
  const hint = teEarArcHint(fromCode, toCode, a, b)
  const span = length3(sub3(b, a))
  const count = Math.max(18, Math.ceil(span / 0.003))
  const out = []
  for (let index = 0; index <= count; index += 1) {
    const t = index / count
    const dir = slerpUnitVectors(na, nb, t, hint)
    const radius = (ra * (1 - t) + rb * t) * 1.035
    out.push([
      center[0] + dir[0] * radius,
      center[1] + dir[1] * radius,
      center[2] + dir[2] * radius,
    ])
  }
  out[0] = [...a]
  out[count] = [...b]
  return out
}

/** 耳門→和髎→絲竹空: stay on the temple, not through the orbit or the helix. */
export function teTempleArcPoints(from = [0, 0, 0], to = [0, 0, 0], fromCode = '', toCode = '') {
  const a = asPathPoint(from)
  const b = asPathPoint(to)
  const hint = teEarArcHint(fromCode, toCode, a, b)
  const span = length3(sub3(b, a))
  const samples = Math.max(14, Math.ceil(span / 0.003))
  const shortFront = (String(fromCode) === 'TE21' && String(toCode) === 'TE22')
    || (String(fromCode) === 'TE22' && String(toCode) === 'TE21')
  return quadraticArcPoints(a, b, hint, {
    bulge: shortFront ? 0.1 : 0.16,
    samples,
  })
}

/** Geometric target for any consecutive TE17–TE23 pair. Later snapped to skin. */
export function teHeadArcPoints(fromCode = '', toCode = '', from = [0, 0, 0], to = [0, 0, 0]) {
  if (isTeTempleRunPair(fromCode, toCode)) {
    return teTempleArcPoints(from, to, fromCode, toCode)
  }
  return teEarCircumferenceArc(from, to, fromCode, toCode)
}

/** Target polyline along the ear root; samples are later snapped to skin. */
export function teEarArcPoints(fromCode = '', toCode = '', from = [0, 0, 0], to = [0, 0, 0]) {
  return teHeadArcPoints(fromCode, toCode, from, to)
}

function uniformCatmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t
  const t3 = t2 * t
  return [0, 1, 2].map((axis) => (
    0.5 * (
      (2 * p1[axis])
      + (-p0[axis] + p2[axis]) * t
      + (2 * p0[axis] - 5 * p1[axis] + 4 * p2[axis] - p3[axis]) * t2
      + (-p0[axis] + 3 * p1[axis] - 3 * p2[axis] + p3[axis]) * t3
    )
  ))
}

/** Interpolating spline through 穴 and TE temple locators. */
export function catmullRomThrough(points = [], samplesPerSpan = 12) {
  const pts = (points || []).map(asPathPoint)
  if (pts.length < 2) return pts.map((point) => [...point])
  const steps = Math.max(4, Math.floor(Number(samplesPerSpan) || 12))
  if (pts.length === 2) {
    const out = []
    for (let index = 0; index <= steps; index += 1) out.push(lerp3(pts[0], pts[1], index / steps))
    return out
  }
  const out = []
  for (let index = 0; index < pts.length - 1; index += 1) {
    const p0 = pts[Math.max(0, index - 1)]
    const p1 = pts[index]
    const p2 = pts[index + 1]
    const p3 = pts[Math.min(pts.length - 1, index + 2)]
    for (let step = 0; step < steps; step += 1) {
      out.push(uniformCatmullRom(p0, p1, p2, p3, step / steps))
    }
  }
  out.push([...pts[pts.length - 1]])
  return out
}

/** 小海 SI8 ↔ 肩貞 SI9 only. */
export function isSiXiaohaiJianzhenPair(fromCode = '', toCode = '') {
  const codes = new Set([String(fromCode || ''), String(toCode || '')])
  return codes.has('SI8') && codes.has('SI9')
}

/**
 * Locators on these pairs ARE the path. Do not re-anchor them to the rest
 * polyline or drop them with the opposite-limb filter after mouse-up.
 */
export function pairKeepsOffPathLocators(fromCode = '', toCode = '') {
  return isSiXiaohaiJianzhenPair(fromCode, toCode)
    || isTeHeadPair(fromCode, toCode)
    || isJianjingYuanyePair(fromCode, toCode)
}

/** Stay on the back of the arm/shoulder — not into the axilla or chest. */
export function siArmShoulderWrapGuide(chordPoint = [0, 0, 0], sideX = 0) {
  const side = Math.sign(Number(sideX) || Number(chordPoint[0]) || 1) || 1
  return normalize([side * 0.28, 0.08, -0.96])
}

function clamp01(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

/**
 * A point outside the through-axilla chord, on the posterior-lateral arm.
 * Mid-span stays farther out so samples are never taken from inside the hollow.
 */
export function siArmShoulderOuterPoint(from = [0, 0, 0], to = [0, 0, 0], t = 0.5) {
  const a = asPathPoint(from)
  const b = asPathPoint(to)
  const tt = clamp01(t)
  const chord = lerp3(a, b, tt)
  const side = Math.sign((a[0] + b[0]) / 2) || 1
  const keepOut = Math.sin(Math.PI * tt)
  const guide = siArmShoulderWrapGuide(chord, side)
  const standoff = 0.018 + keepOut * 0.038
  const lateral = keepOut * 0.022
  return [
    chord[0] + guide[0] * standoff + side * lateral,
    chord[1] + guide[1] * standoff,
    chord[2] + guide[2] * standoff,
  ]
}

/** How lateral a sample must stay at progress `t` (hold the arm, ease in only near 肩貞). */
export function siArmShoulderAbsXFloor(from = [0, 0, 0], to = [0, 0, 0], t = 0.5) {
  const a = Math.abs(Number(from[0]) || 0)
  const b = Math.abs(Number(to[0]) || 0)
  const tt = clamp01(t)
  const outer = Math.max(a, b)
  const inner = Math.min(a, b)
  if (tt <= 0.12 || tt >= 0.88) return inner - 0.018
  const hold = Math.min(1, Math.max(0, (tt - 0.12) / 0.64))
  const eased = outer + (inner - outer) * hold * hold
  return Math.max(inner + 0.02, eased - 0.01)
}

/**
 * Deep axillary hollow / anterior chest — not merely off the rest corridor.
 * Locators may sit beside the default 小海–肩貞 path; only this is rejected.
 */
export function isSiXiaohaiJianzhenAxillaHollow(point = [0, 0, 0], from = [0, 0, 0], to = [0, 0, 0]) {
  const p = asPathPoint(point)
  const a = asPathPoint(from)
  const b = asPathPoint(to)
  const y0 = Math.min(a[1], b[1])
  const y1 = Math.max(a[1], b[1])
  const midSpan = p[1] > y0 + 0.035 && p[1] < y1 - 0.035
  const minAbsX = Math.min(Math.abs(a[0]), Math.abs(b[0]))
  const zBack = Math.min(a[2], b[2])
  const zFront = Math.max(a[2], b[2])
  const deepMedial = Math.abs(p[0]) < Math.max(0.10, minAbsX - 0.08)
  const throughAxilla = midSpan && deepMedial && p[2] > zBack + 0.02
  const onChest = p[2] > zFront + 0.07
  return throughAxilla || onChest
}

/**
 * User locators may leave the posterior-lateral corridor to reshape the span.
 * Only the opposite side, a y jump, or the axillary hollow / chest is rejected.
 */
export function isSiArmShoulderHandleOk(point = [0, 0, 0], from = [0, 0, 0], to = [0, 0, 0]) {
  const p = asPathPoint(point)
  const a = asPathPoint(from)
  const b = asPathPoint(to)
  const side = Math.sign((a[0] + b[0]) / 2) || Math.sign(p[0]) || 1
  if (p[0] * side < 0 && Math.abs(p[0]) > 0.03) return false
  const yMin = Math.min(a[1], b[1]) - 0.10
  const yMax = Math.max(a[1], b[1]) + 0.10
  if (p[1] < yMin || p[1] > yMax) return false
  return !isSiXiaohaiJianzhenAxillaHollow(p, a, b)
}

/** Reject samples that fell into the armpit crease or jumped onto the chest. */
export function isSiArmShoulderHit(point = [0, 0, 0], from = [0, 0, 0], to = [0, 0, 0], t = null) {
  const p = asPathPoint(point)
  const a = asPathPoint(from)
  const b = asPathPoint(to)
  const side = Math.sign((a[0] + b[0]) / 2) || Math.sign(p[0]) || 1
  if (p[0] * side < 0 && Math.abs(p[0]) > 0.03) return false
  const span = length3([b[0] - a[0], b[1] - a[1], b[2] - a[2]])
  const progress = Number.isFinite(Number(t))
    ? clamp01(t)
    : (span < 1e-8 ? 0.5 : clamp01((
      (p[0] - a[0]) * (b[0] - a[0])
      + (p[1] - a[1]) * (b[1] - a[1])
      + (p[2] - a[2]) * (b[2] - a[2])
    ) / (span * span)))
  if (Math.abs(p[0]) < siArmShoulderAbsXFloor(a, b, progress)) return false
  const maxZ = Math.max(a[2], b[2]) + 0.03
  if (p[2] > maxZ) return false
  const yMin = Math.min(a[1], b[1]) - 0.06
  const yMax = Math.max(a[1], b[1]) + 0.06
  if (p[1] < yMin || p[1] > yMax) return false
  if (progress > 0.14 && progress < 0.86) {
    const chord = lerp3(a, b, progress)
    const outer = siArmShoulderOuterPoint(a, b, progress)
    const toChord = length3([p[0] - chord[0], p[1] - chord[1], p[2] - chord[2]])
    const toOuter = length3([p[0] - outer[0], p[1] - outer[1], p[2] - outer[2]])
    if (toChord + 0.01 < toOuter && toChord < 0.028) return false
  }
  return true
}

export function siArmShoulderGuidePoints(from = [0, 0, 0], to = [0, 0, 0], samplesPerSpan = 12) {
  const a = asPathPoint(from)
  const b = asPathPoint(to)
  return catmullRomThrough([
    a,
    siArmShoulderOuterPoint(a, b, 0.32),
    siArmShoulderOuterPoint(a, b, 0.62),
    siArmShoulderOuterPoint(a, b, 0.84),
    b,
  ], samplesPerSpan)
}

export function digitWrapGuidePoint(from, to, fromNormal, toNormal, t) {
  const { base, tip, distal, palmar } = digitWrapAnchors(from, to, fromNormal, toNormal)
  const tt = Math.min(1, Math.max(0, Number(t) || 0))
  const lerp = (a, b, u) => [
    a[0] + (b[0] - a[0]) * u,
    a[1] + (b[1] - a[1]) * u,
    a[2] + (b[2] - a[2]) * u,
  ]
  if (tt <= 0.38) {
    return { point: lerp(from, base, tt / 0.38), guide: palmar, phase: 'palm' }
  }
  if (tt <= 0.74) {
    return { point: lerp(base, tip, (tt - 0.38) / 0.36), guide: palmar, phase: 'digit' }
  }
  return {
    point: lerp(tip, to, (tt - 0.74) / 0.26),
    guide: slerpUnitVectors(palmar, toNormal, (tt - 0.74) / 0.26, distal),
    phase: 'nail',
  }
}

function distanceToSegment(point, a, b) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const span = length3(ab)
  if (span < 1e-12) {
    return length3([point[0] - a[0], point[1] - a[1], point[2] - a[2]])
  }
  const t = Math.min(1, Math.max(0, (
    (point[0] - a[0]) * ab[0]
    + (point[1] - a[1]) * ab[1]
    + (point[2] - a[2]) * ab[2]
  ) / (span * span)))
  return length3([
    point[0] - (a[0] + ab[0] * t),
    point[1] - (a[1] + ab[1] * t),
    point[2] - (a[2] + ab[2] * t),
  ])
}

/** True when a polyline stays close to the 3D chord (no wrap through the limb). */
export function pathFollowsFacingChord(points = [], from = [0, 0, 0], to = [0, 0, 0], maxOffChord = 0.045) {
  if (!points || points.length < 2) return false
  const start = Array.isArray(from) ? from : [from.x, from.y, from.z]
  const end = Array.isArray(to) ? to : [to.x, to.y, to.z]
  const chord = length3([end[0] - start[0], end[1] - start[1], end[2] - start[2]])
  if (chord < 1e-6) return false
  let length = 0
  let maxOff = 0
  for (let index = 1; index < points.length; index += 1) {
    const prev = points[index - 1]
    const point = points[index]
    const a = prev?.isVector3 ? [prev.x, prev.y, prev.z] : prev
    const b = point?.isVector3 ? [point.x, point.y, point.z] : point
    length += length3([b[0] - a[0], b[1] - a[1], b[2] - a[2]])
    const off = distanceToSegment(b, start, end)
    if (off > maxOff) maxOff = off
  }
  if (length > chord * 1.4) return false
  return maxOff <= Math.max(maxOffChord, chord * 0.18)
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
  if (!hitStaysOnFrontMidline(hit, from, to)) return false
  const side = Math.sign(((Number(from[0]) || 0) + (Number(to[0]) || 0)) / 2) || Math.sign(hitX) || 1
  if (side * hitX < 0 && Math.abs(hitX) > 0.04) return false
  if (shouldPosteriorWrap(from, to)) {
    const span = Math.max(length3(sub3(asPathPoint(to), asPathPoint(from))), 1e-6)
    const maxZ = Math.max(Number(from[2]) || 0, Number(to[2]) || 0)
    const meanZ = ((Number(from[2]) || 0) + (Number(to[2]) || 0)) / 2
    const ceiling = Math.max(maxZ, meanZ) + Math.max(0.035, span * 0.12)
    return hitZ <= ceiling
  }
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
