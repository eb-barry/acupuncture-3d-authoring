import { describe, expect, it } from 'vitest'
import {
  buildRouteNodesFromPlaced,
  circularArcPoints,
  clampHandleT,
  clampPairedHandleT,
  closestTOnPolyline,
  defaultHandleTs,
  distanceToPolyline,
  exceedsDragThreshold,
  isOcclusionHitBlocking,
  isProbeOnSameLimbSegment,
  isSurfaceFacingCamera,
  keepPairHandles,
  mergeControlsIntoRoute,
  nearestScreenIndex,
  nextExpectedPoint,
  orderedPlacedPointsForSide,
  pairControlPolyline,
  placementProgress,
  pointAtPolylineT,
  polylineArcLength,
  polylineTangent,
  primaryBendStyle,
  removePointIdsFromRouteNodes,
  resolveHandleSlots,
  routeHasDrawableAcupoints,
  routeIncludesAllPoints,
  segmentHandleCount,
  slideHandleOnPolyline,
  splitAlongAndSide,
  straightLinePoints,
  stretchHandleNeighbors,
  stripControlNodes,
  visibleHandleCount,
} from './workflow.js'

const required = [
  { code: 'LU1' },
  { code: 'LU2' },
  { code: 'LU3' },
]

describe('meridian authoring workflow', () => {
  it('requires every unique point before enabling route drawing', () => {
    expect(placementProgress(required, [{ code: 'LU1' }, { code: 'LU1' }])).toEqual({
      placed: 1,
      total: 3,
      complete: false,
    })
    expect(placementProgress(required, required)).toMatchObject({ complete: true })
  })

  it('returns the next point in international code order', () => {
    expect(nextExpectedPoint(required, []).code).toBe('LU1')
    expect(nextExpectedPoint(required, [
      { type: 'acupoint' },
      { type: 'control' },
    ]).code).toBe('LU2')
  })

  it('accepts only a complete ordered route', () => {
    expect(routeIncludesAllPoints(required, [
      { type: 'acupoint', code: 'LU1' },
      { type: 'control' },
      { type: 'acupoint', code: 'LU2' },
      { type: 'acupoint', code: 'LU3' },
    ])).toBe(true)
    expect(routeIncludesAllPoints(required, [
      { type: 'acupoint', code: 'LU2' },
      { type: 'acupoint', code: 'LU1' },
      { type: 'acupoint', code: 'LU3' },
    ])).toBe(false)
  })

  it('builds automatic route nodes in international-code order per side', () => {
    const placed = [
      { id: 'r2', code: 'LU2', side: 'right', position: [1, 0, 0], normal: [1, 0, 0] },
      { id: 'l1', code: 'LU1', side: 'left', position: [-1, 0, 0], normal: [-1, 0, 0] },
      { id: 'l3', code: 'LU3', side: 'left', position: [-1, 1, 0], normal: [-1, 0, 0] },
      { id: 'l2', code: 'LU2', side: 'left', position: [-1, 0.5, 0], normal: [-1, 0, 0] },
    ]
    expect(orderedPlacedPointsForSide(required, placed, 'left').map((point) => point.code))
      .toEqual(['LU1', 'LU2', 'LU3'])
    expect(buildRouteNodesFromPlaced(required, placed, 'left').map((node) => node.pointId))
      .toEqual(['l1', 'l2', 'l3'])
  })

  it('trims first/last acupoint segments when endpoints are deleted', () => {
    const nodes = [
      { type: 'acupoint', pointId: 'a1' },
      { type: 'control', pointId: null },
      { type: 'acupoint', pointId: 'a2' },
      { type: 'control', pointId: null },
      { type: 'acupoint', pointId: 'a3' },
    ]
    expect(removePointIdsFromRouteNodes(nodes, ['a1']).map((node) => node.pointId || node.type))
      .toEqual(['a2', 'control', 'a3'])
    expect(removePointIdsFromRouteNodes(nodes, ['a3']).map((node) => node.pointId || node.type))
      .toEqual(['a1', 'control', 'a2'])
    expect(routeHasDrawableAcupoints(removePointIdsFromRouteNodes(nodes, ['a1', 'a2']))).toBe(false)
  })

  it('re-links routes and keeps a single control between surviving pairs', () => {
    const previous = [
      { type: 'acupoint', pointId: 'a2' },
      { type: 'control', pointId: null, style: 'along', position: [0, 1, 0] },
      { type: 'acupoint', pointId: 'a3' },
    ]
    const next = [
      { type: 'acupoint', pointId: 'a1' },
      { type: 'acupoint', pointId: 'a2' },
      { type: 'acupoint', pointId: 'a3' },
    ]
    expect(mergeControlsIntoRoute(previous, next).map((node) => node.pointId || 'control'))
      .toEqual(['a1', 'a2', 'control', 'a3'])
  })

  it('re-links routes and keeps two styled controls between a pair', () => {
    const previous = [
      { type: 'acupoint', pointId: 'a2' },
      { type: 'control', pointId: null, style: 'curve', position: [0, 1, 0] },
      { type: 'control', pointId: null, style: 'along', position: [0, 1.2, 0] },
      { type: 'acupoint', pointId: 'a3' },
    ]
    const next = [
      { type: 'acupoint', pointId: 'a1' },
      { type: 'acupoint', pointId: 'a2' },
      { type: 'acupoint', pointId: 'a3' },
    ]
    expect(mergeControlsIntoRoute(previous, next).map((node) => node.style || node.pointId))
      .toEqual(['a1', 'a2', 'curve', 'along', 'a3'])
  })

  it('discards legacy multi-handle paths between a pair', () => {
    const previous = [
      { type: 'acupoint', pointId: 'a1' },
      { type: 'control', pointId: null },
      { type: 'control', pointId: null },
      { type: 'control', pointId: null },
      { type: 'acupoint', pointId: 'a2' },
    ]
    const next = [
      { type: 'acupoint', pointId: 'a1' },
      { type: 'acupoint', pointId: 'a2' },
    ]
    expect(mergeControlsIntoRoute(previous, next).map((node) => node.pointId || 'control'))
      .toEqual(['a1', 'a2'])
    expect(stripControlNodes(previous).map((node) => node.pointId)).toEqual(['a1', 'a2'])
  })

  it('hides front-surface labels from a rear camera', () => {
    const frontPoint = [0.2, 1.5, 0.3]
    const frontNormal = [0, 0, 1]
    expect(isSurfaceFacingCamera(frontPoint, frontNormal, [0, 1.5, 5])).toBe(true)
    expect(isSurfaceFacingCamera(frontPoint, frontNormal, [0, 1.5, -5])).toBe(false)
  })

  it('does not treat crease-local hits as occluders', () => {
    // Probe in cubital fossa: first hit is nearby flesh, not a far occluder.
    expect(isOcclusionHitBlocking(2.96, 3.0, 0.02)).toBe(false)
    // True occlusion: torso between camera and a front point viewed from back.
    expect(isOcclusionHitBlocking(1.2, 3.0, 1.8)).toBe(true)
  })

  it('clamps the segment handle away from endpoints and samples polylines', () => {
    expect(clampHandleT(0)).toBe(0.1)
    expect(clampHandleT(1)).toBe(0.9)
    expect(clampHandleT(0.5)).toBe(0.5)
    const line = [[0, 0, 0], [10, 0, 0]]
    expect(polylineArcLength(line)).toBe(10)
    expect(pointAtPolylineT(line, 0.5)).toEqual([5, 0, 0])
    expect(closestTOnPolyline(line, [7, 1, 0])).toBeCloseTo(0.7)
  })

  it('gives long rest-path segments two handles against the LU3–LU4 reference', () => {
    expect(segmentHandleCount(0.032, 0.033)).toBe(1)
    expect(segmentHandleCount(0.178, 0.033)).toBe(2)
    expect(segmentHandleCount(0.178, null)).toBe(2)
    expect(segmentHandleCount(0.03, null)).toBe(1)
    expect(visibleHandleCount(0.03, 0.033, 0)).toBe(1)
    expect(visibleHandleCount(0.18, 0.033, 0)).toBe(2)
    expect(visibleHandleCount(0.03, 0.033, 2)).toBe(2)
  })

  it('keeps one or two styled handles and fills default slots', () => {
    const along = { type: 'control', style: 'along', position: [3, 0, 0] }
    const curve = { type: 'control', style: 'curve', position: [7, 0, 0] }
    const line = [[0, 0, 0], [10, 0, 0]]
    expect(keepPairHandles([{ type: 'control', position: [1, 0, 0] }, { type: 'control', position: [2, 0, 0] }]))
      .toEqual([])
    expect(keepPairHandles([along, curve]).map((node) => node.style)).toEqual(['along', 'curve'])
    expect(defaultHandleTs(1)).toEqual([0.5])
    expect(defaultHandleTs(2)).toEqual([1 / 3, 2 / 3])
    expect(resolveHandleSlots([], 2, line)).toEqual([null, null])
    expect(resolveHandleSlots([along], 2, line)[0]).toBe(along)
    expect(resolveHandleSlots([along], 2, line)[1]).toBeNull()
    expect(resolveHandleSlots([curve], 2, line)[0]).toBeNull()
    expect(resolveHandleSlots([curve], 2, line)[1]).toBe(curve)
    expect(clampPairedHandleT(0.5, 0, 0.67, 2)).toBeCloseTo(0.5)
    expect(clampPairedHandleT(0.8, 0, 0.67, 2)).toBeCloseTo(0.55)
    expect(clampPairedHandleT(0.1, 1, 0.33, 2)).toBeCloseTo(0.45)
  })

  it('samples a circular arc through three points and a straight chord', () => {
    const arc = circularArcPoints([1, 0, 0], [0, 1, 0], [-1, 0, 0], 16)
    expect(arc[0][0]).toBeCloseTo(1)
    expect(arc[0][1]).toBeCloseTo(0)
    expect(arc[arc.length - 1][0]).toBeCloseTo(-1)
    expect(arc[arc.length - 1][1]).toBeCloseTo(0)
    const crest = arc[Math.floor(arc.length / 2)]
    expect(crest[1]).toBeCloseTo(1, 1)
    arc.forEach((point) => {
      expect(Math.hypot(point[0], point[1], point[2])).toBeCloseTo(1, 5)
    })
    const line = straightLinePoints([0, 0, 0], [2, 0, 0], 4)
    expect(line[0]).toEqual([0, 0, 0])
    expect(line[line.length - 1]).toEqual([2, 0, 0])
    expect(line[2]).toEqual([1, 0, 0])
    const collinear = circularArcPoints([0, 0, 0], [1, 0, 0], [2, 0, 0], 8)
    expect(collinear[0]).toEqual([0, 0, 0])
    expect(collinear[collinear.length - 1]).toEqual([2, 0, 0])
    expect(primaryBendStyle([{ style: 'linear' }, { style: 'curve' }])).toBe('curve')
    expect(primaryBendStyle([{ style: 'linear' }])).toBe('linear')
    expect(primaryBendStyle([{ style: 'along' }])).toBeNull()
  })

  it('does not treat a still click as a handle drag', () => {
    const start = { x: 100, y: 80 }
    expect(exceedsDragThreshold(start, { x: 101, y: 81 })).toBe(false)
    expect(exceedsDragThreshold(start, { x: 108, y: 80 })).toBe(true)
    expect(nearestScreenIndex(
      [{ x: 10, y: 10 }, { x: 40, y: 12 }, { x: 90, y: 90 }],
      { x: 42, y: 10 },
      16,
    )).toBe(1)
    expect(nearestScreenIndex([{ x: 0, y: 0 }], { x: 40, y: 0 }, 16)).toBe(-1)
  })

  it('measures how far a probe sits from a rest-path polyline', () => {
    const line = [[0, 0, 0], [10, 0, 0]]
    expect(distanceToPolyline(line, [5, 0, 0])).toBeCloseTo(0)
    expect(distanceToPolyline(line, [5, 2, 0])).toBeCloseTo(2)
    expect(distanceToPolyline(line, [50, 0, 0])).toBeCloseTo(40)
  })

  it('lets a stretch probe leave the rest path but not jump to the other limb', () => {
    const left = [[-0.22, 1.0, 0.05], [-0.20, 0.8, 0.04]]
    expect(isProbeOnSameLimbSegment(left, [-0.28, 0.9, 0.08], 0.36)).toBe(true)
    expect(isProbeOnSameLimbSegment(left, [0.22, 0.9, 0.05], 0.36)).toBe(false)
    expect(isProbeOnSameLimbSegment(left, [-0.22, 0.2, 0.05], 0.36)).toBe(false)
  })

  it('splits screen motion into along-path and sideways components', () => {
    expect(polylineTangent([[0, 0, 0], [10, 0, 0]], 0.5)).toEqual([1, 0, 0])
    const split = splitAlongAndSide({ x: 10, y: 6 }, { x: 1, y: 0 })
    expect(split.along).toBeCloseTo(10)
    expect(split.side).toBeCloseTo(6)
  })

  it('slides one handle along the current polyline without snapping back or dropping stretch style', () => {
    const rest = straightLinePoints([0, 0, 0], [10, 0, 0], 10)
    const current = circularArcPoints([0, 0, 0], [5, 4, 0], [10, 0, 0], 16)
    const records = [
      { type: 'control', style: 'curve', position: [5, 4, 0], normal: [0, 0, 1] },
    ]
    const next = slideHandleOnPolyline(current, records, 0, [7, 3, 0])
    expect(next[0].style).toBe('curve')
    expect(distanceToPolyline(current, next[0].position)).toBeCloseTo(0, 5)
    expect(distanceToPolyline(rest, next[0].position)).toBeGreaterThan(1)
  })

  it('keeps the sibling handle and uses 3-point neighbors while stretching', () => {
    const records = [
      { position: [4, 1, 0], style: 'curve' },
      { position: [8, 0, 0], style: 'along' },
    ]
    expect(stretchHandleNeighbors([0, 0, 0], [12, 0, 0], records, 0))
      .toEqual({ start: [0, 0, 0], end: [8, 0, 0] })
    expect(stretchHandleNeighbors([0, 0, 0], [12, 0, 0], records, 1))
      .toEqual({ start: [4, 1, 0], end: [12, 0, 0] })
    expect(stretchHandleNeighbors([0, 0, 0], [12, 0, 0], records.slice(0, 1), 0))
      .toEqual({ start: [0, 0, 0], end: [12, 0, 0] })

    const rest = straightLinePoints([0, 0, 0], [12, 0, 0], 12)
    const stretchedFirst = pairControlPolyline([0, 0, 0], [12, 0, 0], records, rest)
    const afterSibling = stretchedFirst.filter((point) => point[0] >= 8.05)
    afterSibling.forEach((point) => {
      expect(point[1]).toBeCloseTo(0, 1)
    })
    const crest = stretchedFirst.reduce((best, point) => (point[1] > best[1] ? point : best))
    expect(crest[1]).toBeGreaterThan(0.5)

    const stretchedSecond = pairControlPolyline([0, 0, 0], [12, 0, 0], [
      { position: [4, 0, 0], style: 'along' },
      { position: [8, 3, 0], style: 'linear' },
    ], rest)
    const beforeFirst = stretchedSecond.filter((point) => point[0] <= 3.95)
    beforeFirst.forEach((point) => {
      expect(point[1]).toBeCloseTo(0, 1)
    })
  })
})
