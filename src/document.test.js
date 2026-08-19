import { describe, expect, it } from 'vitest'
import {
  emptyDocument,
  exportFileName,
  inferBodyModel,
  parseDocument,
  validateDocument,
} from './document.js'

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
    expect(result.value.settings.markerSize).toBe(10)
    expect(result.value.model.body).toBe('male')
  })

  it('infers body model and distinguishes export filenames', () => {
    expect(inferBodyModel({ name: 'female-character.glb' })).toBe('female')
    expect(emptyDocument('female').model).toMatchObject({
      body: 'female',
      name: 'female-character.glb',
    })
    expect(exportFileName(emptyDocument('male'), new Date('2026-08-13T00:00:00.000Z')))
      .toBe('meridian-map-v2-male-2026-08-13.json')
    expect(exportFileName(emptyDocument('female'), new Date('2026-08-13T00:00:00.000Z')))
      .toBe('meridian-map-v2-female-2026-08-13.json')
  })

  it('migrates version 2 documents missing model.body', () => {
    const legacy = {
      ...emptyDocument('male'),
      model: { name: 'female-character.glb', hash: null },
    }
    delete legacy.model.body
    const result = parseDocument(JSON.stringify(legacy))
    expect(result.valid).toBe(true)
    expect(result.value.model.body).toBe('female')
  })

  it('strips legacy meridian control points from version 2 documents', () => {
    const document = {
      ...emptyDocument(),
      meridians: [{
        id: 'm1',
        pairId: null,
        meridianId: 'LU',
        name: '手太陰肺經',
        color: '#22c55e',
        width: 3,
        side: 'left',
        nodes: [
          { type: 'acupoint', pointId: 'p1', position: [0, 1, 0], normal: [0, 0, 1] },
          { type: 'control', pointId: null, position: [0, 1.5, 0], normal: [0, 0, 1] },
          { type: 'control', pointId: null, position: [0, 1.7, 0], normal: [0, 0, 1] },
          { type: 'acupoint', pointId: 'p2', position: [0, 2, 0], normal: [0, 0, 1] },
        ],
      }],
      acupoints: [{
        id: 'p1',
        pairId: null,
        name: '中府',
        code: 'LU1',
        meridianId: 'LU',
        meridianName: '手太陰肺經',
        sequence: 1,
        side: 'left',
        color: '#ef4444',
        size: 10,
        position: [0, 1, 0],
        normal: [0, 0, 1],
      }, {
        id: 'p2',
        pairId: null,
        name: '雲門',
        code: 'LU2',
        meridianId: 'LU',
        meridianName: '手太陰肺經',
        sequence: 2,
        side: 'left',
        color: '#ef4444',
        size: 10,
        position: [0, 2, 0],
        normal: [0, 0, 1],
      }],
    }
    const result = parseDocument(JSON.stringify(document))
    expect(result.valid).toBe(true)
    expect(result.value.meridians[0].nodes.map((node) => node.type)).toEqual(['acupoint', 'acupoint'])
  })

  it('keeps two styled segment handles when migrating version 2 documents', () => {
    const document = {
      ...emptyDocument(),
      meridians: [{
        id: 'm1',
        pairId: null,
        meridianId: 'LU',
        name: '手太陰肺經',
        color: '#22c55e',
        width: 3,
        side: 'left',
        nodes: [
          { type: 'acupoint', pointId: 'p1', position: [0, 1, 0], normal: [0, 0, 1] },
          { type: 'control', pointId: null, position: [0, 1.3, 0], normal: [0, 0, 1], style: 'curve' },
          { type: 'control', pointId: null, position: [0, 1.6, 0], normal: [0, 0, 1], style: 'along' },
          { type: 'acupoint', pointId: 'p2', position: [0, 2, 0], normal: [0, 0, 1] },
        ],
      }],
      acupoints: [{
        id: 'p1',
        pairId: null,
        name: '雲門',
        code: 'LU2',
        meridianId: 'LU',
        meridianName: '手太陰肺經',
        sequence: 2,
        side: 'left',
        color: '#ef4444',
        size: 10,
        position: [0, 1, 0],
        normal: [0, 0, 1],
      }, {
        id: 'p2',
        pairId: null,
        name: '天府',
        code: 'LU3',
        meridianId: 'LU',
        meridianName: '手太陰肺經',
        sequence: 3,
        side: 'left',
        color: '#ef4444',
        size: 10,
        position: [0, 2, 0],
        normal: [0, 0, 1],
      }],
    }
    const result = parseDocument(JSON.stringify(document))
    expect(result.valid).toBe(true)
    expect(result.value.meridians[0].nodes.map((node) => node.style || node.type))
      .toEqual(['acupoint', 'curve', 'along', 'acupoint'])
  })
})
