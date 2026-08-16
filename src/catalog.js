import rawCatalog from './data/acupuncture-data.json' with { type: 'json' }

export const MERIDIANS = [
  { id: 'LU', name: '手太陰肺經', bilateral: true, group: 'yin' },
  { id: 'LI', name: '手陽明大腸經', bilateral: true, group: 'yang' },
  { id: 'ST', name: '足陽明胃經', bilateral: true, group: 'yang' },
  { id: 'SP', name: '足太陰脾經', bilateral: true, group: 'yin' },
  { id: 'HT', name: '手少陰心經', bilateral: true, group: 'yin' },
  { id: 'SI', name: '手太陽小腸經', bilateral: true, group: 'yang' },
  { id: 'BL', name: '足太陽膀胱經', bilateral: true, group: 'yang' },
  { id: 'KI', name: '足少陰腎經', bilateral: true, group: 'yin' },
  { id: 'PC', name: '手厥陰心包經', bilateral: true, group: 'yin' },
  { id: 'TE', name: '手少陽三焦經', bilateral: true, group: 'yang' },
  { id: 'GB', name: '足少陽膽經', bilateral: true, group: 'yang' },
  { id: 'LR', name: '足厥陰肝經', bilateral: true, group: 'yin' },
  { id: 'CV', name: '任脈', bilateral: false, group: 'ren-du' },
  { id: 'GV', name: '督脈', bilateral: false, group: 'ren-du' },
]

/** Global meridian display colors: 任督藍、陰經綠、陽經紅. */
export const MERIDIAN_LINE_COLORS = {
  'ren-du': '#3b82f6',
  yin: '#22c55e',
  yang: '#ef4444',
}

export function meridianLineColor(meridianId) {
  const meridian = meridianById(meridianId)
  return MERIDIAN_LINE_COLORS[meridian?.group] || MERIDIAN_LINE_COLORS.yang
}

const meridianByName = new Map(MERIDIANS.map((item) => [item.name, item]))
const codeParts = (code) => {
  const match = /^([A-Z]+)(\d+)$/.exec(code)
  return match ? { prefix: match[1], sequence: Number(match[2]) } : { prefix: '', sequence: 0 }
}

export const POINTS = Object.entries(rawCatalog)
  .filter(([name]) => name !== '複溜')
  .map(([name, data]) => {
    const meridian = meridianByName.get(data['所屬經脈'])
    const { prefix, sequence } = codeParts(data['國際代碼'])
    if (!meridian || meridian.id !== prefix) {
      throw new Error(`穴位資料無法對應經脈：${name} (${data['國際代碼']})`)
    }
    return {
      name,
      code: data['國際代碼'],
      sequence,
      meridianId: meridian.id,
      meridianName: meridian.name,
      bilateral: meridian.bilateral,
      attributes: data['經穴屬性'] || [],
      details: {
        indications: data['主治'],
        modern: data['現代醫學闡釋'],
        contraindication: data['針灸禁忌'],
        contraindicationNotes: data['禁忌說明'],
        location: data['取穴要領'],
        simpleLocation: data['簡易取穴法'],
      },
    }
  })
  .sort((a, b) => {
    const meridianOrder = MERIDIANS.findIndex((item) => item.id === a.meridianId)
      - MERIDIANS.findIndex((item) => item.id === b.meridianId)
    return meridianOrder || a.sequence - b.sequence
  })

export const POINT_BY_CODE = new Map(POINTS.map((point) => [point.code, point]))

export function pointsForMeridian(meridianId) {
  return POINTS.filter((point) => point.meridianId === meridianId)
}

export function meridianById(id) {
  return MERIDIANS.find((item) => item.id === id)
}
