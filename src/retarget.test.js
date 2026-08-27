import { describe, expect, it } from 'vitest'
import { emptyDocument } from './document.js'
import { bindDocumentToBody, mapDocumentAnnotations, scalePosition } from './retarget.js'

describe('male JSON retargeted onto another body', () => {
  it('scales authored world points by framed stature', () => {
    expect(scalePosition([0.1, 0.9, 0.08], 1.8, 3.6)).toEqual([0.2, 1.8, 0.16])
    expect(scalePosition([0, 1, 0], 0, 2)).toEqual([0, 1, 0])
  })

  it('retags a male document as the female preset', () => {
    const bound = bindDocumentToBody(emptyDocument('male'), 'female')
    expect(bound.model).toEqual({
      name: 'female-character.glb',
      hash: null,
      body: 'female',
    })
  })

  it('keeps meridian acupoint nodes in sync with the mapped catalog points', () => {
    const document = {
      ...emptyDocument('male'),
      acupoints: [{
        id: 'p1',
        pairId: null,
        name: '中脘',
        code: 'CV12',
        meridianId: 'CV',
        meridianName: '任脈',
        sequence: 12,
        side: 'midline',
        color: '#3b82f6',
        size: 10,
        position: [0, 1, 0.1],
        normal: [0, 0, 1],
      }],
      meridians: [{
        id: 'm1',
        pairId: null,
        meridianId: 'CV',
        name: '任脈',
        color: '#3b82f6',
        width: 3,
        side: 'midline',
        nodes: [
          { type: 'acupoint', pointId: 'p1', position: [0, 1, 0.1], normal: [0, 0, 1] },
          { type: 'control', pointId: null, position: [0, 1.1, 0.1], normal: [0, 0, 1] },
        ],
      }],
    }
    const mapped = mapDocumentAnnotations(document, ({ position, normal }) => ({
      position: scalePosition(position, 1, 2),
      normal,
    }))
    expect(mapped.acupoints[0].position).toEqual([0, 2, 0.2])
    expect(mapped.meridians[0].nodes[0].position).toEqual([0, 2, 0.2])
    expect(mapped.meridians[0].nodes[1].position).toEqual([0, 2.2, 0.2])
  })
})
