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

export function isSurfaceFacingCamera(position, normal, cameraPosition) {
  const towardCamera = cameraPosition.map((value, index) => value - position[index])
  const length = Math.hypot(...towardCamera) || 1
  const view = towardCamera.map((value) => value / length)
  const radialLength = Math.hypot(position[0], position[2]) || 1
  const radial = [position[0] / radialLength, 0, position[2] / radialLength]
  const normalLength = Math.hypot(...normal) || 1
  const surfaceNormal = normal.map((value) => value / normalLength)
  const dot = (a, b) => a.reduce((total, value, index) => total + value * b[index], 0)
  return dot(radial, view) > 0.02 && dot(surfaceNormal, view) > 0.05
}
