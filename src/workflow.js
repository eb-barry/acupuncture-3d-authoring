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
