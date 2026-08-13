import { describe, expect, it } from 'vitest'
import {
  buildRouteNodesFromPlaced,
  isOcclusionHitBlocking,
  isSurfaceFacingCamera,
  mergeControlsIntoRoute,
  nextExpectedPoint,
  orderedPlacedPointsForSide,
  placementProgress,
  removePointIdsFromRouteNodes,
  routeHasDrawableAcupoints,
  routeIncludesAllPoints,
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

  it('re-links routes and keeps controls between surviving pairs', () => {
    const previous = [
      { type: 'acupoint', pointId: 'a2' },
      { type: 'control', pointId: null, position: [0, 1, 0] },
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
})
