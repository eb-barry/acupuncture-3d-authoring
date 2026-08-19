export function placementProgress(requiredPoints, placedPoints) {
  const requiredCodes = new Set(requiredPoints.map((point) => point.code))
  const placedCodes = new Set(
    placedPoints
      .map((point) => point.code)
      .filter((code) => requiredCodes.has(code)),
  )
  return {
    placed: placedCodes.size,
    total: requiredCodes.size,
    complete: placedCodes.size === requiredCodes.size,
  }
}

export function nextExpectedPoint(requiredPoints, draftNodes) {
  const used = draftNodes.filter((node) => node.type === 'acupoint').length
  return requiredPoints[used] || null
}

export function routeIncludesAllPoints(requiredPoints, draftNodes) {
  const usedCodes = draftNodes
    .filter((node) => node.type === 'acupoint')
    .map((node) => node.code)
  return usedCodes.length === requiredPoints.length
    && requiredPoints.every((point, index) => point.code === usedCodes[index])
}

/** Placed points for one side, sorted by catalog / international-code order. */
export function orderedPlacedPointsForSide(requiredPoints, placedPoints, side) {
  const byCode = new Map(
    placedPoints
      .filter((point) => point.side === side)
      .map((point) => [point.code, point]),
  )
  return requiredPoints
    .map((required) => byCode.get(required.code))
    .filter(Boolean)
}

/** Build route nodes in international-code order for automatic meridian display. */
export function buildRouteNodesFromPlaced(requiredPoints, placedPoints, side) {
  return orderedPlacedPointsForSide(requiredPoints, placedPoints, side).map((point) => ({
    type: 'acupoint',
    pointId: point.id,
    position: point.position,
    normal: point.normal,
  }))
}

/**
 * Drop removed acupoint nodes from a route. Leading/trailing control nodes that
 * only served a deleted endpoint segment are trimmed so the first/last hole
 * removes its connected segment until the point is placed again.
 */
export function removePointIdsFromRouteNodes(nodes, removedIds) {
  const removed = removedIds instanceof Set ? removedIds : new Set(removedIds)
  const filtered = nodes.filter((node) => !(node.type === 'acupoint' && removed.has(node.pointId)))
  let start = 0
  let end = filtered.length
  while (start < end && filtered[start].type !== 'acupoint') start += 1
  while (end > start && filtered[end - 1].type !== 'acupoint') end -= 1
  return filtered.slice(start, end)
}

export const HANDLE_STYLES = ['along', 'linear', 'curve']
/** LU3–LU4 (天府–俠白) rest-path length when those points are missing. */
export const FALLBACK_SHORT_SEGMENT_ARC = 0.034
export const DEFAULT_SINGLE_HANDLE_T = 0.5
export const DEFAULT_PAIR_HANDLE_TS = [1 / 3, 2 / 3]
export const MIN_HANDLE_GAP = 0.12
export const HANDLE_END_MARGIN = 0.1

export function isStyledHandle(node) {
  return node?.type === 'control' && HANDLE_STYLES.includes(node.style)
}

/** Keep 1–2 styled handles; drop unstyled legacy piles. At most two. */
export function keepPairHandles(controls = []) {
  return (controls || []).filter(isStyledHandle).slice(0, 2)
}

export function defaultHandleTs(count) {
  return count >= 2 ? [...DEFAULT_PAIR_HANDLE_TS] : [DEFAULT_SINGLE_HANDLE_T]
}

/** Long rest paths get two black handles; short ones get one. */
export function segmentHandleCount(restArcLength, referenceArcLength) {
  const rest = Number(restArcLength)
  if (!Number.isFinite(rest) || rest <= 0) return 1
  const reference = Number.isFinite(referenceArcLength) && referenceArcLength > 1e-4
    ? referenceArcLength
    : FALLBACK_SHORT_SEGMENT_ARC
  return rest > reference ? 2 : 1
}

/** Rest-path length wins; already-saved handles are never hidden. */
export function visibleHandleCount(restArcLength, referenceArcLength, storedCount = 0) {
  const byLength = segmentHandleCount(restArcLength, referenceArcLength)
  const stored = Math.min(2, Math.max(0, Number(storedCount) || 0))
  return Math.min(2, Math.max(byLength, stored))
}

/**
 * Clamp one handle's rest-path t: 10% from acupoints, and not overlapping
 * the sibling handle.
 */
export function clampPairedHandleT(t, handleIndex, siblingT, count, {
  margin = HANDLE_END_MARGIN,
  gap = MIN_HANDLE_GAP,
} = {}) {
  if (count < 2 || !Number.isFinite(siblingT)) return clampHandleT(t, margin)
  let minT = margin
  let maxT = 1 - margin
  if (handleIndex <= 0) maxT = Math.min(maxT, siblingT - gap)
  else minT = Math.max(minT, siblingT + gap)
  if (minT > maxT) {
    return handleIndex <= 0
      ? Math.max(margin, siblingT - gap)
      : Math.min(1 - margin, siblingT + gap)
  }
  const value = Number.isFinite(Number(t)) ? Number(t) : (minT + maxT) / 2
  return Math.min(maxT, Math.max(minT, value))
}

/**
 * Fill 1 or 2 visual slots. Stored handles keep identity; empty slots are
 * null so the caller can sit them at 33%/67% (or 50%) on the rest path.
 */
export function resolveHandleSlots(storedHandles, count, restPath = []) {
  const stored = keepPairHandles(storedHandles)
  const ordered = stored
    .map((handle, index) => ({
      handle,
      index,
      t: closestTOnPolyline(restPath, handle.position),
    }))
    .sort((a, b) => a.t - b.t || a.index - b.index)
    .map((item) => item.handle)

  if (count <= 1) return [ordered[0] || null]
  if (ordered.length >= 2) return [ordered[0], ordered[1]]
  if (ordered.length === 1) {
    const t = closestTOnPolyline(restPath, ordered[0].position)
    const defaults = defaultHandleTs(2)
    const useFirstSlot = Math.abs(t - defaults[0]) <= Math.abs(t - defaults[1])
    return useFirstSlot ? [ordered[0], null] : [null, ordered[0]]
  }
  return [null, null]
}

export function handlesBendPath(handles = []) {
  return (handles || []).some((handle) => handle?.style === 'linear' || handle?.style === 'curve')
}

/** Curve wins if mixed; otherwise linear. */
export function primaryBendStyle(handles = []) {
  if ((handles || []).some((handle) => handle?.style === 'curve')) return 'curve'
  if ((handles || []).some((handle) => handle?.style === 'linear')) return 'linear'
  return null
}

/** Reinsert up to two styled controls between surviving acupoint pairs. */
export function mergeControlsIntoRoute(previousNodes, nextAcupointNodes) {
  if (!nextAcupointNodes.length) return []
  if (!previousNodes?.length) return [...nextAcupointNodes]
  const result = []
  for (let index = 0; index < nextAcupointNodes.length; index += 1) {
    result.push(nextAcupointNodes[index])
    if (index >= nextAcupointNodes.length - 1) break
    const fromId = nextAcupointNodes[index].pointId
    const toId = nextAcupointNodes[index + 1].pointId
    const fromIndex = previousNodes.findIndex((node) => node.type === 'acupoint' && node.pointId === fromId)
    const toIndex = previousNodes.findIndex((node) => node.type === 'acupoint' && node.pointId === toId)
    if (fromIndex < 0 || toIndex <= fromIndex) continue
    const controls = []
    for (let cursor = fromIndex + 1; cursor < toIndex; cursor += 1) {
      if (previousNodes[cursor].type === 'control') controls.push(previousNodes[cursor])
    }
    result.push(...keepPairHandles(controls))
  }
  return result
}

export function stripControlNodes(nodes = []) {
  return (nodes || []).filter((node) => node.type === 'acupoint')
}

export function clampHandleT(t, margin = 0.1) {
  const value = Number(t)
  const tt = Number.isFinite(value) ? value : 0.5
  return Math.min(1 - margin, Math.max(margin, tt))
}

function dist3(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

export function polylineArcLength(points = []) {
  let total = 0
  for (let index = 1; index < points.length; index += 1) {
    total += dist3(points[index - 1], points[index])
  }
  return total
}

/** Point at normalized arc-length t along a polyline of [x,y,z] samples. */
export function pointAtPolylineT(points = [], t = 0.5) {
  if (!points.length) return [0, 0, 0]
  if (points.length === 1) return [...points[0]]
  const target = clampHandleT(t, 0) * polylineArcLength(points)
  let walked = 0
  for (let index = 1; index < points.length; index += 1) {
    const span = dist3(points[index - 1], points[index])
    if (walked + span >= target || index === points.length - 1) {
      const local = span > 1e-8 ? (target - walked) / span : 0
      const a = points[index - 1]
      const b = points[index]
      return [
        a[0] + (b[0] - a[0]) * local,
        a[1] + (b[1] - a[1]) * local,
        a[2] + (b[2] - a[2]) * local,
      ]
    }
    walked += span
  }
  return [...points[points.length - 1]]
}

/** Closest arc-length t (0–1) of probe on a polyline. */
export function closestTOnPolyline(points = [], probe = [0, 0, 0]) {
  if (points.length < 2) return 0.5
  const total = polylineArcLength(points) || 1
  let bestDist = Infinity
  let bestAt = 0
  let walked = 0
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1]
    const b = points[index]
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const ap = [probe[0] - a[0], probe[1] - a[1], probe[2] - a[2]]
    const span = dist3(a, b)
    const denom = span * span || 1
    const local = Math.min(1, Math.max(0, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / denom))
    const point = [a[0] + ab[0] * local, a[1] + ab[1] * local, a[2] + ab[2] * local]
    const distance = dist3(point, probe)
    const at = (walked + span * local) / total
    if (distance < bestDist) {
      bestDist = distance
      bestAt = at
    }
    walked += span
  }
  return bestAt
}

/** True when a route still has enough acupoint anchors to draw a segment. */
export function routeHasDrawableAcupoints(nodes) {
  return nodes.filter((node) => node.type === 'acupoint').length >= 2
}

export function isSurfaceFacingCamera(position, normal, cameraPosition) {
  const towardCamera = cameraPosition.map((value, index) => value - position[index])
  const length = Math.hypot(...towardCamera) || 1
  const view = towardCamera.map((value) => value / length)
  const normalLength = Math.hypot(...normal) || 1
  const surfaceNormal = normal.map((value) => value / normalLength)
  const dot = (a, b) => a.reduce((total, value, index) => total + value * b[index], 0)
  // Pure backface test against the stored surface normal — do not use body-radial
  // heuristics here; occlusion rays handle "through the torso" cases.
  return dot(surfaceNormal, view) > 0.02
}

/**
 * Decide whether a mesh hit should count as occluding a surface marker.
 * Hits that land near the probe (creases / local flesh) are treated as the
 * same surface so cubital-fossa points like LU5 are not false-hidden.
 */
export function isOcclusionHitBlocking(hitDistance, targetDistance, hitToProbeDistance, {
  depthSlack = 0.025,
  sameSurfaceRadius = 0.05,
} = {}) {
  if (!(hitDistance >= 0) || !(targetDistance > 0)) return false
  if (hitToProbeDistance <= sameSurfaceRadius) return false
  return hitDistance < targetDistance - depthSlack
}

function vecAdd(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

function vecSub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function vecScale(a, s) {
  return [a[0] * s, a[1] * s, a[2] * s]
}

function vecDot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function vecCross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
}

function vecNorm(a) {
  const length = Math.hypot(a[0], a[1], a[2]) || 1
  return vecScale(a, 1 / length)
}

function lerp3(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ]
}

function unwrapDelta(from, to) {
  let delta = to - from
  while (delta <= -Math.PI) delta += Math.PI * 2
  while (delta > Math.PI) delta -= Math.PI * 2
  return delta
}

/** Straight samples from A to B, inclusive. */
export function straightLinePoints(start, end, steps = 16) {
  const count = Math.max(2, Math.floor(steps) + 1)
  const samples = []
  for (let index = 0; index < count; index += 1) {
    samples.push(lerp3(start, end, index / (count - 1)))
  }
  return samples
}

/**
 * Circular-arc samples from start through mid to end.
 * Collinear points fall back to a two-span polyline.
 */
export function circularArcPoints(start, mid, end, steps = 24) {
  const count = Math.max(4, Math.floor(steps))
  const am = vecSub(mid, start)
  const ab = vecSub(end, start)
  const normal = vecCross(am, ab)
  if (Math.hypot(...normal) < 1e-8) {
    const half = Math.max(1, Math.floor(count / 2))
    const samples = []
    for (let index = 0; index <= half; index += 1) {
      samples.push(lerp3(start, mid, index / half))
    }
    for (let index = 1; index <= count - half; index += 1) {
      samples.push(lerp3(mid, end, index / (count - half)))
    }
    return samples
  }
  const n2 = vecDot(normal, normal)
  const offset = vecCross(
    vecSub(vecScale(ab, vecDot(am, am)), vecScale(am, vecDot(ab, ab))),
    normal,
  )
  const center = vecAdd(start, vecScale(offset, 1 / (2 * n2)))
  const radius = dist3(start, center)
  const axis = vecNorm(normal)
  const xAxis = vecNorm(vecSub(start, center))
  const yAxis = vecNorm(vecCross(axis, xAxis))
  const angleOf = (point) => {
    const vector = vecSub(point, center)
    return Math.atan2(vecDot(vector, yAxis), vecDot(vector, xAxis))
  }
  const midAngle = angleOf(mid)
  const endAngle = angleOf(end)
  const toMid = unwrapDelta(0, midAngle)
  const direction = Math.sign(toMid) || 1
  let toEnd = unwrapDelta(0, endAngle)
  if (Math.sign(toEnd) !== direction && Math.abs(toEnd) > 1e-6) {
    toEnd += direction * Math.PI * 2
  }
  if (Math.abs(toEnd) < Math.abs(toMid) - 1e-6) {
    toEnd += direction * Math.PI * 2
  }
  const samples = []
  for (let index = 0; index <= count; index += 1) {
    const angle = toEnd * (index / count)
    samples.push(vecAdd(
      center,
      vecAdd(
        vecScale(xAxis, Math.cos(angle) * radius),
        vecScale(yAxis, Math.sin(angle) * radius),
      ),
    ))
  }
  return samples
}
