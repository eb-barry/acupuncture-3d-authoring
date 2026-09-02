import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { computeBoundsTree } from 'three-mesh-bvh'
import {
  gbJianjingYuanyeGuidePoints,
  isGbAxillaHollow,
  isPointBehindSurface,
  liFutuHeliaoOuterPoint,
  isLiFutuHeliaoHit,
} from './skinPath.js'

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree

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
    if (!object.geometry.boundsTree) object.geometry.computeBoundsTree()
    meshes.push(object)
  })
  return { height, meshes }
}

function nearestVertex(meshes, pred, hint) {
  let best = null
  const vertex = new THREE.Vector3()
  for (const mesh of meshes) {
    const attr = mesh.geometry.getAttribute('position')
    for (let index = 0; index < attr.count; index += 1) {
      vertex.fromBufferAttribute(attr, index).applyMatrix4(mesh.matrixWorld)
      const point = [vertex.x, vertex.y, vertex.z]
      if (!pred(point)) continue
      const distance = Math.hypot(point[0] - hint[0], point[1] - hint[1], point[2] - hint[2])
      if (!best || distance < best.distance) best = { point, distance }
    }
  }
  return best
}

function closestHit(meshes, position, maxDistance) {
  const target = new THREE.Vector3(...position)
  let best = null
  for (const mesh of meshes) {
    const local = mesh.worldToLocal(target.clone())
    const info = mesh.geometry.boundsTree.closestPointToPoint(
      local,
      { point: new THREE.Vector3() },
      0,
      maxDistance,
    )
    if (!info?.point) continue
    const world = mesh.localToWorld(info.point.clone())
    const distance = world.distanceTo(target)
    if (best && distance >= best.distance) continue
    const a = new THREE.Vector3()
    const b = new THREE.Vector3()
    const c = new THREE.Vector3()
    const pos = mesh.geometry.getAttribute('position')
    const idx = mesh.geometry.index
    const ia = idx ? idx.getX(info.faceIndex * 3) : info.faceIndex * 3
    const ib = idx ? idx.getX(info.faceIndex * 3 + 1) : info.faceIndex * 3 + 1
    const ic = idx ? idx.getX(info.faceIndex * 3 + 2) : info.faceIndex * 3 + 2
    a.fromBufferAttribute(pos, ia)
    b.fromBufferAttribute(pos, ib)
    c.fromBufferAttribute(pos, ic)
    const normal = new THREE.Vector3().crossVectors(b.sub(a), c.sub(a)).normalize()
    normal.transformDirection(mesh.matrixWorld)
    best = {
      position: [world.x, world.y, world.z],
      normal: [normal.x, normal.y, normal.z],
      distance,
    }
  }
  return best
}

function assertLateralChestCorridor(meshes, height, scale) {
  const jianjing = nearestVertex(
    meshes,
    (point) => (
      point[0] > 0.08 * scale && point[0] < 0.16 * scale
      && point[1] > height * 0.80 && point[1] < height * 0.88
      && point[2] < 0
    ),
    [0.12 * scale, height * 0.84, -0.09 * scale],
  )
  const yuanye = nearestVertex(
    meshes,
    (point) => (
      point[0] > 0.15 * scale && point[0] < 0.24 * scale
      && point[1] > height * 0.68 && point[1] < height * 0.76
      && point[2] < 0.04 * scale
    ),
    [0.19 * scale, height * 0.73, -0.05 * scale],
  )
  expect(jianjing).toBeTruthy()
  expect(yuanye).toBeTruthy()
  const from = jianjing.point
  const to = yuanye.point
  const path = gbJianjingYuanyeGuidePoints(from, to, 12)
  const span = Math.hypot(from[0] - to[0], from[1] - to[1], from[2] - to[2])
  const midChord = [
    (from[0] + to[0]) / 2,
    (from[1] + to[1]) / 2,
    (from[2] + to[2]) / 2,
  ]
  const mid = path[Math.floor(path.length / 2)]
  expect(Math.abs(mid[0])).toBeGreaterThan(Math.abs(midChord[0]))
  expect(mid[2]).toBeGreaterThan(midChord[2])
  expect(isGbAxillaHollow(midChord, from, to)).toBe(true)
  expect(isGbAxillaHollow(mid, from, to)).toBe(false)

  const snapRadius = Math.max(0.16 * scale, span * 0.6)
  let behind = 0
  for (let index = 1; index < path.length - 1; index += 1) {
    const point = path[index]
    const hit = closestHit(meshes, point, snapRadius)
    expect(hit).toBeTruthy()
    expect(hit.distance).toBeLessThan(span * 0.28)
    if (isPointBehindSurface(point, hit.position, hit.normal, 0.008 * scale)) behind += 1
  }
  expect(behind).toBe(0)
}

describe('肩井–淵腋 corridor on the built-in body meshes', () => {
  it('stays outside the male mesh and on the lateral chest, not through the shoulder', async () => {
    const { height, meshes } = await loadFramedBody('models/male_character.glb')
    assertLateralChestCorridor(meshes, height, height / 1.79)
  }, 120000)

  it('stays outside the female mesh and on the lateral chest, not through the shoulder', async () => {
    const { height, meshes } = await loadFramedBody('models/female-character.glb')
    assertLateralChestCorridor(meshes, height, height / 1.79)
  }, 180000)
})

describe('扶突–禾髎 neck–cheek corridor on the female mesh', () => {
  it('keeps 扶突→禾髎 samples on the cheek, not inside the jaw', async () => {
    const { height, meshes } = await loadFramedBody('models/female-character.glb')
    const li18 = nearestVertex(
      meshes,
      (point) => (
        point[0] > height * 0.022 && point[0] < height * 0.055
        && point[1] > height * 0.82 && point[1] < height * 0.88
        && point[2] > height * 0.012 && point[2] < height * 0.05
      ),
      [height * 0.035, height * 0.845, height * 0.028],
    )
    const li19 = nearestVertex(
      meshes,
      (point) => (
        point[0] > height * 0.003 && point[0] < height * 0.018
        && point[1] > height * 0.90 && point[1] < height * 0.945
        && point[2] > height * 0.045
      ),
      [height * 0.008, height * 0.92, height * 0.06],
    )
    expect(li18).toBeTruthy()
    expect(li19).toBeTruthy()
    const from = li18.point
    const to = li19.point
    const span = Math.hypot(from[0] - to[0], from[1] - to[1], from[2] - to[2])
    const snapRadius = Math.max(height * 0.05, span * 0.55)
    const chord = [
      (from[0] + to[0]) / 2,
      (from[1] + to[1]) / 2,
      (from[2] + to[2]) / 2,
    ]
    expect(isLiFutuHeliaoHit(chord, from, to, 0.5)).toBe(false)
    for (const t of [0.28, 0.55, 0.78]) {
      const outer = liFutuHeliaoOuterPoint(from, to, t)
      expect(isLiFutuHeliaoHit(outer, from, to, t)).toBe(true)
      const hit = closestHit(meshes, outer, snapRadius)
      expect(hit).toBeTruthy()
      expect(hit.distance).toBeLessThan(span * 0.45)
      expect(hit.position[0] * from[0]).toBeGreaterThan(0)
      expect(hit.position[2]).toBeGreaterThan(Math.min(from[2], to[2]) - span * 0.05)
    }
  }, 180000)
})
