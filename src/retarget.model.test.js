import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { computeBoundsTree } from 'three-mesh-bvh'
import { scalePosition } from './retarget.js'

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

function closestWorldPoint(meshes, position, maxDistance) {
  const target = new THREE.Vector3(...position)
  let best = null
  for (const mesh of meshes) {
    const local = mesh.worldToLocal(target.clone())
    const info = mesh.geometry.boundsTree.closestPointToPoint(local, { point: new THREE.Vector3() }, 0, maxDistance)
    if (!info?.point) continue
    const world = mesh.localToWorld(info.point.clone())
    const distance = world.distanceTo(target)
    if (!best || distance < best.distance) best = { position: [world.x, world.y, world.z], distance }
  }
  return best
}

describe('male acupoints projected onto the female mesh', () => {
  it('keeps 神闕, 湧泉, 百會 and 合谷 in the matching female regions', async () => {
    const male = await loadFramedBody('models/male_character.glb')
    const female = await loadFramedBody('models/female-character.glb')
    expect(male.height).toBeGreaterThan(1)
    expect(female.height).toBeGreaterThan(male.height * 10)

    const landmarks = {
      CV8: [0.00036286882188910253, 1.0788568263215557, 0.08596405836480389],
      KI1: [0.15287403097384228, 0.004944474493934425, 0.058027305470878435],
      GV20: [-0.00018480742251050547, 1.790687177127863, -0.06500303143967927],
      LI4: [0.4990678050086257, 0.9449553608490933, 0.0834526098829698],
    }
    const hits = {}
    for (const [code, point] of Object.entries(landmarks)) {
      const scaled = scalePosition(point, male.height, female.height)
      const hit = closestWorldPoint(female.meshes, scaled, female.height * 0.25)
      expect(hit, code).toBeTruthy()
      hits[code] = hit
    }

    expect(hits.CV8.distance).toBeLessThan(female.height * 0.08)
    expect(Math.abs(hits.CV8.position[0]) / female.height).toBeLessThan(0.04)
    expect(hits.CV8.position[1] / female.height).toBeGreaterThan(0.45)
    expect(hits.CV8.position[1] / female.height).toBeLessThan(0.75)
    expect(hits.CV8.position[2]).toBeGreaterThan(0)

    expect(hits.KI1.position[1] / female.height).toBeLessThan(0.12)
    expect(hits.KI1.position[0]).toBeGreaterThan(0)

    expect(hits.GV20.position[1] / female.height).toBeGreaterThan(0.9)
    expect(hits.GV20.position[2]).toBeLessThan(hits.CV8.position[2])

    expect(hits.LI4.position[0]).toBeGreaterThan(female.height * 0.12)
    expect(hits.LI4.position[1] / female.height).toBeGreaterThan(0.35)
    expect(hits.LI4.position[1] / female.height).toBeLessThan(0.75)
  }, 20000)
})
