import { readFileSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'

describe('compressed female body model', () => {
  it('loads as one indexed float32 mesh without quantization', async () => {
    const file = 'models/female-character.glb'
    expect(statSync(file).size).toBeLessThan(30 * 1024 * 1024)

    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
    const buffer = readFileSync(file)
    const gltf = await loader.parseAsync(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
      '',
    )

    const meshes = []
    gltf.scene.traverse((object) => {
      if (object.isMesh) meshes.push(object)
    })
    expect(meshes).toHaveLength(1)

    const geometry = meshes[0].geometry
    const position = geometry.getAttribute('position')
    const normal = geometry.getAttribute('normal')
    const index = geometry.getIndex()
    expect(position.count).toBe(511021)
    expect(normal.count).toBe(511021)
    expect(position.array).toBeInstanceOf(Float32Array)
    expect(normal.array).toBeInstanceOf(Float32Array)
    expect(index.count).toBe(1022030 * 3)
    expect(gltf.parser.json.extensionsRequired || []).not.toContain('KHR_mesh_quantization')
    expect(gltf.parser.json.extensionsUsed || []).not.toContain('EXT_meshopt_compression')
  })
})
