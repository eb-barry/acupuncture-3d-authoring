import { describe, expect, it } from 'vitest'
import { emptyDocument, parseDocument, validateDocument } from './document.js'

describe('acupuncture document schema', () => {
  it('accepts an empty editor document', () => {
    expect(validateDocument(emptyDocument())).toEqual({ valid: true, errors: [] })
  })

  it('accepts valid paths and acupoints', () => {
    const document = {
      ...emptyDocument(),
      meridians: [{
        id: 'm1',
        pairId: 'route-pair',
        meridianId: 'LU',
        name: '手太陰肺經',
        color: '#3b82f6',
        width: 4,
        side: 'left',
        nodes: [
          { type: 'acupoint', pointId: 'p1', position: [0, 1, 0], normal: [0, 0, 1] },
          { type: 'control', pointId: null, position: [0, 2, 0], normal: [0, 0, 1] },
        ],
      }],
      acupoints: [{
        id: 'p1',
        pairId: 'point-pair',
        name: '中府',
        code: 'LU1',
        meridianId: 'LU',
        meridianName: '手太陰肺經',
        sequence: 1,
        side: 'left',
        color: '#ef4444',
        size: 12,
        position: [0, 1, 0],
        normal: [0, 0, 1],
      }],
    }
    expect(validateDocument(document).valid).toBe(true)
  })

  it('reports malformed and invalid JSON', () => {
    expect(parseDocument('{broken').valid).toBe(false)
    const result = validateDocument({ ...emptyDocument(), format: 'unknown' })
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('constant')
  })

  it('migrates version 1 documents to version 2', () => {
    const legacy = {
      format: 'acupuncture-3d',
      version: 1,
      model: { name: 'legacy.glb' },
      meridians: [],
      acupoints: [],
    }
    const result = parseDocument(JSON.stringify(legacy))
    expect(result.valid).toBe(true)
    expect(result.value.version).toBe(2)
    expect(result.value.settings.markerSize).toBe(12)
  })
})
