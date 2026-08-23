import { describe, expect, it } from 'vitest'
import {
  COARSE_SAMPLE_STEP,
  DEFAULT_SKIN_LIFT_MM,
  FINE_SAMPLE_STEP,
  MARKER_MIN_PIXELS,
  RIBBON_MIN_PIXELS,
  SURFACE_TOLERANCE,
  buildDiscAttributes,
  buildRibbonAttributes,
  chordSagitta,
  conformDisc,
  conformPath,
  curvatureSampleStep,
  densifyPath,
  markerScreenScale,
  maxSurfaceDeviation,
  pathTangent,
  perspectivePixelScale,
  ribbonRenderWidth,
  ribbonSideDirections,
  sampleStepForQuality,
  smoothPathNormals,
  worldPerMillimetre,
  worldPerPixel,
} from './skinRibbon.js'

const SPHERE_RADIUS = 0.05

/** Analytic stand-in for the BVH projector: nearest point on a sphere. */
function sphereProjector(center = [0, 0, 0], radius = SPHERE_RADIUS) {
  return (point) => {
    const delta = [point[0] - center[0], point[1] - center[1], point[2] - center[2]]
    const length = Math.hypot(...delta) || 1
    const normal = [delta[0] / length, delta[1] / length, delta[2] / length]
    return {
      position: [
        center[0] + normal[0] * radius,
        center[1] + normal[1] * radius,
        center[2] + normal[2] * radius,
      ],
      normal,
    }
  }
}

function onSphere(angle, radius = SPHERE_RADIUS) {
  return [Math.cos(angle) * radius, Math.sin(angle) * radius, 0]
}

describe('skin ribbon sampling', () => {
  it('ships with no world-space lift and a curvature-justified fine step', () => {
    expect(DEFAULT_SKIN_LIFT_MM).toBe(0)
    // Fingers are the tightest skin (radius ≈ 8 mm) and set the sampling bound.
    expect(curvatureSampleStep(0.008, SURFACE_TOLERANCE)).toBeGreaterThan(FINE_SAMPLE_STEP)
    expect(chordSagitta(FINE_SAMPLE_STEP, 0.008)).toBeLessThan(SURFACE_TOLERANCE)
    expect(chordSagitta(COARSE_SAMPLE_STEP, 0.008)).toBeGreaterThan(SURFACE_TOLERANCE)
    expect(sampleStepForQuality('coarse')).toBe(COARSE_SAMPLE_STEP)
    expect(sampleStepForQuality('fine')).toBe(FINE_SAMPLE_STEP)
  })

  it('densifies without mutating the authored polyline', () => {
    const authored = [[0, 0, 0], [0.05, 0, 0]]
    const snapshot = JSON.stringify(authored)
    const dense = densifyPath(authored, 0.002)
    expect(JSON.stringify(authored)).toBe(snapshot)
    expect(dense.length).toBeGreaterThan(20)
    expect(dense[0]).toEqual([0, 0, 0])
    expect(dense[dense.length - 1]).toEqual([0.05, 0, 0])
  })

  it('caps sample count on an unexpectedly long run', () => {
    const dense = densifyPath([[0, 0, 0], [40, 0, 0]], 0.002, { maxSamples: 500 })
    expect(dense.length).toBeLessThanOrEqual(502)
  })

  it('pulls every sample onto the surface and reads back its normal', () => {
    const project = sphereProjector()
    // A chord across the sphere: midpoints start well inside the surface.
    const chord = densifyPath([onSphere(0), onSphere(Math.PI / 3)], 0.002)
    expect(maxSurfaceDeviation(chord, project)).toBeGreaterThan(0.001)

    const conformed = conformPath(chord, project)
    expect(conformed.unresolved).toBe(0)
    expect(maxSurfaceDeviation(conformed.points, project)).toBeLessThan(1e-9)
    conformed.normals.forEach((normal) => {
      expect(Math.hypot(...normal)).toBeCloseTo(1, 6)
    })
  })

  it('keeps an authored sample when the projector refuses or would jump', () => {
    const stubborn = () => null
    const kept = conformPath([[0, 0.1, 0], [0, 0.11, 0]], stubborn)
    expect(kept.unresolved).toBe(2)
    expect(kept.points[0]).toEqual([0, 0.1, 0])

    const faraway = conformPath([[0, 1, 0]], sphereProjector(), { maxPull: 0.001 })
    expect(faraway.unresolved).toBe(1)
    expect(faraway.points[0]).toEqual([0, 1, 0])
  })

  it('refuses a crease sample that would hop to the opposite wall', () => {
    // Wall A faces +Z; the second sample is offered a hit facing −Z, 2 mm away.
    const creek = (point) => (point[2] > 0
      ? { position: [point[0], point[1], 0.001], normal: [0, 0, 1] }
      : { position: [point[0], point[1], -0.001], normal: [0, 0, -1] })
    const conformed = conformPath([[0, 0, 0.002], [0, 0.002, -0.002]], creek)
    expect(conformed.unresolved).toBe(1)
    // The refused sample keeps the authored place and the wall's normal.
    expect(conformed.points[1]).toEqual([0, 0.002, -0.002])
    expect(conformed.normals[1]).toEqual([0, 0, 1])
  })

  it('smooths normals without moving the endpoints', () => {
    const normals = [[1, 0, 0], [0, 1, 0], [1, 0, 0]]
    const smoothed = smoothPathNormals(normals, 1)
    expect(smoothed[0]).toEqual([1, 0, 0])
    expect(smoothed[2]).toEqual([1, 0, 0])
    expect(smoothed[1][0]).toBeGreaterThan(0)
    expect(Math.hypot(...smoothed[1])).toBeCloseTo(1, 6)
  })
})

describe('ribbon frame and geometry', () => {
  it('offsets stay in the tangent plane and never flip side', () => {
    const project = sphereProjector()
    const conformed = conformPath(
      densifyPath([onSphere(0), onSphere(Math.PI / 2)], 0.002),
      project,
    )
    const sides = ribbonSideDirections(conformed.points, conformed.normals)
    sides.forEach((side, index) => {
      expect(Math.hypot(...side)).toBeCloseTo(1, 5)
      const normal = conformed.normals[index]
      const outOfPlane = side[0] * normal[0] + side[1] * normal[1] + side[2] * normal[2]
      expect(Math.abs(outOfPlane)).toBeLessThan(1e-6)
      if (index === 0) return
      const previous = sides[index - 1]
      const agreement = side[0] * previous[0] + side[1] * previous[1] + side[2] * previous[2]
      expect(agreement).toBeGreaterThan(0)
    })
  })

  it('follows the path tangent by central difference', () => {
    const tangent = pathTangent([[0, 0, 0], [0, 0.01, 0], [0, 0.02, 0]], 1)
    expect(tangent).toEqual([0, 1, 0])
  })

  it('builds a two-lane strip whose centreline is the on-skin path', () => {
    const points = [[0, 0, 0], [0, 0.01, 0], [0, 0.02, 0]]
    const normals = [[0, 0, 1], [0, 0, 1], [0, 0, 1]]
    const attributes = buildRibbonAttributes(points, normals)
    expect(attributes.vertexCount).toBe(6)
    expect(attributes.index.length).toBe(12)
    // Both lanes carry the centreline; the shader widens along `offset`.
    expect([...attributes.position.slice(0, 3)]).toEqual([0, 0, 0])
    expect([...attributes.position.slice(3, 6)]).toEqual([0, 0, 0])
    const left = [...attributes.offset.slice(0, 3)]
    const right = [...attributes.offset.slice(3, 6)]
    expect(left.map((value, axis) => value + right[axis])).toEqual([0, 0, 0])
    expect(Math.hypot(...left)).toBeCloseTo(1, 6)
    expect(Math.max(...attributes.index)).toBeLessThan(attributes.vertexCount)
  })

  it('returns an empty strip for a degenerate run', () => {
    const attributes = buildRibbonAttributes([[0, 0, 0]], [[0, 1, 0]])
    expect(attributes.vertexCount).toBe(0)
    expect(attributes.index.length).toBe(0)
  })
})

describe('screen-space width control', () => {
  it('measures pixel size for both camera kinds', () => {
    const near = worldPerPixel({ distance: 0.5, fovDeg: 45, viewportHeight: 800 })
    const far = worldPerPixel({ distance: 5, fovDeg: 45, viewportHeight: 800 })
    expect(near).toBeLessThan(far)
    expect(worldPerPixel({ orthoViewHeight: 2, viewportHeight: 800 })).toBeCloseTo(0.0025, 6)
    expect(perspectivePixelScale(45, 800) * 5).toBeCloseTo(far, 9)
  })

  it('holds the ink width and only widens to the pixel floor, trading coverage', () => {
    const width = 0.0035
    const zoomedIn = ribbonRenderWidth(width, 0.0002, RIBBON_MIN_PIXELS)
    expect(zoomedIn.width).toBe(width)
    expect(zoomedIn.coverage).toBe(1)

    const zoomedOut = ribbonRenderWidth(width, 0.01, RIBBON_MIN_PIXELS)
    expect(zoomedOut.width).toBeGreaterThan(width)
    expect(zoomedOut.coverage).toBeLessThan(1)
    // Widening never adds ink: rendered width × coverage stays the ink width.
    expect(zoomedOut.width * zoomedOut.coverage).toBeCloseTo(width, 9)
  })

  it('inflates an on-skin dot only when it would fall below the pixel floor', () => {
    expect(markerScreenScale(0.007, 0.0002, MARKER_MIN_PIXELS)).toBe(1)
    expect(markerScreenScale(0.007, 0.0027, MARKER_MIN_PIXELS)).toBeGreaterThan(1)
  })

  it('maps millimetres through the framed model height', () => {
    expect(worldPerMillimetre(1.75) * 1000).toBeCloseTo(1, 6)
    expect(worldPerMillimetre(1.791) * 3.5).toBeCloseTo(0.003582, 6)
    expect(worldPerMillimetre(0)).toBe(0.001)
  })
})

describe('acupoint dots', () => {
  it('projects the rim onto the surface so the dot is not a floating coin', () => {
    const project = sphereProjector()
    const center = [0, 0, SPHERE_RADIUS]
    const disc = conformDisc(center, [0, 0, 1], 0.0035, project, { segments: 16 })
    expect(disc.rim).toHaveLength(16)
    const rimWorld = disc.rim.map((delta) => [
      center[0] + delta[0],
      center[1] + delta[1],
      center[2] + delta[2],
    ])
    expect(maxSurfaceDeviation(rimWorld, project)).toBeLessThan(1e-9)
    // The flat tangent-plane rim would have floated by the sagitta.
    expect(chordSagitta(0.007, SPHERE_RADIUS)).toBeGreaterThan(1e-4)
  })

  it('falls back to the flat rim when a sample jumps across a crease', () => {
    const flipped = (point) => ({ position: [point[0], point[1], -point[2]], normal: [0, 0, -1] })
    const disc = conformDisc([0, 0, SPHERE_RADIUS], [0, 0, 1], 0.0035, flipped, { segments: 8 })
    disc.rimNormals.forEach((normal) => expect(normal[2]).toBeGreaterThan(0))
    disc.rim.forEach((delta) => expect(Math.abs(delta[2])).toBeLessThan(1e-9))
  })

  it('builds a fan whose centre sits at the acupoint', () => {
    const disc = conformDisc([0, 0, SPHERE_RADIUS], [0, 0, 1], 0.0035, sphereProjector(), {
      segments: 12,
    })
    const attributes = buildDiscAttributes(disc)
    expect(attributes.vertexCount).toBe(13)
    expect([...attributes.position.slice(0, 3)]).toEqual([0, 0, 0])
    expect(attributes.index.length).toBe(36)
    expect(attributes.offset.every((value) => value === 0)).toBe(true)
  })
})
