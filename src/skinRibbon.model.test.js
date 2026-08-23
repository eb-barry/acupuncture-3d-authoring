import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { MeshBVH, getTriangleHitPointInfo } from 'three-mesh-bvh'
import {
  FINE_SAMPLE_STEP,
  buildRibbonAttributes,
  conformPath,
  densifyPath,
  maxSurfaceDeviation,
  ribbonSideDirections,
  smoothPathNormals,
  worldPerMillimetre,
} from './skinRibbon.js'

/** Framed exactly like the viewer: centred on x/z, standing on y = 0. */
async function loadFramedBody(file) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
  const buffer = readFileSync(file)
  const gltf = await loader.parseAsync(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
    '',
  )
  const root = gltf.scene
  const box = new THREE.Box3().setFromObject(root)
  const center = box.getCenter(new THREE.Vector3())
  root.position.x += -center.x
  root.position.z += -center.z
  root.position.y += -box.min.y
  root.updateMatrixWorld(true)
  const height = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).y
  const meshes = []
  root.traverse((object) => {
    if (!object.isMesh || !object.geometry?.getAttribute('position')) return
    if (!object.geometry.boundingBox) object.geometry.computeBoundingBox()
    meshes.push({ mesh: object, bvh: new MeshBVH(object.geometry) })
  })
  return { height, meshes }
}

/** The projector `main.js` feeds to conformPath, rebuilt on the real meshes. */
function skinProjector(meshes, maxDistance = 0.02) {
  const probe = new THREE.Vector3()
  const local = new THREE.Vector3()
  const world = new THREE.Vector3()
  const best = new THREE.Vector3()
  const corner = new THREE.Vector3()
  const normal = new THREE.Vector3()
  const target = { point: new THREE.Vector3() }
  return (point, guide = null) => {
    probe.set(point[0], point[1], point[2])
    let bestEntry = null
    let bestFace = -1
    let bestDistance = Infinity
    for (const entry of meshes) {
      local.copy(probe)
      entry.mesh.worldToLocal(local)
      if (entry.mesh.geometry.boundingBox.distanceToPoint(local) > maxDistance) continue
      const info = entry.bvh.closestPointToPoint(local, target, 0, maxDistance)
      if (!info?.point) continue
      world.copy(info.point)
      entry.mesh.localToWorld(world)
      const distance = world.distanceTo(probe)
      if (distance >= bestDistance) continue
      bestDistance = distance
      bestEntry = entry
      bestFace = info.faceIndex
      best.copy(world)
    }
    if (!bestEntry) return null
    local.copy(best)
    bestEntry.mesh.worldToLocal(local)
    const geometry = bestEntry.mesh.geometry
    const info = getTriangleHitPointInfo(local, geometry, bestFace)
    const normals = geometry.getAttribute('normal')
    normal.set(0, 0, 0)
    if (normals && info?.barycoord) {
      const weights = [info.barycoord.x, info.barycoord.y, info.barycoord.z]
      const corners = [info.face.a, info.face.b, info.face.c]
      for (let index = 0; index < 3; index += 1) {
        corner.fromBufferAttribute(normals, corners[index])
        normal.addScaledVector(corner, weights[index])
      }
    }
    if (normal.lengthSq() < 1e-12) normal.copy(info.face.normal)
    normal.applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(bestEntry.mesh.matrixWorld))
      .normalize()
    if (guide && normal.dot(new THREE.Vector3(guide[0], guide[1], guide[2])) < 0) normal.negate()
    return {
      position: [best.x, best.y, best.z],
      normal: [normal.x, normal.y, normal.z],
    }
  }
}

/** A surface point in the requested region, taken from the mesh itself. */
function surfacePoint(meshes, predicate, hint) {
  const vertex = new THREE.Vector3()
  let best = null
  let bestDistance = Infinity
  for (const entry of meshes) {
    const positions = entry.mesh.geometry.getAttribute('position')
    for (let index = 0; index < positions.count; index += 1) {
      vertex.fromBufferAttribute(positions, index)
      entry.mesh.localToWorld(vertex)
      const point = [vertex.x, vertex.y, vertex.z]
      if (!predicate(point)) continue
      const distance = Math.hypot(point[0] - hint[0], point[1] - hint[1], point[2] - hint[2])
      if (distance >= bestDistance) continue
      bestDistance = distance
      best = point
    }
  }
  return best
}

describe('rendered meridian vertices on the built-in male body', () => {
  it('keeps every ribbon vertex on the skin, including the widened lanes', async () => {
    const { height, meshes } = await loadFramedBody('models/male_character.glb')
    expect(meshes.length).toBeGreaterThan(1)
    const project = skinProjector(meshes)

    // Two points on the front of the left forearm, a span like 孔最→列缺.
    const from = surfacePoint(
      meshes,
      (point) => point[0] < -0.14 && point[2] > 0 && point[1] > height * 0.5 && point[1] < height * 0.6,
      [-0.2, height * 0.55, 0.05],
    )
    const to = surfacePoint(
      meshes,
      (point) => point[0] < -0.14 && point[2] > 0 && point[1] > height * 0.4 && point[1] < height * 0.48,
      [-0.24, height * 0.44, 0.05],
    )
    expect(from).toBeTruthy()
    expect(to).toBeTruthy()

    // A straight chord between two acupoints is what floats today.
    const chord = densifyPath([from, to], FINE_SAMPLE_STEP)
    expect(chord.length).toBeGreaterThan(20)
    expect(maxSurfaceDeviation(chord, project)).toBeGreaterThan(0.0005)

    const conformed = conformPath(chord, project)
    expect(conformed.unresolved).toBe(0)
    // Invariant: the drawn centreline sits on the mesh, not above it.
    expect(maxSurfaceDeviation(conformed.points, project)).toBeLessThan(0.0003)

    const normals = smoothPathNormals(conformed.normals, 2)
    const halfWidth = worldPerMillimetre(height) * 3.5 * 0.5
    const sides = ribbonSideDirections(conformed.points, normals)
    const lanes = []
    conformed.points.forEach((point, index) => {
      const side = sides[index]
      lanes.push([
        point[0] + side[0] * halfWidth,
        point[1] + side[1] * halfWidth,
        point[2] + side[2] * halfWidth,
      ])
      lanes.push([
        point[0] - side[0] * halfWidth,
        point[1] - side[1] * halfWidth,
        point[2] - side[2] * halfWidth,
      ])
    })
    // The shader widens in the tangent plane, so the lanes may only leave the
    // skin by the sagitta of a 1.75 mm half-width — well under the depth bias.
    expect(maxSurfaceDeviation(lanes, project)).toBeLessThan(0.0004)

    const attributes = buildRibbonAttributes(conformed.points, normals)
    expect(attributes.vertexCount).toBe(conformed.points.length * 2)
    expect(Math.max(...attributes.index)).toBeLessThan(attributes.vertexCount)
  }, 120000)
})
