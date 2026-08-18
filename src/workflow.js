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

/** Reinsert at most one control between surviving acupoint pairs. */
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
    // Old multi-handle paths are discarded; keep a single new-style handle only.
    if (controls.length === 1) result.push(controls[0])
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
