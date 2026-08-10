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
