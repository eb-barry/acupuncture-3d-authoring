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
  isGbShoulderAxillaSpan,
  isShoulderAxillaWrap,
  gbLateralChestGuide,
  gbLocatorCastStandoff,
  gbLocatorOutsideProbe,
  gbJianjingYuanyeOuterPoint,
  gbJianjingYuanyeGuidePoints,
  isGbAxillaHollow,
  isGbJianjingYuanyeHandleOk,
  isGbJianjingYuanyeHit,
  pairPrefersWrap,
  KI_YINGU_CHANGQIANG_FOLD_T,
  kiYinguChangqiangMedialT,
  kiYinguChangqiangOuterPoint,
  kiYinguChangqiangGuide,
  isKiYinguChangqiangHit,
  isKiYinguChangqiangPair,
  LI_FUTU_HELIAO_JAW_T,
  liFutuHeliaoCheekT,
  liFutuHeliaoOuterPoint,
  liFutuHeliaoGuide,
  isLiFutuHeliaoHit,
  isLiFutuHeliaoPair,
  pathFollowsFacingChord,
  pickPairAlongPolyline,
  isDuBackWrapPair,
  posteriorWrapGuide,
  shouldFrontWrap,
  shouldPosteriorWrap,
  isSagittalMidlineSpan,
  hitStaysOnSagittalSpan,
  hitStaysOnFrontMidline,
  hitStaysNearMidlineChord,
  midlineFrontProbeOrigin,
  midlineBackProbeOrigin,
  hitMatchesMidlineSampleY,
  hitStaysOnMidlineX,
  isGvFacePair,
  isGvOcciputPair,
  isCvAnteriorPair,
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
    expect(isGvOcciputPair('GV16', 'GV19')).toBe(true)
    expect(isGvOcciputPair('GV18', 'GV17')).toBe(true)
    expect(isGvOcciputPair('GV24', 'GV25')).toBe(false)
    const houding = [0.004, 1.62, -0.02]
    const fengfu = [-0.005, 1.50, -0.08]
    expect(shouldPosteriorWrap(houding, fengfu)).toBe(true)
    const femaleHouding = [2.1, 376, -4.6]
    const femaleFengfu = [-1.4, 348, -18.6]
    expect(shouldPosteriorWrap(femaleHouding, femaleFengfu)).toBe(true)
    expect(shouldFrontWrap(femaleHouding, femaleFengfu)).toBe(false)
    const femaleOcciputMid = [0.4, 362, -20]
    expect(isHitOnWrapSide(femaleOcciputMid, femaleHouding, femaleFengfu)).toBe(true)
    const backProbe = midlineBackProbeOrigin(houding, fengfu, 0.5, 0.08)
    expect(backProbe[2]).toBeLessThan(Math.min(houding[2], fengfu[2]))
    expect(surfaceStepLength(0.12, 0.9)).toBeCloseTo(surfaceStepLength(0.12, 0.9), 8)
    expect(surfaceStepLength(28, 0.9)).toBeGreaterThan(0.2)
    expect(surfaceStepLength(0.08, -0.8)).toBeLessThan(0.008)
  })

  it('keeps 神庭→素髎 and 玉堂→膻中 on the sagittal midline, not in the sky or off the sternum', () => {
    const shenting = [0.004, 1.62, 0.08]
    const suliao = [-0.003, 1.51, 0.12]
    const faceMid = [0.002, 1.565, 0.10]
    const skyLoop = [0.22, 1.70, 0.18]
    const yutang = [0.006, 1.28, 0.09]
    const danzhong = [-0.005, 1.22, 0.10]
    const sternumMid = [0.001, 1.25, 0.095]
    const chestJog = [0.12, 1.25, 0.08]
    const jianjing = [0.1192, 1.5029, -0.0947]
    const yuanye = [0.1886, 1.3039, -0.0628]
    expect(isSagittalMidlineSpan(shenting, suliao)).toBe(true)
    expect(isSagittalMidlineSpan(yutang, danzhong)).toBe(true)
    expect(isSagittalMidlineSpan(jianjing, yuanye)).toBe(false)
    expect(shouldFrontWrap(shenting, suliao)).toBe(true)
    expect(shouldFrontWrap(yutang, danzhong)).toBe(true)
    expect(hitStaysOnSagittalSpan(faceMid, shenting, suliao)).toBe(true)
    expect(hitStaysOnSagittalSpan(skyLoop, shenting, suliao)).toBe(false)
    expect(hitStaysOnSagittalSpan(sternumMid, yutang, danzhong)).toBe(true)
    expect(hitStaysOnSagittalSpan(chestJog, yutang, danzhong)).toBe(false)
    expect(isHitOnWrapSide(faceMid, shenting, suliao)).toBe(true)
    expect(isHitOnWrapSide(skyLoop, shenting, suliao)).toBe(false)
    expect(isHitOnWrapSide(sternumMid, yutang, danzhong)).toBe(true)
    expect(isHitOnWrapSide(chestJog, yutang, danzhong)).toBe(false)
    const skyFront = [0.002, 1.565, 0.28]
    expect(isGvFacePair('GV24', 'GV25')).toBe(true)
    expect(isGvFacePair('GV28', 'GV25')).toBe(true)
    expect(isGvFacePair('GV14', 'GV15')).toBe(false)
    expect(isCvAnteriorPair('CV18', 'CV17')).toBe(true)
    expect(isCvAnteriorPair('CV15', 'CV14')).toBe(true)
    expect(isCvAnteriorPair('CV12', 'CV11')).toBe(true)
    expect(isCvAnteriorPair('CV1', 'CV2')).toBe(false)
    expect(hitStaysOnFrontMidline(faceMid, shenting, suliao)).toBe(true)
    expect(hitStaysOnFrontMidline(skyFront, shenting, suliao)).toBe(false)
    expect(hitStaysOnFrontMidline([0.002, 1.565, -0.12], shenting, suliao)).toBe(false)
    const femaleJiuwei = [0, 262, 22.77]
    const femaleJuque = [0, 252, 23.58]
    const femaleXiphoid = [0, 257, 18.4]
    expect(hitStaysOnFrontMidline(femaleXiphoid, femaleJiuwei, femaleJuque)).toBe(true)
    expect(hitStaysOnMidlineX(femaleXiphoid, femaleJiuwei, femaleJuque, 0.5)).toBe(true)
    expect(hitStaysOnMidlineX([1.1, 257, 20], femaleJiuwei, femaleJuque, 0.5)).toBe(false)
    expect(isHitOnWrapSide(skyFront, shenting, suliao)).toBe(false)
    expect(hitStaysNearMidlineChord(sternumMid, yutang, danzhong)).toBe(true)
    expect(hitStaysNearMidlineChord(chestJog, yutang, danzhong)).toBe(false)
    const jiuwei = [0.004, 1.12, 0.09]
    const juque = [-0.003, 1.08, 0.09]
    const zhongwan = [0.002, 1.02, 0.085]
    const jianli = [-0.002, 0.98, 0.085]
    expect(hitStaysNearMidlineChord([0.003, 1.10, 0.09], jiuwei, juque)).toBe(true)
    expect(hitStaysNearMidlineChord([0.08, 1.10, 0.09], jiuwei, juque)).toBe(false)
    expect(hitStaysNearMidlineChord([0.001, 1.00, 0.085], zhongwan, jianli)).toBe(true)
    expect(hitStaysNearMidlineChord([0.07, 1.00, 0.085], zhongwan, jianli)).toBe(false)
    const midProbe = midlineFrontProbeOrigin(shenting, suliao, 0.5, 0.08)
    expect(midProbe[1]).toBeCloseTo(1.565, 3)
    expect(midProbe[2]).toBeGreaterThan(Math.max(shenting[2], suliao[2]))
    expect(hitMatchesMidlineSampleY(faceMid, shenting, suliao, 0.5)).toBe(true)
    expect(hitMatchesMidlineSampleY(suliao, shenting, suliao, 0.5)).toBe(false)
    const yutangProbe = midlineFrontProbeOrigin(yutang, danzhong, 0.5, 0.05)
    expect(Math.abs(yutangProbe[0])).toBeLessThan(0.01)
    expect(yutangProbe[1]).toBeCloseTo(1.25, 3)
    const femaleShenting = shenting.map((value) => value * 232)
    const femaleSuliao = suliao.map((value) => value * 232)
    const femaleSky = skyLoop.map((value) => value * 232)
    const femaleFace = faceMid.map((value) => value * 232)
    expect(isSagittalMidlineSpan(femaleShenting, femaleSuliao)).toBe(true)
    expect(hitStaysOnSagittalSpan(femaleFace, femaleShenting, femaleSuliao)).toBe(true)
    expect(hitStaysOnSagittalSpan(femaleSky, femaleShenting, femaleSuliao)).toBe(false)
    const chestBump = [0.001, 1.25, 0.16]
    expect(hitStaysOnMidlineX(chestBump, yutang, danzhong, 0.5)).toBe(true)
    expect(hitStaysOnMidlineX(chestJog, yutang, danzhong, 0.5)).toBe(false)
    const femaleYutang = yutang.map((value) => value * 232)
    const femaleDanzhong = danzhong.map((value) => value * 232)
    const femaleBump = [0.2, 1.25 * 232, 0.16 * 232]
    const femalePec = [0.12 * 232, 1.25 * 232, 0.08 * 232]
    expect(hitStaysOnMidlineX(femaleBump, femaleYutang, femaleDanzhong, 0.5)).toBe(true)
    expect(hitStaysOnMidlineX(femalePec, femaleYutang, femaleDanzhong, 0.5)).toBe(false)
    expect(shouldFrontWrap(femaleShenting, femaleSuliao)).toBe(true)
    expect(shouldPosteriorWrap(femaleShenting, femaleSuliao)).toBe(false)
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

  it('routes 肩井→淵腋 on the lateral chest, not through the axilla or onto the pecs', () => {
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
    expect(isGbShoulderAxillaSpan('GB21', 'GB22', jianjing, yuanye)).toBe(true)
    expect(isGbShoulderAxillaSpan('LU2', 'LU3', yunmen, tianfu)).toBe(false)
    expect(isShoulderAxillaWrap(jianjing, yuanye)).toBe(true)
    expect(isShoulderAxillaWrap(yunmen, tianfu)).toBe(false)
    expect(isShoulderAxillaWrap(shidou, fuai)).toBe(false)
    expect(isShoulderAxillaWrap(ki10, ki11)).toBe(false)
    expect(pairPrefersWrap('GB21', 'GB22', jianjing, yuanye)).toBe(false)
    expect(pairKeepsOffPathLocators('GB21', 'GB22')).toBe(true)
    expect(pairPrefersWrap('LU2', 'LU3', yunmen, tianfu)).toBe(false)
    expect(pairPrefersWrap('SP17', 'SP16', shidou, fuai)).toBe(false)
    expect(pairPrefersWrap('TE20', 'TE21', [0.078, 1.694, -0.041], [0.075, 1.666, -0.012])).toBe(false)
    expect(isFacingLimbSpan(jianjing, yuanye, 0.4)).toBe(false)

    const gv1 = [0.0, 0.88, -0.10]
    expect(isKiYinguChangqiangPair('KI10', 'GV1')).toBe(true)
    expect(pairPrefersWrap('KI10', 'GV1', ki10, gv1)).toBe(false)
    expect(kiYinguChangqiangMedialT(KI_YINGU_CHANGQIANG_FOLD_T)).toBe(0)
    expect(kiYinguChangqiangMedialT(1)).toBe(1)
    const thighMid = kiYinguChangqiangOuterPoint(ki10, gv1, 0.35)
    expect(thighMid[0]).toBeLessThan(-0.04)
    expect(thighMid[2]).toBeLessThan(Math.max(ki10[2], gv1[2]))
    expect(isKiYinguChangqiangHit(thighMid, ki10, gv1, 0.35)).toBe(true)
    const cleft = kiYinguChangqiangOuterPoint(ki10, gv1, 0.92)
    expect(Math.abs(cleft[0])).toBeLessThan(0.04)
    expect(isKiYinguChangqiangHit(cleft, ki10, gv1, 0.92)).toBe(true)
    expect(isKiYinguChangqiangHit([0.12, 0.7, 0.12], ki10, gv1, 0.5)).toBe(false)
    expect(isKiYinguChangqiangHit([-0.12, 0.78, -0.18], ki10, gv1, 0.82)).toBe(false)
    const fold = kiYinguChangqiangOuterPoint(ki10, gv1, KI_YINGU_CHANGQIANG_FOLD_T)
    const half = kiYinguChangqiangOuterPoint(ki10, gv1, (KI_YINGU_CHANGQIANG_FOLD_T + 1) / 2)
    expect(Math.abs(fold[0])).toBeGreaterThan(0.05)
    expect(Math.abs(half[0] - fold[0] * 0.5)).toBeLessThan(0.01)
    expect(half[2]).toBeGreaterThan(Math.min(ki10[2], gv1[2]) - 0.03)
    const diagonal = [0.50, 0.62, 0.74, 0.86, 1].map((t) => kiYinguChangqiangOuterPoint(ki10, gv1, t))
    for (let index = 1; index < diagonal.length; index += 1) {
      expect(Math.abs(diagonal[index][0])).toBeLessThanOrEqual(Math.abs(diagonal[index - 1][0]) + 1e-9)
    }
    const femaleKi10 = ki10.map((value) => value * 232)
    const femaleGv1 = gv1.map((value) => value * 232)
    const femaleThigh = kiYinguChangqiangOuterPoint(femaleKi10, femaleGv1, 0.35)
    expect(femaleThigh[0]).toBeLessThan(femaleKi10[0] * 0.4)
    expect(isKiYinguChangqiangHit(femaleThigh, femaleKi10, femaleGv1, 0.35)).toBe(true)
    const femaleHalf = kiYinguChangqiangOuterPoint(
      femaleKi10,
      femaleGv1,
      (KI_YINGU_CHANGQIANG_FOLD_T + 1) / 2,
    )
    expect(Math.abs(femaleHalf[0])).toBeLessThan(Math.abs(femaleKi10[0]) * 0.7)
    expect(kiYinguChangqiangGuide(ki10, gv1, 0.3)[2]).toBeLessThan(0)

    const li18 = [0.062, 1.498, 0.048]
    const li19 = [0.013, 1.638, 0.108]
    const chordMid = [
      (li18[0] + li19[0]) / 2,
      (li18[1] + li19[1]) / 2,
      (li18[2] + li19[2]) / 2,
    ]
    expect(isLiFutuHeliaoPair('LI18', 'LI19')).toBe(true)
    expect(pairPrefersWrap('LI18', 'LI19', li18, li19)).toBe(false)
    expect(liFutuHeliaoCheekT(LI_FUTU_HELIAO_JAW_T)).toBe(0)
    expect(liFutuHeliaoCheekT(1)).toBe(1)
    const neckHold = liFutuHeliaoOuterPoint(li18, li19, 0.10)
    expect(Math.abs(neckHold[0])).toBeGreaterThan(Math.abs(li18[0]) * 0.8)
    expect(neckHold[2]).toBeGreaterThan(li18[2] - 0.01)
    const cheek = liFutuHeliaoOuterPoint(li18, li19, 0.68)
    expect(Math.abs(cheek[0])).toBeLessThan(Math.abs(li18[0]) - 0.01)
    expect(Math.abs(cheek[0])).toBeGreaterThan(Math.abs(li19[0]))
    expect(cheek[2]).toBeGreaterThan(chordMid[2] + 0.02)
    expect(isLiFutuHeliaoHit(cheek, li18, li19, 0.68)).toBe(true)
    expect(isLiFutuHeliaoHit(chordMid, li18, li19, 0.5)).toBe(false)
    expect(isLiFutuHeliaoHit([-0.06, 1.56, 0.08], li18, li19, 0.5)).toBe(false)
    expect(liFutuHeliaoGuide(li18, li19, 0.5)[2]).toBeGreaterThan(0.5)
    const femaleLi18 = li18.map((value) => value * 232)
    const femaleLi19 = li19.map((value) => value * 232)
    const femaleCheek = liFutuHeliaoOuterPoint(femaleLi18, femaleLi19, 0.68)
    expect(femaleCheek[2]).toBeGreaterThan((femaleLi18[2] + femaleLi19[2]) / 2)
    expect(isLiFutuHeliaoHit(femaleCheek, femaleLi18, femaleLi19, 0.68)).toBe(true)
    const femaleJaw = [
      (femaleLi18[0] + femaleLi19[0]) / 2,
      (femaleLi18[1] + femaleLi19[1]) / 2,
      (femaleLi18[2] + femaleLi19[2]) / 2,
    ]
    expect(isLiFutuHeliaoHit(femaleJaw, femaleLi18, femaleLi19, 0.5)).toBe(false)

    const midChord = [
      (jianjing[0] + yuanye[0]) / 2,
      (jianjing[1] + yuanye[1]) / 2,
      (jianjing[2] + yuanye[2]) / 2,
    ]
    const outer = gbJianjingYuanyeOuterPoint(jianjing, yuanye, 0.5)
    expect(Math.abs(outer[0])).toBeGreaterThan(Math.abs(midChord[0]) + 0.02)
    expect(outer[2]).toBeGreaterThan(Math.max(jianjing[2], yuanye[2]))
    expect(outer[2]).toBeLessThan(0.04)
    expect(isGbAxillaHollow(midChord, jianjing, yuanye)).toBe(true)
    expect(isGbAxillaHollow(outer, jianjing, yuanye)).toBe(false)
    expect(isGbAxillaHollow([0.10, 1.40, 0.08], jianjing, yuanye)).toBe(true)
    expect(isGbJianjingYuanyeHit(outer, jianjing, yuanye, 0.5)).toBe(true)
    expect(isGbJianjingYuanyeHit(midChord, jianjing, yuanye, 0.5)).toBe(false)
    expect(isGbJianjingYuanyeHandleOk(outer, jianjing, yuanye)).toBe(true)
    expect(isGbJianjingYuanyeHandleOk([0.10, 1.40, 0.10], jianjing, yuanye)).toBe(false)
    const pulledMedial = [outer[0] - 0.035, outer[1], outer[2] + 0.01]
    const pulledLateral = [outer[0] + 0.02, outer[1], outer[2] + 0.012]
    expect(isGbJianjingYuanyeHandleOk(pulledMedial, jianjing, yuanye)).toBe(true)
    expect(isGbJianjingYuanyeHandleOk(pulledLateral, jianjing, yuanye)).toBe(true)
    expect(isGbJianjingYuanyeHit(pulledMedial, jianjing, yuanye, 0.5)).toBe(false)
    const gbSpan = Math.hypot(
      jianjing[0] - yuanye[0],
      jianjing[1] - yuanye[1],
      jianjing[2] - yuanye[2],
    )
    const pulledRight = [
      outer[0] + gbSpan * 0.14,
      outer[1],
      outer[2] - gbSpan * 0.20,
    ]
    expect(isGbJianjingYuanyeHandleOk(pulledRight, jianjing, yuanye)).toBe(true)
    expect(isGbJianjingYuanyeHandleOk(
      [Math.max(Math.abs(jianjing[0]), Math.abs(yuanye[0])) + gbSpan * 0.75, outer[1], outer[2]],
      jianjing,
      yuanye,
    )).toBe(false)
    expect(isGbJianjingYuanyeHandleOk(tianfu, jianjing, yuanye)).toBe(false)
    const femaleJianjing = jianjing.map((value) => value * 232)
    const femaleYuanye = yuanye.map((value) => value * 232)
    const femaleOuter = gbJianjingYuanyeOuterPoint(femaleJianjing, femaleYuanye, 0.5)
    const femaleSpan = Math.hypot(
      femaleJianjing[0] - femaleYuanye[0],
      femaleJianjing[1] - femaleYuanye[1],
      femaleJianjing[2] - femaleYuanye[2],
    )
    const femalePulled = [
      femaleOuter[0] - femaleSpan * 0.12,
      femaleOuter[1],
      femaleOuter[2] + femaleSpan * 0.05,
    ]
    expect(isGbJianjingYuanyeHandleOk(femaleOuter, femaleJianjing, femaleYuanye)).toBe(true)
    expect(isGbJianjingYuanyeHandleOk(femalePulled, femaleJianjing, femaleYuanye)).toBe(true)
    expect(isGbJianjingYuanyeHandleOk([0.10 * 232, 1.40 * 232, 0.10 * 232], femaleJianjing, femaleYuanye)).toBe(false)

    const guide = gbLateralChestGuide(midChord, 0.15)
    expect(Math.abs(guide[0])).toBeGreaterThan(0.6)
    expect(guide[2]).toBeGreaterThan(0.25)
    expect(guide[2]).toBeLessThan(0.7)

    const path = gbJianjingYuanyeGuidePoints(jianjing, yuanye, 10)
    expect(path[0]).toEqual(jianjing)
    expect(path.at(-1)).toEqual(yuanye)
    const mid = path[Math.floor(path.length / 2)]
    expect(Math.abs(mid[0])).toBeGreaterThan(Math.abs(midChord[0]))
    expect(mid[2]).toBeGreaterThan(midChord[2] + 0.03)
    expect(path.every((point) => !isGbAxillaHollow(point, jianjing, yuanye)
      || point === path[0] || point === path.at(-1))).toBe(true)

    const dist = (left, right) => Math.hypot(
      left[0] - right[0],
      left[1] - right[1],
      left[2] - right[2],
    )
    const nearest = (polyline, target) => Math.min(
      ...polyline.map((point) => dist(point, target)),
    )
    const locatorCurve = catmullRomThrough([jianjing, pulledMedial, yuanye], 16)
    expect(nearest(locatorCurve, pulledMedial)).toBeLessThan(0.0001)
    expect(nearest(locatorCurve, pulledMedial)).toBeLessThan(nearest(path, pulledMedial) * 0.35)

    const interior = [
      (jianjing[0] + yuanye[0]) / 2,
      (jianjing[1] + yuanye[1]) / 2,
      (jianjing[2] + yuanye[2]) / 2,
    ]
    const probe = gbLocatorOutsideProbe(interior, jianjing, yuanye)
    expect(Math.abs(probe[0])).toBeGreaterThan(Math.abs(interior[0]) + 0.02)
    expect(gbLocatorCastStandoff(jianjing, yuanye)).toBeGreaterThan(0.05)
    const femaleProbe = gbLocatorOutsideProbe(
      interior.map((value) => value * 232),
      femaleJianjing,
      femaleYuanye,
    )
    expect(Math.abs(femaleProbe[0])).toBeGreaterThan(Math.abs(interior[0] * 232) + femaleSpan * 0.1)
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
