import { describe, expect, it } from 'vitest'
import {
  buildRouteNodesFromPlaced,
  catalogSequence,
  circularArcPoints,
  clampHandleT,
  clampPairedHandleT,
  closestTOnPolyline,
  defaultHandleTs,
  distanceToPolyline,
  exceedsDragThreshold,
  isDisorderedPolyline,
  isOcclusionHitBlocking,
  isProbeOnSameLimbSegment,
  isSurfaceFacingCamera,
  keepPairHandles,
  limbGapMaxOffPath,
  mergeControlsIntoRoute,
  nearestScreenIndex,
  normalizePlacedPointSide,
  orderRouteAcupointsForDrawing,
  placedPointSide,
  nextExpectedPoint,
  orderedPlacedPointsForSide,
  pairControlPolyline,
  placementProgress,
  pointAtPolylineT,
  polylineArcLength,
  locatorSpans,
  polylineSlice,
  polylineTangent,
  primaryBendStyle,
  removePointIdsFromRouteNodes,
  resolveHandleSlots,
  drawableSurfacePairRuns,
  routeHasDrawableAcupoints,
  routeIncludesAllPoints,
  sameSpatialSide,
  spatialSideFromPosition,
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

  it('groups a side by body position, not a swapped left/right label', () => {
    const requiredHT = [{ code: 'HT3' }, { code: 'HT4' }]
    const placed = [
      { id: 'label-left-on-right', code: 'HT3', side: 'left', position: [0.2, 1, 0], normal: [1, 0, 0] },
      { id: 'label-right-on-left', code: 'HT3', side: 'right', position: [-0.2, 1, 0], normal: [-1, 0, 0] },
      { id: 'ht4-right', code: 'HT4', side: 'left', position: [0.25, 0.8, 0], normal: [1, 0, 0] },
      { id: 'ht4-left', code: 'HT4', side: 'right', position: [-0.25, 0.8, 0], normal: [-1, 0, 0] },
    ]
    expect(orderedPlacedPointsForSide(requiredHT, placed, 'left').map((point) => point.id))
      .toEqual(['label-right-on-left', 'ht4-left'])
    expect(orderedPlacedPointsForSide(requiredHT, placed, 'right').map((point) => point.id))
      .toEqual(['label-left-on-right', 'ht4-right'])
    expect(normalizePlacedPointSide(placed[0]).side).toBe('right')
    expect(placedPointSide(placed[1])).toBe('left')
  })

  it('orders interleaved left/right acupoints into two same-side code runs', () => {
    expect(catalogSequence('HT9')).toBe(9)
    expect(orderRouteAcupointsForDrawing([
      { code: 'HT3', side: 'left', sequence: 3, index: 0 },
      { code: 'HT4', side: 'right', sequence: 4, index: 1 },
      { code: 'HT4', side: 'left', sequence: 4, index: 2 },
      { code: 'HT3', side: 'right', sequence: 3, index: 3 },
    ]).map((item) => `${item.side}:${item.code}`)).toEqual([
      'left:HT3',
      'left:HT4',
      'right:HT3',
      'right:HT4',
    ])
    expect(sameSpatialSide({ position: [-0.2, 1, 0] }, { position: [0.2, 0.8, 0] })).toBe(false)
    expect(sameSpatialSide({ position: [-0.2, 1, 0] }, { position: [-0.25, 0.8, 0] })).toBe(true)
    expect(spatialSideFromPosition([0.2, 1, 0], 'left')).toBe('right')
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

  it('does not keep locators that sat across an opposite-side acupoint', () => {
    const previous = [
      { type: 'acupoint', pointId: 'L3' },
      { type: 'control', pointId: null, style: 'along', position: [0, 0, 0] },
      { type: 'acupoint', pointId: 'R4' },
      { type: 'control', pointId: null, style: 'along', position: [1, 0, 0] },
      { type: 'acupoint', pointId: 'L4' },
    ]
    const next = [
      { type: 'acupoint', pointId: 'L3' },
      { type: 'acupoint', pointId: 'L4' },
    ]
    expect(mergeControlsIntoRoute(previous, next).map((node) => node.pointId || node.type))
      .toEqual(['L3', 'L4'])
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
    expect(polylineSlice(line, 0.2, 0.5, 4)[0]).toEqual([2, 0, 0])
    expect(polylineSlice(line, 0.2, 0.5, 4).at(-1)).toEqual([5, 0, 0])
  })

  it('gives long rest-path segments three locators against the LU3–LU4 reference', () => {
    expect(segmentHandleCount(0.032, 0.033)).toBe(1)
    expect(segmentHandleCount(0.178, 0.033)).toBe(3)
    expect(segmentHandleCount(0.178, null)).toBe(3)
    expect(segmentHandleCount(0.03, null)).toBe(1)
    expect(visibleHandleCount(0.03, 0.033, 0)).toBe(1)
    expect(visibleHandleCount(0.18, 0.033, 0)).toBe(3)
    expect(visibleHandleCount(0.03, 0.033, 2)).toBe(2)
    expect(visibleHandleCount(0.18, 0.033, 2)).toBe(3)
  })

  it('keeps up to three styled locators and fills default slots', () => {
    const along = { type: 'control', style: 'along', position: [3, 0, 0] }
    const curve = { type: 'control', style: 'curve', position: [7, 0, 0] }
    const third = { type: 'control', style: 'along', position: [9, 0, 0] }
    const line = [[0, 0, 0], [10, 0, 0]]
    expect(keepPairHandles([{ type: 'control', position: [1, 0, 0] }, { type: 'control', position: [2, 0, 0] }]))
      .toEqual([])
    expect(keepPairHandles([along, curve, third]).map((node) => node.position[0])).toEqual([3, 7, 9])
    expect(defaultHandleTs(1)).toEqual([0.5])
    expect(defaultHandleTs(2)).toEqual([1 / 3, 2 / 3])
    expect(defaultHandleTs(3)).toEqual([0.25, 0.5, 0.75])
    expect(resolveHandleSlots([], 2, line)).toEqual([null, null])
    expect(resolveHandleSlots([along], 2, line)[0]).toBe(along)
    expect(resolveHandleSlots([along], 2, line)[1]).toBeNull()
    expect(resolveHandleSlots([curve], 2, line)[0]).toBeNull()
    expect(resolveHandleSlots([curve], 2, line)[1]).toBe(curve)
    expect(resolveHandleSlots([], 3, line)).toEqual([null, null, null])
    expect(resolveHandleSlots([along], 3, line)[0]).toBe(along)
    expect(resolveHandleSlots([curve], 3, line)[2]).toBe(curve)
    expect(clampPairedHandleT(0.5, 0, 0.67, 2)).toBeCloseTo(0.5)
    expect(clampPairedHandleT(0.8, 0, 0.67, 2)).toBeCloseTo(0.55)
    expect(clampPairedHandleT(0.1, 1, 0.33, 2)).toBeCloseTo(0.45)
    expect(clampPairedHandleT(0.9, 1, [0.25, 0.75], 3)).toBeCloseTo(0.63)
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
    expect(isProbeOnSameLimbSegment(left, [0, 0.9, 0.05], 0.36)).toBe(false)
  })

  it('lets head locators sit on temple skin instead of a through-skull chord', () => {
    // 完骨 → 本神: the 3D chord is inside the head (|x| ≈ 0.06).
    const gbHead = [[0.085, 1.52, -0.03], [0.055, 1.62, 0.08]]
    const temple = [0.12, 1.57, 0.02]
    expect(limbGapMaxOffPath(0.065, 0.36)).toBeCloseTo(0.36)
    expect(limbGapMaxOffPath(-0.21, 0.36)).toBeLessThan(0.2)
    expect(isProbeOnSameLimbSegment(gbHead, temple, 0.36)).toBe(true)
    expect(isProbeOnSameLimbSegment(gbHead, [-0.12, 1.57, 0.02], 0.36)).toBe(false)
  })

  it('lets 肩井–淵腋 locators move onto the front of the chest', () => {
    const shoulder = [[0.12, 1.42, -0.02], [0.15, 1.18, 0.01]]
    const frontChest = [0.11, 1.28, 0.08]
    expect(limbGapMaxOffPath(0.13, 0.36)).toBeCloseTo(0.36)
    expect(isProbeOnSameLimbSegment(shoulder, frontChest, 0.36)).toBe(true)
  })

  it('flags a saw-tooth polyline that crosses the midline or backtracks', () => {
    const guide = straightLinePoints([-0.2, 1, 0.05], [-0.18, 0.7, 0.04], 8)
    const zigzag = []
    for (let index = 0; index <= 20; index += 1) {
      zigzag.push([index % 2 === 0 ? -0.06 : 0.06, 1 - index * 0.015, 0.02])
    }
    expect(isDisorderedPolyline(zigzag, guide)).toBe(true)
    expect(isDisorderedPolyline(guide, guide)).toBe(false)
    const arc = circularArcPoints([-0.2, 1, 0], [-0.1, 1.08, 0.04], [0, 1, 0], 16)
    expect(isDisorderedPolyline(arc, straightLinePoints([-0.2, 1, 0], [0, 1, 0], 8))).toBe(false)
  })

  it('keeps a smooth cranial wrap that is longer than the 3D chord', () => {
    const wrap = []
    for (let index = 0; index <= 16; index += 1) {
      const t = index / 16
      wrap.push([
        0.08 + (0.05 - 0.08) * t + 0.12 * Math.sin(Math.PI * t),
        1.52 + 0.10 * t,
        -0.04 + 0.13 * t,
      ])
    }
    const chord = straightLinePoints(wrap[0], wrap[wrap.length - 1], 8)
    const ratio = polylineArcLength(wrap) / polylineArcLength(chord)
    expect(ratio).toBeGreaterThan(1.7)
    expect(isDisorderedPolyline(wrap, chord, { maxLengthRatio: 1.7 })).toBe(false)
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

  it('chains locators as 穴 → 點… → 穴 without changing the far span', () => {
    const records = [
      { position: [4, 1, 0], style: 'along' },
      { position: [8, 0, 0], style: 'along' },
    ]
    expect(stretchHandleNeighbors([0, 0, 0], [12, 0, 0], records, 0))
      .toEqual({ start: [0, 0, 0], end: [8, 0, 0] })
    expect(stretchHandleNeighbors([0, 0, 0], [12, 0, 0], records, 1))
      .toEqual({ start: [4, 1, 0], end: [12, 0, 0] })

    const rest = straightLinePoints([0, 0, 0], [12, 0, 0], 12)
    const movedFirst = pairControlPolyline([0, 0, 0], [12, 0, 0], records, rest)
    expect(movedFirst).toEqual([[0, 0, 0], [4, 1, 0], [8, 0, 0], [12, 0, 0]])
    const triple = pairControlPolyline([0, 0, 0], [12, 0, 0], [
      { position: [3, 0, 0] },
      { position: [6, 2, 0] },
      { position: [9, 0, 0] },
    ], rest)
    expect(triple).toHaveLength(5)
    expect(triple[2]).toEqual([6, 2, 0])
    expect(triple[4]).toEqual([12, 0, 0])
  })

  it('keeps unmoved locator spans on the rest path instead of starring extra segments', () => {
    const rest = straightLinePoints([0, 0, 0], [12, 0, 0], 12)
    const from = { position: [0, 0, 0], normal: [0, 0, 1] }
    const to = { position: [12, 0, 0], normal: [0, 0, 1] }
    const onPath = locatorSpans(rest, from, to, [
      { position: [3, 0, 0], normal: [0, 0, 1] },
      { position: [6, 0, 0], normal: [0, 0, 1] },
      { position: [9, 0, 0], normal: [0, 0, 1] },
    ])
    expect(onPath).toHaveLength(4)
    expect(onPath.every((span) => span.restSlice?.length >= 2)).toBe(true)

    const stretched = locatorSpans(rest, from, to, [
      { position: [3, 0, 0], normal: [0, 0, 1] },
      { position: [6, 2, 0], normal: [0, 0, 1] },
      { position: [9, 0, 0], normal: [0, 0, 1] },
    ])
    expect(stretched[0].restSlice).toBeTruthy()
    expect(stretched[1].restSlice).toBeNull()
    expect(stretched[2].restSlice).toBeNull()
    expect(stretched[3].restSlice).toBeTruthy()
    const kept = [...stretched[0].restSlice, ...stretched[3].restSlice]
    expect(Math.max(...kept.map((point) => Math.abs(point[1])))).toBeLessThan(0.05)
  })

  it('breaks drawable surface runs at omitted spans so neighbors are not concatenated', () => {
    const pairs = [
      { from: 'BL39', to: 'BL40' },
      { from: 'BL40', to: 'BL41' },
      { from: 'BL41', to: 'BL42' },
    ]
    const omitted = (pair) => pair.from === 'BL40' && pair.to === 'BL41'
    expect(drawableSurfacePairRuns(pairs, omitted)).toEqual([
      [{ from: 'BL39', to: 'BL40' }],
      [{ from: 'BL41', to: 'BL42' }],
    ])
    expect(drawableSurfacePairRuns(pairs, () => false)).toHaveLength(1)
    expect(drawableSurfacePairRuns(pairs, () => true)).toEqual([])
  })
})
