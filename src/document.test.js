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

  it('accepts black acupoint color for yang meridians', () => {
    const document = {
      ...emptyDocument(),
      acupoints: [{
        id: 'p1',
        pairId: null,
        name: '商陽',
        code: 'LI1',
        meridianId: 'LI',
        meridianName: '手陽明大腸經',
        sequence: 1,
        side: 'left',
        color: '#111111',
        size: 10,
        position: [0, 1, 0],
        normal: [0, 0, 1],
      }],
    }
    expect(validateDocument(document).valid).toBe(true)
    expect(validateDocument({
      ...document,
      meridians: [{
        id: 'm1',
        pairId: null,
        meridianId: 'LI',
        name: '手陽明大腸經',
        color: '#111111',
        width: 3,
        side: 'left',
        nodes: [
          { type: 'acupoint', pointId: 'p1', position: [0, 1, 0], normal: [0, 0, 1] },
          { type: 'control', pointId: null, position: [0, 2, 0], normal: [0, 0, 1] },
        ],
      }],
    }).valid).toBe(false)
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

  it('strips extra node fields so mirrored locators still export', () => {
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
          {
            type: 'control',
            pointId: null,
            position: [0, 1.5, 0],
            normal: [0, 0, 1],
            style: 'along',
            distance: 0.01,
            faceIndex: 12,
            mesh: { uuid: 'hit' },
          },
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
    expect(result.value.meridians[0].nodes[1]).toEqual({
      type: 'control',
      pointId: null,
      position: [0, 1.5, 0],
      normal: [0, 0, 1],
      style: 'along',
    })
    expect(validateDocument(result.value).valid).toBe(true)
  })

  it('keeps authored 翳風–耳門 locators so ear edits survive import', () => {
    const document = {
      ...emptyDocument(),
      meridians: [{
        id: 'm1',
        pairId: null,
        meridianId: 'TE',
        name: '手少陽三焦經',
        color: '#ef4444',
        width: 3,
        side: 'right',
        nodes: [
          { type: 'acupoint', pointId: 'te20', position: [0.08, 1.69, -0.04], normal: [1, 0, 0] },
          { type: 'control', pointId: null, position: [0.08, 1.68, -0.03], normal: [1, 0, 0], style: 'along' },
          { type: 'control', pointId: null, position: [0.08, 1.67, -0.02], normal: [1, 0, 0], style: 'along' },
          { type: 'acupoint', pointId: 'te21', position: [0.07, 1.66, -0.01], normal: [1, 0, 0] },
          { type: 'control', pointId: null, position: [0.07, 1.67, 0.01], normal: [1, 0, 0], style: 'along' },
          { type: 'acupoint', pointId: 'te22', position: [0.07, 1.68, -0.01], normal: [1, 0, 0] },
        ],
      }],
      acupoints: [{
        id: 'te20',
        pairId: null,
        name: '角孫',
        code: 'TE20',
        meridianId: 'TE',
        meridianName: '手少陽三焦經',
        sequence: 20,
        side: 'right',
        color: '#ef4444',
        size: 10,
        position: [0.08, 1.69, -0.04],
        normal: [1, 0, 0],
      }, {
        id: 'te21',
        pairId: null,
        name: '耳門',
        code: 'TE21',
        meridianId: 'TE',
        meridianName: '手少陽三焦經',
        sequence: 21,
        side: 'right',
        color: '#ef4444',
        size: 10,
        position: [0.07, 1.66, -0.01],
        normal: [1, 0, 0],
      }, {
        id: 'te22',
        pairId: null,
        name: '耳和髎',
        code: 'TE22',
        meridianId: 'TE',
        meridianName: '手少陽三焦經',
        sequence: 22,
        side: 'right',
        color: '#ef4444',
        size: 10,
        position: [0.07, 1.68, -0.01],
        normal: [1, 0, 0],
      }],
    }
    const result = parseDocument(JSON.stringify(document))
    expect(result.valid).toBe(true)
    expect(result.value.meridians[0].nodes.map((node) => node.pointId || 'control'))
      .toEqual(['te20', 'control', 'control', 'te21', 'control', 'te22'])
  })
})
