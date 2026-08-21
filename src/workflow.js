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
export const DEFAULT_TRIPLE_HANDLE_TS = [0.25, 0.5, 0.75]
export const MAX_PAIR_HANDLES = 3
export const MIN_HANDLE_GAP = 0.12
export const HANDLE_END_MARGIN = 0.1

export function isStyledHandle(node) {
  return node?.type === 'control' && HANDLE_STYLES.includes(node.style)
}

/** Keep 1–3 styled handles; drop unstyled legacy piles. */
export function keepPairHandles(controls = []) {
  return (controls || []).filter(isStyledHandle).slice(0, MAX_PAIR_HANDLES)
}

export function defaultHandleTs(count) {
  if (count >= 3) return [...DEFAULT_TRIPLE_HANDLE_TS]
  if (count === 2) return [...DEFAULT_PAIR_HANDLE_TS]
  return [DEFAULT_SINGLE_HANDLE_T]
}

/** Long rest paths get three black locators; short ones get one. */
export function segmentHandleCount(restArcLength, referenceArcLength) {
  const rest = Number(restArcLength)
  if (!Number.isFinite(rest) || rest <= 0) return 1
  const reference = Number.isFinite(referenceArcLength) && referenceArcLength > 1e-4
    ? referenceArcLength
    : FALLBACK_SHORT_SEGMENT_ARC
  return rest > reference ? MAX_PAIR_HANDLES : 1
}

/** Rest-path length wins; already-saved handles are never hidden. */
export function visibleHandleCount(restArcLength, referenceArcLength, storedCount = 0) {
  const byLength = segmentHandleCount(restArcLength, referenceArcLength)
  const stored = Math.min(MAX_PAIR_HANDLES, Math.max(0, Number(storedCount) || 0))
  return Math.min(MAX_PAIR_HANDLES, Math.max(byLength, stored))
}

/**
 * Clamp one handle's rest-path t: 10% from acupoints, and not overlapping
 * sibling handles. `siblingT` may be one t or all other handles' t values.
 */
export function clampPairedHandleT(t, handleIndex, siblingT, count, {
  margin = HANDLE_END_MARGIN,
  gap = MIN_HANDLE_GAP,
} = {}) {
  const others = (Array.isArray(siblingT) ? siblingT : [siblingT])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
  if (count < 2 || !others.length) return clampHandleT(t, margin)
  let minT = margin
  let maxT = 1 - margin
  if (handleIndex <= 0) {
    maxT = Math.min(maxT, Math.min(...others) - gap)
  } else if (handleIndex >= count - 1) {
    minT = Math.max(minT, Math.max(...others) + gap)
  } else {
    const sorted = [...others].sort((a, b) => a - b)
    minT = Math.max(minT, sorted[0] + gap)
    maxT = Math.min(maxT, sorted[sorted.length - 1] - gap)
  }
  if (minT > maxT) {
    return handleIndex <= 0
      ? Math.max(margin, Math.min(...others) - gap)
      : Math.min(1 - margin, Math.max(...others) + gap)
  }
  const value = Number.isFinite(Number(t)) ? Number(t) : (minT + maxT) / 2
  return Math.min(maxT, Math.max(minT, value))
}

/**
 * Fill 1–3 visual slots. Stored handles keep identity; empty slots are
 * null so the caller can sit them on the rest path.
 */
export function resolveHandleSlots(storedHandles, count, restPath = []) {
  const slots = Math.min(MAX_PAIR_HANDLES, Math.max(0, Number(count) || 0))
  const stored = keepPairHandles(storedHandles)
  const ordered = stored
    .map((handle, index) => ({
      handle,
      index,
      t: closestTOnPolyline(restPath, handle.position),
    }))
    .sort((a, b) => a.t - b.t || a.index - b.index)

  if (slots <= 0) return []
  if (slots === 1) return [ordered[0]?.handle || null]

  const filled = Array.from({ length: slots }, () => null)
  const defaults = defaultHandleTs(slots)
  const used = new Set()
  ordered.forEach((item) => {
    let best = -1
    let bestDist = Infinity
    defaults.forEach((slotT, slot) => {
      if (used.has(slot)) return
      const dist = Math.abs(item.t - slotT)
      if (dist < bestDist) {
        bestDist = dist
        best = slot
      }
    })
    if (best >= 0) {
      filled[best] = item.handle
      used.add(best)
    }
  })
  return filled
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

/** Reinsert up to three styled controls between surviving acupoint pairs. */
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

/**
 * Bend a rest-path polyline toward locators so the visible meridian
 * follows dragged black handles without a full geodesic rebuild.
 */
export function pullPolylineThroughLocators(rest = [], records = [], radius = 0.08) {
  if (!Array.isArray(rest) || rest.length < 2) {
    return (records || []).map((record) => [...(record?.position || [0, 0, 0])])
  }
  if (!records?.length) return rest.map((point) => [...point])
  const points = rest.map((point) => [...point])
  const arc = polylineArcLength(points) || 1
  const sigma = Math.max(0.025, Number(radius) || 0.08)
  records.forEach((record) => {
    const targetPos = record?.position
    if (!targetPos) return
    const target = closestTOnPolyline(points, targetPos) * arc
    let walked = 0
    for (let index = 0; index < points.length; index += 1) {
      if (index > 0) walked += dist3(points[index - 1], points[index])
      const weight = Math.exp(-((walked - target) ** 2) / (2 * sigma * sigma))
      if (weight < 0.03) continue
      points[index] = [
        points[index][0] + (targetPos[0] - points[index][0]) * weight,
        points[index][1] + (targetPos[1] - points[index][1]) * weight,
        points[index][2] + (targetPos[2] - points[index][2]) * weight,
      ]
    }
  })
  records.forEach((record) => {
    const targetPos = record?.position
    if (!targetPos) return
    let best = 0
    let bestDistance = Infinity
    points.forEach((point, index) => {
      const distance = dist3(point, targetPos)
      if (distance < bestDistance) {
        bestDistance = distance
        best = index
      }
    })
    if (best > 0 && best < points.length - 1) points[best] = [...targetPos]
  })
  return points
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

export function distanceToPolyline(points = [], probe = [0, 0, 0]) {
  if (!points.length) return Infinity
  return dist3(pointAtPolylineT(points, closestTOnPolyline(points, probe)), probe)
}

/** Unit tangent of a polyline at normalized arc-length t. */
export function polylineTangent(points = [], t = 0.5) {
  if (!points.length) return [0, 1, 0]
  const a = pointAtPolylineT(points, Math.max(0, t - 0.04))
  const b = pointAtPolylineT(points, Math.min(1, t + 0.04))
  const delta = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const length = Math.hypot(...delta) || 1
  return [delta[0] / length, delta[1] / length, delta[2] / length]
}

/** Split a 2D pointer delta into along-tangent and perpendicular (side) pixels. */
export function splitAlongAndSide(delta, tangent) {
  const length = Math.hypot(Number(tangent?.x) || 0, Number(tangent?.y) || 0) || 1
  const tx = (Number(tangent?.x) || 0) / length
  const ty = (Number(tangent?.y) || 0) / length
  const dx = Number(delta?.x) || 0
  const dy = Number(delta?.y) || 0
  return {
    along: dx * tx + dy * ty,
    side: dx * -ty + dy * tx,
  }
}

export function keepHandleStyleOnSlide(style) {
  return style === 'curve' || style === 'linear' ? style : 'along'
}

/**
 * Slide one handle along the currently drawn polyline (not the rest path).
 * Sibling handle and endpoints stay put; stretch style is preserved.
 */
export function slideHandleOnPolyline(polyline, records = [], index = 0, probe = [0, 0, 0]) {
  if (!records.length) return records
  const i = Math.min(Math.max(0, index), records.length - 1)
  const others = records
    .map((record, cursor) => (
      cursor === i ? null : closestTOnPolyline(polyline, record.position)
    ))
    .filter((value) => value != null)
  const t = clampPairedHandleT(
    closestTOnPolyline(polyline, probe),
    i,
    others,
    records.length,
  )
  const position = pointAtPolylineT(polyline, t)
  return records.map((record, cursor) => {
    if (cursor !== i) {
      return { ...record, position: [...record.position] }
    }
    return {
      ...record,
      position: [...position],
      style: keepHandleStyleOnSlide(record.style),
    }
  })
}

/** Neighbors for a local 3-point stretch: previous handle or 穴, next handle or 穴. */
export function stretchHandleNeighbors(from, to, records = [], index = 0) {
  if (!records.length) return { start: from, end: to }
  const i = Math.min(Math.max(0, index), records.length - 1)
  const start = i <= 0 ? from : records[i - 1].position
  const end = i >= records.length - 1 ? to : records[i + 1].position
  return { start, end }
}

/**
 * Logical pair polyline through locators: 穴 → 點… → 穴.
 * Actual on-skin marching happens in the editor.
 */
export function pairControlPolyline(from, to, records = [], restPts = []) {
  const rest = restPts.length >= 2 ? restPts : [from, to]
  if (!records.length) return rest.map((point) => [...point])
  return [from, ...records.map((record) => [...record.position]), to]
}

export const HANDLE_SLIDE_MAX_OFF_PATH = 0.08
export const HANDLE_STRETCH_MAX_OFF_PATH = 0.36
export const HANDLE_SLIDE_PROJECT_RADIUS = 0.07
export const HANDLE_STRETCH_PROJECT_RADIUS = 0.22
/** Snap locators onto the mesh; head chords can sit this far inside the skull. */
export const HANDLE_SKIN_SNAP_RADIUS = 0.4
/**
 * Groin/thigh gap cap only applies when the rest path is clearly a limb.
 * Head/torso/shoulder paths sit closer to x=0, so a 5cm cap would block
 * dragging onto the chest (肩井→淵腋) or temple from a through-body chord.
 */
export const LIMB_GAP_MIN_ABS_X = 0.16
/** @deprecated use HANDLE_STRETCH_MAX_OFF_PATH */
export const HANDLE_DRAG_MAX_OFF_PATH = HANDLE_STRETCH_MAX_OFF_PATH
export const HANDLE_PROJECT_RADIUS = HANDLE_STRETCH_PROJECT_RADIUS

/** How far a probe may leave the rest path on this segment. */
export function limbGapMaxOffPath(restX, maxOffPath = HANDLE_STRETCH_MAX_OFF_PATH) {
  const cap = Number.isFinite(Number(maxOffPath)) ? Number(maxOffPath) : HANDLE_STRETCH_MAX_OFF_PATH
  if (!Number.isFinite(Number(restX)) || Math.abs(restX) < LIMB_GAP_MIN_ABS_X) return cap
  const sep = Math.abs(restX) * 2
  return Math.min(cap, Math.max(0.05, sep * 0.42))
}

export function isCloserToMirroredPolyline(points = [], probe = [0, 0, 0]) {
  if (!points.length) return false
  const mirrored = points.map((point) => [-point[0], point[1], point[2]])
  const offThis = distanceToPolyline(points, probe)
  const offMirror = distanceToPolyline(mirrored, probe)
  return offMirror + 0.03 < offThis
}

/** Allow sideways stretch on the same limb; reject the opposite leg/torso. */
export function isProbeOnSameLimbSegment(rest = [], probe = [0, 0, 0], maxOffPath = HANDLE_STRETCH_MAX_OFF_PATH) {
  if (!rest.length || !probe) return false
  const ys = rest.map((point) => point[1])
  const yMin = Math.min(...ys) - 0.22
  const yMax = Math.max(...ys) + 0.22
  if (probe[1] < yMin || probe[1] > yMax) return false
  if (isCloserToMirroredPolyline(rest, probe)) return false
  const closest = pointAtPolylineT(rest, closestTOnPolyline(rest, probe))
  const off = dist3(probe, closest)
  if (off > maxOffPath) return false
  const restX = closest[0]
  const probeX = probe[0]
  if (Math.abs(restX) > 0.035 && restX * probeX < 0) return false
  // Near the groin the other thigh is close; don't collapse into the inter-leg gap.
  // Skip that cap on the head/torso so temple locators can sit on skin.
  return off <= limbGapMaxOffPath(restX, maxOffPath)
}

/** Slice a polyline between two normalized arc-length values. */
export function polylineSlice(points = [], t0 = 0, t1 = 1, samples = 16) {
  if (!points.length) return []
  const startT = Math.min(1, Math.max(0, Number.isFinite(Number(t0)) ? Number(t0) : 0))
  const endT = Math.min(1, Math.max(0, Number.isFinite(Number(t1)) ? Number(t1) : 1))
  const lo = Math.min(startT, endT)
  const hi = Math.max(startT, endT)
  if (hi - lo < 1e-6) return [pointAtPolylineT(points, lo)]
  const count = Math.max(2, Math.floor(samples))
  const out = []
  for (let index = 0; index < count; index += 1) {
    out.push(pointAtPolylineT(points, lo + (hi - lo) * (index / (count - 1))))
  }
  return startT <= endT ? out : out.reverse()
} 

export function isDisorderedPolyline(points = [], guide = [], { maxLengthRatio = 1.85 } = {}) {
  if (points.length < 4) return false
  const pathLen = polylineArcLength(points)
  const guideLen = polylineArcLength(guide)
  const chord = dist3(points[0], points[points.length - 1])

  let crossings = 0
  for (let index = 1; index < points.length; index += 1) {
    if (points[index - 1][0] * points[index][0] < 0) crossings += 1
  }
  let guideCrossings = 0
  for (let index = 1; index < guide.length; index += 1) {
    if (guide[index - 1][0] * guide[index][0] < 0) guideCrossings += 1
  }
  if (crossings > guideCrossings + 2) return true

  let reversals = 0
  for (let index = 1; index < points.length - 1; index += 1) {
    const prev = points[index - 1]
    const curr = points[index]
    const next = points[index + 1]
    const a = [curr[0] - prev[0], curr[1] - prev[1], curr[2] - prev[2]]
    const b = [next[0] - curr[0], next[1] - curr[1], next[2] - curr[2]]
    const lenA = Math.hypot(...a)
    const lenB = Math.hypot(...b)
    if (lenA < 1e-6 || lenB < 1e-6) continue
    const dot = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (lenA * lenB)
    if (dot < -0.2) reversals += 1
  }
  if (reversals > Math.max(3, points.length * 0.12)) return true

  // A clean wrap around the skull (完骨→本神) is much longer than the 3D chord.
  // Only keep a tight length cap when the polyline already looks chaotic.
  const chaotic = reversals > 1 || crossings > guideCrossings + 1
  const lengthLimit = chaotic ? maxLengthRatio : Math.max(maxLengthRatio, 3.8)
  if (guideLen > 1e-4) {
    if (pathLen > guideLen * lengthLimit) return true
  } else if (chord > 1e-4 && pathLen > chord * (chaotic ? 4.2 : 8)) {
    return true
  }
  return false
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

export const DRAG_THRESHOLD_PX = 4
export const HANDLE_PICK_RADIUS_PX = 16

export function pointerDeltaPx(start, point) {
  if (!start || !point) return 0
  return Math.hypot(Number(point.x) - Number(start.x), Number(point.y) - Number(start.y))
}

export function exceedsDragThreshold(start, point, threshold = DRAG_THRESHOLD_PX) {
  return pointerDeltaPx(start, point) > threshold
}

/** Index of the nearest {x,y} within maxDistance, or -1. */
export function nearestScreenIndex(points = [], probe, maxDistance) {
  const limit = Number(maxDistance)
  if (!(limit > 0) || !probe) return -1
  let best = -1
  let bestDist = limit
  points.forEach((point, index) => {
    const dist = Math.hypot(point.x - probe.x, point.y - probe.y)
    if (dist <= bestDist) {
      bestDist = dist
      best = index
    }
  })
  return best
}
