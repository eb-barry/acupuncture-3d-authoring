import { describe, expect, it } from 'vitest'
import {
  SKIN_LIFT,
  isHitOnWrapSide,
  isPointBehindSurface,
  marchStandoff,
  outwardWrapGuide,
  pixelWidthToWorldRadius,
  pruneBacktracking,
  catmullRomThrough,
  digitTipProbe,
  isDigitTipWrap,
  isOnDigitSkin,
  isTeEarArcPair,
  isTeHeadPair,
  isTeHelixPair,
  isTeTempleHandlePair,
  isTeTempleRunPair,
  pairKeepsOffPathLocators,
  teEarCircumferenceArc,
  teHeadArcPoints,
  teTempleArcPoints,
  isSiXiaohaiJianzhenPair,
  isSiXiaohaiJianzhenAxillaHollow,
  isSiArmShoulderHandleOk,
  isSiArmShoulderHit,
  siArmShoulderOuterPoint,
  siArmShoulderWrapGuide,
  maxPolylineEdge,
  teEarArcGuide,
  teEarCircumferenceArc,
  TE_EAR_GEODESIC_STABLE,
  isFacingLimbSpan,
  isJianjingYuanyePair,
  isShoulderAxillaWrap,
  pairPrefersWrap,
  pathFollowsFacingChord,
  pickPairAlongPolyline,
  isDuBackWrapPair,
  posteriorWrapGuide,
  shouldFrontWrap,
  shouldPosteriorWrap,
  slerpUnitVectors,
  surfaceStepLength,
  useConvexChordWrap,
} from './skinPath.js'
import { geodesicIsStable } from './geodesic.js'

describe('skin path wrapping', () => {
  it('slerps nearly-opposite normals toward a hint side (palm wrap)', () => {
    const dorsum = [0, 0, 1]
    const palm = [0, 0, -1]
    const towardThumb = [1, 0, 0]
    const mid = slerpUnitVectors(dorsum, palm, 0.5, towardThumb)
    expect(Math.hypot(...mid)).toBeCloseTo(1, 5)
    expect(Math.abs(mid[0])).toBeGreaterThan(0.7)
    expect(Math.abs(mid[2])).toBeLessThan(0.35)
  })

  it('uses tighter steps/standoff on wrap segments', () => {
    expect(surfaceStepLength(0.08, -0.8)).toBeLessThan(surfaceStepLength(0.08, 0.95))
    expect(marchStandoff(-1)).toBeGreaterThan(marchStandoff(1))
    expect(marchStandoff(-1)).toBeLessThan(0.06)
  })

  it('keeps a small skin lift and maps pixel width proportionally', () => {
    expect(SKIN_LIFT).toBeGreaterThan(0.001)
    expect(SKIN_LIFT).toBeLessThan(0.008)
    const near = pixelWidthToWorldRadius(4, 0.6, 40, 800)
    const far = pixelWidthToWorldRadius(4, 6, 40, 800)
    expect(near).toBeLessThan(far)
  })

  it('prunes back-tracking spikes on palm paths', () => {
    const end = [0, 0, 0]
    const points = [
      [0, 0, 1],
      [0, 0.02, 0.8],
      [0, 0.2, 0.9], // spike away from end
      [0, 0.04, 0.5],
      [0, 0, 0],
    ]
    const cleaned = pruneBacktracking(points, end)
    expect(cleaned.length).toBeLessThan(points.length)
    expect(cleaned[0]).toEqual(points[0])
    expect(cleaned[cleaned.length - 1]).toEqual(points[points.length - 1])
  })

  it('wraps perpendicular shoulder chords on the outer skin, not the palm way', () => {
    expect(useConvexChordWrap(0.5)).toBe(true)
    expect(useConvexChordWrap(0)).toBe(true)
    expect(useConvexChordWrap(-0.8)).toBe(false)
  })

  it('biases a 肩井→淵腋 chord in front of the chest, not behind the scapula', () => {
    const lateral = outwardWrapGuide([0.1, 1.28, 0.01], 0.12, { dropY: 0 })
    expect(lateral[0]).toBeGreaterThan(0.7)
    expect(Math.abs(lateral[2])).toBeLessThan(0.35)

    const shoulder = outwardWrapGuide([0.1, 1.28, 0.01], 0.12, { dropY: 0.24 })
    expect(shoulder[0]).toBeGreaterThan(0)
    expect(shoulder[2]).toBeGreaterThan(0.7)

    const neck = outwardWrapGuide([0.08, 1.45, -0.05], 0.09, { dropY: 0.16 })
    expect(neck[2]).toBeLessThan(0)
  })

  it('detects probes that sit behind an outward surface hit', () => {
    expect(isPointBehindSurface([0, 0, 0], [0.05, 0, 0], [1, 0, 0])).toBe(true)
    expect(isPointBehindSurface([0.08, 0, 0], [0.05, 0, 0], [1, 0, 0])).toBe(false)
    expect(isPointBehindSurface([0.051, 0, 0], [0.05, 0, 0], [1, 0, 0])).toBe(false)
  })

  it('keeps 肩井→淵腋 wrap samples on the front, not the scapula', () => {
    const jianjing = [0.12, 1.42, -0.02]
    const yuanye = [0.15, 1.18, 0.03]
    expect(shouldFrontWrap(jianjing, yuanye)).toBe(true)
    expect(shouldFrontWrap(jianjing, [0.11, 1.28, 0.08])).toBe(true)
    expect(isHitOnWrapSide([0.13, 1.30, 0.07], jianjing, yuanye)).toBe(true)
    expect(isHitOnWrapSide([0.13, 1.30, -0.09], jianjing, yuanye)).toBe(false)
    expect(isHitOnWrapSide([-0.13, 1.30, 0.07], jianjing, yuanye)).toBe(false)
  })

  it('keeps 督脈 back spans on the posterior skin, not through the torso', () => {
    expect(isDuBackWrapPair('GV15', 'GV14')).toBe(true)
    expect(isDuBackWrapPair('GV13', 'GV12')).toBe(true)
    expect(isDuBackWrapPair('GV11', 'GV10')).toBe(true)
    expect(isDuBackWrapPair('GV3', 'GV2')).toBe(true)
    expect(isDuBackWrapPair('CV4', 'CV3')).toBe(false)
    expect(isDuBackWrapPair('BL12', 'BL13')).toBe(false)
    const yamen = [0.008, 1.48, -0.05]
    const dazhui = [-0.006, 1.38, -0.07]
    const taodao = [0.01, 1.34, -0.08]
    const shenzhu = [-0.01, 1.26, -0.09]
    const shendao = [0.007, 1.20, -0.09]
    const lingtai = [-0.005, 1.16, -0.09]
    const yaoyangguan = [0.006, 0.98, -0.08]
    const yaoshu = [-0.007, 0.90, -0.07]
    for (const [from, to] of [
      [yamen, dazhui],
      [taodao, shenzhu],
      [shendao, lingtai],
      [yaoyangguan, yaoshu],
    ]) {
      expect(shouldPosteriorWrap(from, to)).toBe(true)
      expect(shouldFrontWrap(from, to)).toBe(false)
      const mid = [
        (from[0] + to[0]) / 2,
        (from[1] + to[1]) / 2,
        Math.min(from[2], to[2]) - 0.02,
      ]
      expect(isHitOnWrapSide(mid, from, to)).toBe(true)
      expect(isHitOnWrapSide([0, (from[1] + to[1]) / 2, 0.08], from, to)).toBe(false)
    }
    const guide = posteriorWrapGuide([0.01, 1.22, -0.04])
    expect(guide[2]).toBeLessThan(-0.9)
    expect(Math.abs(guide[0])).toBeLessThan(0.2)
  })

  it('wraps 少府→少衝 around the pinky tip instead of cutting through the finger', () => {
    const shaofu = [0.5124204957027906, 0.9176148523570886, 0.030278267964379893]
    const shaochong = [0.5279002611732267, 0.8457131126923373, 0.03287212440530844]
    const palmNormal = [-0.9022152269243789, -0.4066208439972457, -0.14376082057625791]
    const nailNormal = [0.07755903397447586, -0.27969431312017146, 0.956951246123428]
    const dot = palmNormal[0] * nailNormal[0] + palmNormal[1] * nailNormal[1] + palmNormal[2] * nailNormal[2]
    expect(dot).toBeLessThan(0.25)
    expect(isDigitTipWrap(shaofu, shaochong, dot)).toBe(true)
    expect(isFacingLimbSpan(shaofu, shaochong, dot)).toBe(false)
    expect(isDigitTipWrap([-0.22, 1.04, 0.02], [-0.24, 0.78, 0.01], 0.86)).toBe(false)
    const probe = digitTipProbe(shaofu, shaochong, palmNormal, nailNormal)
    expect(Math.hypot(probe[0] - shaochong[0], probe[1] - shaochong[1], probe[2] - shaochong[2])).toBeLessThan(0.016)
    expect(probe[1]).toBeLessThan(shaochong[1])
    expect(probe[2]).toBeLessThan(shaochong[2])
    expect(Math.abs(probe[0] - shaochong[0])).toBeLessThan(0.008)
    expect(isOnDigitSkin(probe, shaofu, shaochong)).toBe(true)
    expect(isOnDigitSkin(shaofu, shaofu, shaochong)).toBe(true)
    expect(isOnDigitSkin([0.48, 0.88, 0.03], shaofu, shaochong)).toBe(false)
    expect(isOnDigitSkin([0.58, 0.86, 0.03], shaofu, shaochong)).toBe(false)
    expect(maxPolylineEdge([shaofu, [0.52, 0.88, 0.03], shaochong])).toBeLessThan(0.05)
  })

  it('treats 少海→靈道 as a straight inner-arm span, not a wrap through the limb', () => {
    const shaohai = [-0.22, 1.04, 0.02]
    const lingdao = [-0.24, 0.78, 0.01]
    expect(isFacingLimbSpan(shaohai, lingdao, 0.86)).toBe(true)
    expect(isShoulderAxillaWrap(shaohai, lingdao)).toBe(false)
    expect(isFacingLimbSpan([-0.08, 0.49, -0.08], [-0.03, 0.90, 0.08], 0.5)).toBe(false)
    expect(pathFollowsFacingChord([
      shaohai,
      [-0.23, 0.91, 0.015],
      lingdao,
    ], shaohai, lingdao)).toBe(true)
    expect(pathFollowsFacingChord([
      shaohai,
      [0.22, 0.91, 0.02],
      lingdao,
    ], shaohai, lingdao)).toBe(false)
  })

  it('wraps 肩井→淵腋 without a geodesic, but keeps 雲門→天府 and 食竇→腹哀 on the geodesic', () => {
    const jianjing = [0.1192, 1.5029, -0.0947]
    const yuanye = [0.1886, 1.3039, -0.0628]
    const yunmen = [0.1493, 1.4351, -0.0112]
    const tianfu = [0.2855, 1.3200, -0.0179]
    const shidou = [0.1422, 1.2398, 0.0338]
    const fuai = [0.1264, 1.1307, 0.0317]
    const ki10 = [-0.08, 0.49, -0.08]
    const ki11 = [-0.03, 0.90, 0.08]
    expect(isJianjingYuanyePair('GB21', 'GB22')).toBe(true)
    expect(isJianjingYuanyePair('GB22', 'GB21')).toBe(true)
    expect(isJianjingYuanyePair('LU2', 'LU3')).toBe(false)
    expect(isShoulderAxillaWrap(jianjing, yuanye)).toBe(true)
    expect(isShoulderAxillaWrap(yunmen, tianfu)).toBe(false)
    expect(isShoulderAxillaWrap(shidou, fuai)).toBe(false)
    expect(isShoulderAxillaWrap(ki10, ki11)).toBe(false)
    expect(pairPrefersWrap('GB21', 'GB22', jianjing, yuanye)).toBe(true)
    expect(pairPrefersWrap('LU2', 'LU3', yunmen, tianfu)).toBe(false)
    expect(pairPrefersWrap('SP17', 'SP16', shidou, fuai)).toBe(false)
    expect(pairPrefersWrap('TE20', 'TE21', [0.078, 1.694, -0.041], [0.075, 1.666, -0.012])).toBe(false)
    expect(isFacingLimbSpan(jianjing, yuanye, 0.4)).toBe(false)
  })

  it('picks the tightest polyline span that contains the click', () => {
    expect(pickPairAlongPolyline(15, [0, 10, 20, 30])).toBe(1)
    expect(pickPairAlongPolyline(10, [0, 10, 20])).toBe(1)
    expect(pickPairAlongPolyline(6, [0, 20, 5, 8])).toBe(2)
    expect(pickPairAlongPolyline(50, [0, 10, 20])).toBe(-1)
  })

  it('limits temple-curve and ear-arc helpers to 手少陽三焦經 head pairs', () => {
    expect(isTeTempleHandlePair('TE23', 'TE22')).toBe(true)
    expect(isTeTempleHandlePair('TE22', 'TE23')).toBe(true)
    expect(isTeTempleHandlePair('GB1', 'GB2')).toBe(false)
    expect(isTeTempleHandlePair('TE21', 'TE22')).toBe(false)
    expect(isTeTempleRunPair('TE21', 'TE22')).toBe(true)
    expect(isTeTempleRunPair('TE22', 'TE23')).toBe(true)
    expect(isTeTempleRunPair('TE20', 'TE21')).toBe(false)
    expect(isTeEarArcPair('TE17', 'TE18')).toBe(true)
    expect(isTeEarArcPair('TE20', 'TE21')).toBe(true)
    expect(isTeEarArcPair('TE17', 'TE19')).toBe(false)
    expect(isTeEarArcPair('TE22', 'TE23')).toBe(false)
    expect(isTeHeadPair('TE17', 'TE18')).toBe(true)
    expect(isTeHeadPair('TE21', 'TE22')).toBe(true)
    expect(isTeHeadPair('TE22', 'TE23')).toBe(true)
    expect(isTeHeadPair('TE16', 'TE17')).toBe(false)
    expect(isTeHelixPair('TE20', 'TE21')).toBe(true)
    expect(isTeHelixPair('TE18', 'TE19')).toBe(false)
  })

  it('builds a Catmull-Rom through 絲竹空–耳和髎 locators', () => {
    const from = [0.08, 1.58, 0.06]
    const h1 = [0.085, 1.56, 0.05]
    const h2 = [0.09, 1.54, 0.04]
    const h3 = [0.092, 1.52, 0.035]
    const to = [0.095, 1.50, 0.03]
    const curve = catmullRomThrough([from, h1, h2, h3, to], 10)
    expect(curve.length).toBeGreaterThan(30)
    const near = (target) => curve.some((point) => (
      Math.hypot(point[0] - target[0], point[1] - target[1], point[2] - target[2]) < 1e-6
    ))
    expect(near(from)).toBe(true)
    expect(near(h2)).toBe(true)
    expect(near(to)).toBe(true)
    const mid = curve[Math.floor(curve.length / 2)]
    expect(mid[1]).toBeLessThan(from[1])
    expect(mid[1]).toBeGreaterThan(to[1])
  })

  it('traces a smooth circumference behind the ear and over the helix', () => {
    const yifeng = [0.0654, 1.6266, -0.0382]
    const chima = [0.0694, 1.6389, -0.0545]
    const luxi = [0.0773, 1.6744, -0.0605]
    const jiaosun = [0.0782, 1.6937, -0.0412]
    const ermen = [0.0749, 1.6659, -0.0123]
    const erheliao = [0.0757, 1.6857, -0.0133]
    const sizhukong = [0.0584, 1.6802, 0.0544]
    const behind = teEarArcGuide('TE17', 'TE18', yifeng, chima)
    expect(behind[2]).toBeLessThan(0)
    expect(behind[0]).toBeGreaterThan(0)
    const helix = teEarArcGuide('TE20', 'TE21', jiaosun, ermen)
    expect(helix[1]).toBeGreaterThan(0.4)
    const mastoid = teEarCircumferenceArc(chima, luxi, 'TE18', 'TE19')
    expect(mastoid[0]).toEqual(chima)
    expect(mastoid.at(-1)).toEqual(luxi)
    expect(mastoid.length).toBeGreaterThan(12)
    const mastoidMid = mastoid[Math.floor(mastoid.length / 2)]
    expect(mastoidMid[2]).toBeLessThan((chima[2] + luxi[2]) / 2 + 0.004)
    const helixArc = teHeadArcPoints('TE20', 'TE21', jiaosun, ermen)
    const helixHigh = Math.max(...helixArc.map((point) => point[1]))
    expect(helixHigh).toBeGreaterThan(jiaosun[1] - 0.004)
    const temple = teTempleArcPoints(erheliao, sizhukong, 'TE22', 'TE23')
    expect(temple[0]).toEqual(erheliao)
    expect(temple.at(-1)).toEqual(sizhukong)
    const templeMid = temple[Math.floor(temple.length / 2)]
    expect(templeMid[2]).toBeGreaterThan((erheliao[2] + sizhukong[2]) / 2 - 0.002)
    const front = teHeadArcPoints('TE21', 'TE22', ermen, erheliao)
    expect(front.length).toBeGreaterThan(8)
    expect(front[0]).toEqual(ermen)
    expect(front.at(-1)).toEqual(erheliao)
  })

  it('keeps a high-curvature ear polyline that the default geodesic gate would drop', () => {
    const wiggly = []
    for (let index = 0; index < 20; index += 1) {
      wiggly.push([
        0.085 + (index % 2) * 0.0015,
        1.40 + index * 0.005,
        -0.02 + Math.sin(index * 0.7) * 0.004,
      ])
    }
    expect(geodesicIsStable(wiggly)).toBe(false)
    expect(geodesicIsStable(wiggly, TE_EAR_GEODESIC_STABLE)).toBe(true)
  })

  it('keeps 小海–肩貞 on the posterior arm, not the axilla or chest', () => {
    expect(isSiXiaohaiJianzhenPair('SI8', 'SI9')).toBe(true)
    expect(isSiXiaohaiJianzhenPair('SI9', 'SI8')).toBe(true)
    expect(isSiXiaohaiJianzhenPair('SI7', 'SI8')).toBe(false)
    expect(isSiXiaohaiJianzhenPair('TE14', 'TE13')).toBe(false)
    expect(pairKeepsOffPathLocators('SI8', 'SI9')).toBe(true)
    expect(pairKeepsOffPathLocators('TE18', 'TE19')).toBe(true)
    expect(pairKeepsOffPathLocators('TE21', 'TE22')).toBe(true)
    expect(pairKeepsOffPathLocators('TE16', 'TE17')).toBe(false)
    expect(pairKeepsOffPathLocators('LU2', 'LU3')).toBe(false)
    const xiaohai = [0.32, 1.02, -0.04]
    const jianzhen = [0.18, 1.32, -0.08]
    const guide = siArmShoulderWrapGuide([0.25, 1.17, -0.06], 0.25)
    expect(guide[2]).toBeLessThan(-0.7)
    expect(guide[0]).toBeGreaterThan(0)
    expect(isSiArmShoulderHit([0.30, 1.16, -0.09], xiaohai, jianzhen)).toBe(true)
    expect(isSiArmShoulderHit([0.06, 1.18, -0.04], xiaohai, jianzhen)).toBe(false)
    expect(isSiArmShoulderHit([0.16, 1.17, -0.05], xiaohai, jianzhen)).toBe(false)
    expect(isSiArmShoulderHit([0.24, 1.16, 0.08], xiaohai, jianzhen)).toBe(false)
    expect(isSiArmShoulderHit([-0.26, 1.16, -0.07], xiaohai, jianzhen)).toBe(false)
    const midChord = [
      (xiaohai[0] + jianzhen[0]) / 2,
      (xiaohai[1] + jianzhen[1]) / 2,
      (xiaohai[2] + jianzhen[2]) / 2,
    ]
    const outer = siArmShoulderOuterPoint(xiaohai, jianzhen, 0.5)
    expect(Math.abs(outer[0])).toBeGreaterThan(Math.abs(midChord[0]))
    expect(outer[2]).toBeLessThan(midChord[2])
    expect(isSiArmShoulderHit(midChord, xiaohai, jianzhen, 0.5)).toBe(false)
  })

  it('lets 小海–肩貞 locators leave the rest corridor without entering the axilla', () => {
    const xiaohai = [0.32, 1.02, -0.04]
    const jianzhen = [0.18, 1.32, -0.08]
    const outer = siArmShoulderOuterPoint(xiaohai, jianzhen, 0.5)
    const beside = [outer[0] + 0.05, outer[1], outer[2] - 0.07]
    const innerPosterior = [0.16, 1.17, -0.10]
    expect(isSiArmShoulderHandleOk(beside, xiaohai, jianzhen)).toBe(true)
    expect(isSiArmShoulderHandleOk(outer, xiaohai, jianzhen)).toBe(true)
    expect(isSiArmShoulderHandleOk(innerPosterior, xiaohai, jianzhen)).toBe(true)
    expect(isSiArmShoulderHit(innerPosterior, xiaohai, jianzhen, 0.5)).toBe(false)
    const midChord = [
      (xiaohai[0] + jianzhen[0]) / 2,
      (xiaohai[1] + jianzhen[1]) / 2,
      (xiaohai[2] + jianzhen[2]) / 2,
    ]
    expect(isSiXiaohaiJianzhenAxillaHollow([0.06, 1.18, -0.04], xiaohai, jianzhen)).toBe(true)
    expect(isSiArmShoulderHandleOk([0.06, 1.18, -0.04], xiaohai, jianzhen)).toBe(false)
    expect(isSiArmShoulderHandleOk([-0.26, 1.16, -0.07], xiaohai, jianzhen)).toBe(false)
    expect(isSiArmShoulderHandleOk([0.24, 1.16, 0.10], xiaohai, jianzhen)).toBe(false)
    expect(isSiXiaohaiJianzhenAxillaHollow(midChord, xiaohai, jianzhen)).toBe(false)
  })
})
