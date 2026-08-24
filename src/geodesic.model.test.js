import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import {
  buildCombinedSurfaceGraph,
  countChordSpikes,
  dist3,
  geodesicIsStable,
  maxPolylineStep,
  shortestSurfacePath,
} from './geodesic.js'

function nearestVertex(positions, pred, hint) {
  let best = -1
  let bestD = Infinity
  for (let index = 0; index < positions.length; index += 1) {
    const point = positions[index]
    if (!pred(point)) continue
    const distance = dist3(point, hint)
    if (distance < bestD) {
      bestD = distance
      best = index
    }
  }
  return best
}

async function loadFramedChunks(file) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
  const buf = readFileSync(file)
  const gltf = await loader.parseAsync(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    '',
  )
  const root = gltf.scene
  const box = new THREE.Box3().setFromObject(root)
  const center = box.getCenter(new THREE.Vector3())
  root.position.x += -center.x
  root.position.z += -center.z
  root.position.y += -box.min.y
  root.updateMatrixWorld(true)
  const framed = new THREE.Box3().setFromObject(root)
  const height = framed.getSize(new THREE.Vector3()).y
  const chunks = []
  const vertex = new THREE.Vector3()
  root.traverse((mesh) => {
    if (!mesh.isMesh) return
    const positionAttr = mesh.geometry?.getAttribute('position')
    if (!positionAttr) return
    const positions = []
    for (let index = 0; index < positionAttr.count; index += 1) {
      vertex.fromBufferAttribute(positionAttr, index).applyMatrix4(mesh.matrixWorld)
      positions.push([vertex.x, vertex.y, vertex.z])
    }
    const triangles = []
    const indexAttr = mesh.geometry.getIndex()
    if (indexAttr) {
      for (let index = 0; index < indexAttr.count; index += 1) triangles.push(indexAttr.getX(index))
    } else {
      for (let index = 0; index < positionAttr.count; index += 1) triangles.push(index)
    }
    chunks.push({ positions, triangles })
  })
  return { height, graph: buildCombinedSurfaceGraph(chunks), chunkCount: chunks.length }
}

describe('陰谷–橫骨 on the built-in body meshes', () => {
  it('keeps 陰谷→橫骨 on the left thigh then turns onto the front of the male model', async () => {
    const { height, graph, chunkCount } = await loadFramedChunks('models/male_character.glb')
    expect(chunkCount).toBeGreaterThan(1)
    const ki10 = nearestVertex(
      graph.positions,
      (point) => point[0] < -0.03 && point[1] > height * 0.24 && point[1] < height * 0.34 && point[2] < 0,
      [-0.08, height * 0.29, -0.08],
    )
    const ki11 = nearestVertex(
      graph.positions,
      (point) => point[0] < 0 && point[0] > -0.08 && point[1] > height * 0.50 && point[1] < height * 0.58 && point[2] > 0.02,
      [-0.03, height * 0.53, 0.08],
    )
    expect(ki10).toBeGreaterThanOrEqual(0)
    expect(ki11).toBeGreaterThanOrEqual(0)
    const start = graph.remap[ki10]
    const goal = graph.remap[ki11]
    expect(start).not.toBe(goal)
    const path = shortestSurfacePath({
      adjacency: graph.adjacency,
      positions: graph.positions,
      startSeeds: [{ id: start, cost: 0 }],
      goalIds: [goal],
      goalPoint: graph.positions[goal],
      maxExplored: 300000,
    })
    expect(path).toBeTruthy()
    expect(path.points.every((point) => point[0] < 0)).toBe(true)
    expect(path.points[0][2]).toBeLessThan(0)
    expect(path.points[path.points.length - 1][2]).toBeGreaterThan(0.04)
    const mid = path.points[Math.floor(path.points.length / 2)]
    expect(mid[1]).toBeGreaterThan(path.points[0][1])
    expect(mid[1]).toBeLessThan(path.points[path.points.length - 1][1])
    // Stay on this thigh until the path has already turned onto the front;
    // do not dive through the inter-leg cleft.
    const cleft = path.points.filter((point) => (
      Math.abs(point[0]) < 0.02 && point[2] < 0.02 && point[1] < height * 0.5
    ))
    expect(cleft).toHaveLength(0)
  })
})

describe('geodesic-first problem spans on the male mesh', () => {
  it('keeps 雲門→天府, 食竇→腹哀, 隱白→大都 and 角孫→耳門 spike-free', async () => {
    const { graph } = await loadFramedChunks('models/male_character.glb')
    const nearest = (hint) => {
      let best = -1
      let bestD = Infinity
      for (let index = 0; index < graph.positions.length; index += 1) {
        const distance = dist3(graph.positions[index], hint)
        if (distance < bestD) {
          bestD = distance
          best = index
        }
      }
      return graph.remap[best]
    }
    const solve = (from, to) => {
      const start = nearest(from)
      const goal = nearest(to)
      const found = shortestSurfacePath({
        adjacency: graph.adjacency,
        positions: graph.positions,
        startSeeds: [{ id: start, cost: 0 }],
        goalIds: [goal],
        goalPoint: graph.positions[goal],
        maxExplored: 300000,
      })
      expect(found?.points?.length).toBeGreaterThan(2)
      const points = [from, ...found.points, to]
      return {
        spikes: countChordSpikes(points),
        maxStep: maxPolylineStep(points),
        stable: geodesicIsStable(found.points, { maxLengthRatio: 3.8, maxEdge: 0.055, maxTurningPerPoint: 0.32 }),
      }
    }
    const lu = solve([0.1493, 1.4351, -0.0112], [0.2855, 1.3200, -0.0179])
    expect(lu.spikes).toBe(0)
    expect(lu.maxStep).toBeLessThan(0.012)
    expect(lu.stable).toBe(true)
    const spRib = solve([0.1422, 1.2398, 0.0338], [0.1264, 1.1307, 0.0317])
    expect(spRib.spikes).toBe(0)
    expect(spRib.stable).toBe(true)
    const spToe = solve([0.1095, 0.0210, 0.1422], [0.1064, 0.0242, 0.1086])
    expect(spToe.spikes).toBe(0)
    expect(spToe.stable).toBe(true)
    const te = solve([0.0782, 1.6937, -0.0412], [0.0749, 1.6659, -0.0123])
    expect(te.spikes).toBe(0)
    expect(te.stable).toBe(true)
  }, 60000)
})
