import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree, getTriangleHitPointInfo } from 'three-mesh-bvh'
import { MERIDIANS, POINTS, POINT_BY_CODE, isGbChenglingNaokongPair, isKiYinguChangqiangPair, isOmittedSurfaceSpan, isRenDuCodePair, meridianById, meridianLineColor, acupointMarkerColor, pointsForMeridian } from './catalog.js'
import {
  BODY_MODELS,
  emptyDocument,
  exportFileName,
  inferBodyModel,
  parseDocument,
  sanitizeRouteNode,
  validateDocument,
} from './document.js'
import { cloneStudioDocument, isCurrentBodyLoad, resolveStudioBodyId, shouldLoadBodyModel } from './bodyLoad.js'
import { isDevMode } from './devFlag.js'
import { bindDocumentToBody, mapDocumentAnnotations, scalePosition } from './retarget.js'
import {
  IDLE_SHADOW_MAP_SIZE,
  ORBIT_SHADOW_MAP_SIZE,
  clampPixelRatio,
  shouldUseFastOrbitView,
} from './orbitView.js'
import { History } from './history.js'
import {
  cameraPoseFacingAxis,
  inferBodyFrontFromBounds,
  inferBodyFrontFromNormalVote,
} from './frontLevel.js'
import {
  SKIN_LIFT,
  isPointBehindSurface,
  isHitOnWrapSide,
  catmullRomThrough,
  digitDistalDir,
  digitPalmarDir,
  digitTipProbe,
  isDigitTipWrap,
  isOnDigitSkin,
  isTeEarArcPair,
  isTeHeadPair,
  isTeTempleHandlePair,
  pairKeepsOffPathLocators,
  isTeTempleRunPair,
  teEarCenter,
  teHeadArcPoints,
  isDuBackWrapPair,
  isGbShoulderAxillaSpan,
  isGbAxillaHollow,
  isGbJianjingYuanyeHandleOk,
  isGbJianjingYuanyeHit,
  gbJianjingYuanyeGuidePoints,
  gbJianjingYuanyeOuterPoint,
  gbLateralChestGuide,
  gbLocatorCastStandoff,
  gbLocatorOutsideProbe,
  gbPairSpan,
  isSiXiaohaiJianzhenPair,
  isSiXiaohaiJianzhenAxillaHollow,
  isSiArmShoulderHandleOk,
  isSiArmShoulderHit,
  posteriorWrapGuide,
  siArmShoulderGuidePoints,
  siArmShoulderOuterPoint,
  siArmShoulderWrapGuide,
  maxPolylineEdge,
  TE_EAR_GEODESIC_STABLE,
  isFacingLimbSpan,
  isShoulderAxillaWrap,
  pairPrefersWrap,
  marchStandoff,
  pathFollowsFacingChord,
  outwardWrapGuide,
  pickPairAlongPolyline,
  pruneBacktracking,
  shouldFrontWrap,
  shouldPosteriorWrap,
  isSagittalMidlineSpan,
  hitStaysOnFrontMidline,
  hitStaysOnMidlineX,
  midlineFrontProbeOrigin,
  midlineBackProbeOrigin,
  hitMatchesMidlineSampleY,
  isGvFacePair,
  isGvOcciputPair,
  isCvAnteriorPair,
  KI_YINGU_CHANGQIANG_FOLD_T,
  isKiYinguChangqiangHit,
  kiYinguChangqiangCastStandoff,
  kiYinguChangqiangGuide,
  kiYinguChangqiangOuterPoint,
  isGbChenglingNaokongHit,
  gbChenglingNaokongCastStandoff,
  gbChenglingNaokongGuide,
  gbChenglingNaokongOuterPoint,
  slerpUnitVectors,
  surfaceStepLength,
  useConvexChordWrap,
} from './skinPath.js'
import {
  DEFAULT_MARKER_DIAMETER_MM,
  DEFAULT_RIBBON_WIDTH_MM,
  DEFAULT_SKIN_LIFT_MM,
  MARKER_MIN_PIXELS,
  MAX_MARKER_DIAMETER_MM,
  MAX_RIBBON_WIDTH_MM,
  MAX_SKIN_LIFT_MM,
  MIN_MARKER_DIAMETER_MM,
  MIN_RIBBON_WIDTH_MM,
  RIBBON_MIN_PIXELS,
  buildDiscAttributes,
  buildRibbonAttributes,
  clampMillimetres,
  conformDisc,
  conformPath,
  densifyPath,
  markerScreenScale,
  MAX_CONFORM_PULL,
  perspectivePixelScale,
  sampleStepForQuality,
  smoothPathNormals,
  tangentWindow,
  worldPerMillimetre,
  REFERENCE_BODY_HEIGHT_M,
} from './skinRibbon.js'
import {
  buildCombinedSurfaceGraph,
  collapseOppositeWallSpikes,
  collapseSharpChordSpikes,
  densifyPolylineWithNormals,
  dist3,
  distanceToSegment3,
  geodesicIsStable,
  shortestSurfacePath,
  simplifyPolylineWithNormals,
  snapPolylineToSurface,
  tautOnSurfacePolyline,
} from './geodesic.js'
import {
  FALLBACK_SHORT_SEGMENT_ARC,
  HANDLE_COMMIT_MIN_GAP,
  HANDLE_SKIN_SNAP_RADIUS,
  HANDLE_STRETCH_MAX_OFF_PATH,
  TE_HEAD_HANDLE_MIN_GAP,
  HANDLE_STRETCH_PROJECT_RADIUS,
  HANDLE_PICK_RADIUS_PX,
  MAX_PAIR_HANDLES,
  buildRouteNodesFromPlaced,
  clampHandleT,
  closestTOnPolyline,
  catalogSequence,
  defaultHandleTs,
  drawableSurfacePairRuns,
  appendExtraPairsToRuns,
  exceedsDragThreshold,
  isDisorderedPolyline,
  isOcclusionHitBlocking,
  isProbeOnSameLimbSegment,
  isSurfaceFacingCamera,
  keepLocatorsOnPairLimb,
  keepPairHandles,
  locatorOnPairLimb,
  mergeControlsIntoRoute,
  meridianUsesLocators,
  nearestScreenIndex,
  nextHandleInsertT,
  normalizePlacedPointSide,
  orderRouteAcupointsForDrawing,
  placedPointSide,
  placementProgress,
  pointAtPolylineT,
  polylineArcLength,
  locatorSpans,
  removePointIdsFromRouteNodes,
  resolveHandleSlots,
  routeHasDrawableAcupoints,
  sameSpatialSide,
  spatialSideFromPosition,
  visibleHandleCount,
} from './workflow.js'

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree
THREE.Mesh.prototype.raycast = acceleratedRaycast

const $ = (selector) => document.querySelector(selector)
const makeId = () => crypto.randomUUID()
const toArray = ({ x, y, z }) => [x, y, z]
const PALETTE = [
  ['#ef4444', '紅色'],
  ['#3b82f6', '藍色'],
  ['#22c55e', '綠色'],
  ['#111111', '黑色'],
]
const colorOptions = (selected) => PALETTE
  .map(([value, name]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${name}</option>`)
  .join('')

$('#app').innerHTML = `
<header class="topbar">
  <div class="brand"><span>經</span><strong>經絡製圖室</strong><small>Meridian Studio</small></div>
  <div class="topbar-center">
    <div class="file-actions">
      <label class="button primary">載入 GLB<input id="model-file" type="file" accept=".glb,model/gltf-binary" hidden></label>
      <label class="button" title="匯入到目前選擇的人體模型。男性 JSON 也可對應到女性模型（依身高貼膚，再請微調）。">匯入 JSON<input id="json-file" type="file" accept=".json,application/json" hidden></label>
      <button id="validate">驗證</button><button id="export">匯出</button>
    </div>
    <nav class="tools" aria-label="模式與工具">
      <button id="mode-view" class="tool" type="button" aria-pressed="false" title="唯讀檢視：可旋轉縮放、勾選顯示、匯入匯出">◎ <span>檢視</span></button>
      <button id="mode-edit" class="tool active" type="button" aria-pressed="true" title="編輯：點皮膚加穴、拖曳穴位與經脈曲度">✎ <span>編輯</span></button>
      <button id="face-front" class="tool" type="button" title="自動將身體正面朝向螢幕，方便定位任脈">▣ <span>正面朝向</span></button>
      <button id="face-back" class="tool" type="button" title="自動將身體背面朝向螢幕，方便定位督脈">▦ <span>背面朝向</span></button>
      <button id="lock-orbit" class="tool" type="button" aria-pressed="false" title="鎖定旋轉：可上下左右平移，視角朝向不變，仍可編輯">🔒 <span>鎖定旋轉</span></button>
      <button id="redraw-segment" class="tool finish" type="button" disabled title="依目前黑點，沿皮膚重繪這兩個穴位之間的經脈">⟳ <span>重繪經脈</span></button>
      <button id="add-locator" class="tool" type="button" disabled title="在選取的兩穴之間新增一個定位點">＋ <span>增加定位點</span></button>
      <button id="remove-locator" class="tool" type="button" disabled title="刪除選取線段上的一個定位點">－ <span>刪除定位點</span></button>
      <button id="undo-step" class="tool" type="button" title="回復上一步（Ctrl／⌘+Z）">↩ <span>回復上一步</span></button>
      <button id="delete-selection" class="tool danger-tool" type="button" disabled title="刪除選取的穴位或經脈路線">⌫ <span>刪除</span></button>
    </nav>
  </div>
  <div class="history-actions"><button id="undo" title="復原 Ctrl/⌘+Z">↶</button><button id="redo" title="重做 Ctrl/⌘+Shift+Z">↷</button></div>
</header>
<main class="workspace">
  <aside class="panel catalog-panel">
    <div class="panel-heading"><span>穴位目錄</span><b id="catalog-count"></b></div>
    <div class="catalog-filters">
      <label>選擇經脈<select id="meridian-filter">${MERIDIANS.map((item) => `<option value="${item.id}">${item.name} · ${item.id}</option>`).join('')}</select></label>
      <input id="catalog-search" class="search" type="search" placeholder="搜尋代碼或穴位名稱…" autocomplete="off">
    </div>
    <div id="catalog" class="catalog"></div>
    <div id="point-details" class="point-details"></div>
    <div class="placement">
      <label id="side-control">先定位側別<select id="point-side"><option value="left">左側 L</option><option value="right">右側 R</option></select></label>
      <div id="placement-progress" class="placement-progress"></div>
      <p>編輯模式：點皮膚定位穴位。點兩個穴位之間的經脈可出現黑點（短於約 25 mm 預設沒有，之後約每 40 mm 一顆，最多五顆）。可用「增加定位點／刪除定位點」增減；拖黑點時經脈會跟著走。任督二脈沒有黑點。拉錯可按「回復上一步」。</p>
    </div>
  </aside>
  <section class="stage">
    <div id="viewport" tabindex="0"><div id="viewport-grid" class="viewport-grid" aria-hidden="true"></div><div id="model-loading" class="model-loading"><p id="model-loading-text">正在載入人體模型…</p></div></div>
    <div id="zoom-indicator" class="zoom-indicator" aria-live="polite">1.00×</div>
    <div class="stage-help" id="stage-help">拖曳旋轉 · 滾輪縮放 · 右鍵／Shift 平移</div>
    <div class="axis"><i class="x"></i>X <i class="y"></i>Y <i class="z"></i>Z</div>
    <div id="drop-hint">放開以載入 GLB</div>
  </section>
  <aside class="panel inspector-panel">
    <div class="panel-heading"><span>場景物件</span><b id="object-count">0</b></div>
    <div class="object-filters">
      <label class="scene-meridian-field">人體模型
        <select id="body-model-filter" title="匯入 JSON 會套用到此處目前選擇的模型，不再依檔案內的 male/female 欄位切換人體。">
          <option value="male" selected>男性 · male_character</option>
          <option value="female">女性 · female-character</option>
        </select>
      </label>
      <div class="visible-meridians-field">
        <div class="visible-meridians-heading">
          <span>顯示經脈／穴位</span>
          <div class="visible-meridians-actions">
            <button type="button" id="visible-meridians-all" title="勾選全部已定位經脈">全選</button>
            <button type="button" id="visible-meridians-none" title="取消全部勾選">全不選</button>
          </div>
        </div>
        <p class="visible-meridians-help">可複選；只影響畫布顯示，不影響左方編輯經脈。</p>
        <div id="visible-meridians" class="visible-meridians" role="group" aria-label="顯示經脈與穴位"></div>
      </div>
    </div>
    <div id="objects" class="objects"></div>
    <section class="style-panel">
      <div class="panel-heading"><span>樣式設定</span></div>
      <form id="style-settings" class="style-settings">
        <label class="doc-style-field">穴位顏色<select name="markerColor"></select></label>
        <div class="meridian-color-legend" aria-label="經脈顏色全域設定">
          <span class="meridian-color-legend-title">經脈／穴位尺寸（固定）</span>
          <ul>
            <li><i style="background:#3b82f6"></i>任督二脈 · 藍 · 線寬 3px</li>
            <li><i style="background:#22c55e"></i>陰經 · 綠 · 線寬 3px</li>
            <li><i style="background:#ef4444"></i>陽經 · 紅 · 線寬 3px</li>
            <li><i style="background:#111111"></i>陽經穴位 · 黑 · 直徑 10px</li>
          </ul>
        </div>
        <label>模型表面<select name="surfaceFinish">
          <option value="skin" selected>皮膚色</option>
          <option value="original">原材質（白瓷）</option>
        </select></label>
        <div class="skin-fit-field" aria-label="貼皮渲染設定">
          <span class="dual-field-label">貼皮渲染（不寫入 JSON）</span>
          <label class="dual-field">
            <span class="dual-field-label">經脈線寬（mm）</span>
            <div class="dual-controls">
              <input name="ribbonWidth" type="range" min="${MIN_RIBBON_WIDTH_MM}" max="${MAX_RIBBON_WIDTH_MM}" step="0.1" value="${DEFAULT_RIBBON_WIDTH_MM}">
              <input name="ribbonWidthInput" type="number" min="${MIN_RIBBON_WIDTH_MM}" max="${MAX_RIBBON_WIDTH_MM}" step="0.1" value="${DEFAULT_RIBBON_WIDTH_MM}" inputmode="decimal" title="經脈墨線實際寬度">
            </div>
          </label>
          <label class="dual-field">
            <span class="dual-field-label">穴位直徑（mm）</span>
            <div class="dual-controls">
              <input name="markerDiameter" type="range" min="${MIN_MARKER_DIAMETER_MM}" max="${MAX_MARKER_DIAMETER_MM}" step="0.5" value="${DEFAULT_MARKER_DIAMETER_MM}">
              <input name="markerDiameterInput" type="number" min="${MIN_MARKER_DIAMETER_MM}" max="${MAX_MARKER_DIAMETER_MM}" step="0.5" value="${DEFAULT_MARKER_DIAMETER_MM}" inputmode="decimal" title="貼皮圓點實際直徑">
            </div>
          </label>
          <label class="dual-field">
            <span class="dual-field-label">離皮位移（mm）</span>
            <div class="dual-controls">
              <input name="skinLift" type="range" min="0" max="${MAX_SKIN_LIFT_MM}" step="0.1" value="${DEFAULT_SKIN_LIFT_MM}">
              <input name="skinLiftInput" type="number" min="0" max="${MAX_SKIN_LIFT_MM}" step="0.1" value="${DEFAULT_SKIN_LIFT_MM}" inputmode="decimal" title="0 為完全貼皮；調高可與舊版浮起效果比對">
            </div>
          </label>
          <label class="checkbox-row"><span>編輯透視（穴位與定位點不被皮膚遮住）</span><input name="xrayEdit" type="checkbox"></label>
        </div>
        <label class="checkbox-row"><span>顯示格線</span><input name="gridEnabled" type="checkbox" checked></label>
        <label class="grid-spacing-field dual-field">
          <span class="dual-field-label">格線間距（px）</span>
          <div class="dual-controls">
            <input name="gridSpacing" type="range" min="5" max="200" value="20">
            <input name="gridSpacingInput" type="number" min="5" max="200" step="1" value="20" inputmode="numeric" title="可直接輸入 5–200">
          </div>
        </label>
        <label class="grid-rotation-field dual-field">
          <span class="dual-field-label">格線旋轉（度）</span>
          <div class="dual-controls">
            <input name="gridRotation" type="range" min="-90" max="90" step="1" value="0">
            <input name="gridRotationInput" type="number" min="-90" max="90" step="1" value="0" inputmode="numeric" title="可直接輸入 -90–90">
          </div>
        </label>
        <label class="dual-field model-zoom-field">
          <span class="dual-field-label">模型放大 <b id="zoom-factor-label">1.00×</b></span>
          <div class="dual-controls">
            <input name="modelZoom" type="range" min="0.25" max="20" step="0.01" value="1">
            <input name="modelZoomInput" type="number" min="0.25" max="20" step="0.01" value="1" inputmode="decimal" title="可直接輸入放大倍數">
          </div>
        </label>
        <p class="form-help">經脈與穴位貼合皮膚繪製：線寬與圓點以實際毫米計，離皮位移預設 0，旋轉縮放都不會浮起。經脈顏色：任督藍、陰經綠、陽經紅；陽經穴位固定為黑，其餘穴位可改顏色。檢視模式為唯讀。貼皮渲染與格線只影響畫面，不寫入 JSON。</p>
      </form>
    </section>
  </aside>
</main>
<footer><span id="model-status">正在載入人體模型…</span><span id="status">就緒</span><span>WebGL · 本機資料</span></footer>
<div id="toast" role="status"></div>`

const viewport = $('#viewport')
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x14161b)
const perspectiveCamera = new THREE.PerspectiveCamera(45, 1, 0.01, 2000)
perspectiveCamera.position.set(2.5, 1.8, 3.2)
const orthographicCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 2000)
let camera = perspectiveCamera

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false })
renderer.setPixelRatio(clampPixelRatio(devicePixelRatio, false))
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 0.88
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.shadowMap.autoUpdate = false
renderer.shadowMap.needsUpdate = true
viewport.append(renderer.domElement)

const labelRenderer = new CSS2DRenderer()
labelRenderer.domElement.className = 'label-layer'
viewport.append(labelRenderer.domElement)
const viewportGrid = $('#viewport-grid')
if (viewportGrid) viewport.append(viewportGrid)

const pmrem = new THREE.PMREMGenerator(renderer)
// Keep a weak IBL only for specular accents; diffuse fill comes from key/rim lights.
const roomEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
scene.environment = roomEnv
scene.environmentIntensity = 0.18

const hemiLight = new THREE.HemisphereLight(0xf2f0ea, 0x0d0f14, 0.04)
scene.add(hemiLight)
const keyLight = new THREE.DirectionalLight(0xffffff, 3.2)
keyLight.position.set(2.4, 6.2, 1.6)
keyLight.castShadow = true
keyLight.shadow.mapSize.set(2048, 2048)
keyLight.shadow.bias = -0.00035
keyLight.shadow.normalBias = 0.02
scene.add(keyLight)
const fillLight = new THREE.DirectionalLight(0x7f93b0, 0.03)
fillLight.position.set(-5.2, 1.2, -3.0)
scene.add(fillLight)
const rimLight = new THREE.DirectionalLight(0xffd2a8, 0.85)
rimLight.position.set(-1.8, 3.8, -5.5)
scene.add(rimLight)

const pedestal = new THREE.Group()
scene.add(pedestal)
const shadowPlane = new THREE.Mesh(
  new THREE.CircleGeometry(1, 64),
  new THREE.ShadowMaterial({ opacity: 0.28 }),
)
shadowPlane.rotation.x = -Math.PI / 2
shadowPlane.receiveShadow = true
pedestal.add(shadowPlane)
const polarGrid = new THREE.PolarGridHelper(1, 16, 6, 64, 0x3a3f4a, 0x262a32)
polarGrid.material.transparent = true
polarGrid.material.opacity = 0.55
pedestal.add(polarGrid)
const accentRing = new THREE.Mesh(
  new THREE.RingGeometry(0.995, 1.0, 96),
  new THREE.MeshBasicMaterial({ color: 0xe8a857, transparent: true, opacity: 0.45, side: THREE.DoubleSide }),
)
accentRing.rotation.x = -Math.PI / 2
pedestal.add(accentRing)
pedestal.visible = false

const controls = new OrbitControls(perspectiveCamera, renderer.domElement)
controls.target.set(0, 1.0, 0)
controls.enableDamping = true
controls.dampingFactor = 0.08
controls.rotateSpeed = 0.85
controls.zoomSpeed = 0.9
controls.panSpeed = 0.7
controls.screenSpacePanning = true
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }
controls.mouseButtons = {
  LEFT: THREE.MOUSE.ROTATE,
  MIDDLE: THREE.MOUSE.DOLLY,
  RIGHT: THREE.MOUSE.PAN,
}
controls.minDistance = 0.05
controls.maxDistance = 500

let orbitPointerDown = false
let orbitFastView = false
let lastOrbitChangeAt = 0
let idleSkinMaterial = null
let orbitSkinMaterial = null

const modelGroup = new THREE.Group()
const annotationGroup = new THREE.Group()
scene.add(modelGroup, annotationGroup)
let initialCamPos = perspectiveCamera.position.clone()
let initialTarget = controls.target.clone()

let modelMeshes = []
let surfaceGraph = null
const geodesicCache = new Map()
const restPathCache = new Map()
let shortArcCache = null
let markerVisuals = []
let routeVisuals = []
let handleVisuals = []
let midpointVisuals = []
let bodyFront = new THREE.Vector3(0, 0, 1)
let activeBody = 'male'
let bodyLoadSeq = 0
let wantedBody = 'male'
let loadingBody = null
let state = emptyDocument('male')
const documentsByBody = {
  male: structuredClone(state),
  female: emptyDocument('female'),
}
const history = new History(state)
let selected = null
let selectedCatalog = pointsForMeridian('LU')[0]
/** @type {'view' | 'edit'} */
let appMode = 'edit'
let pointerDown = null
let dragging = null
let dragMoved = false
let dragBaseline = null
let orbitLocked = false
/** User pinned lock via the toolbar button; survives curve-handle release. */
let orbitLockSticky = false
const lockedViewOffset = new THREE.Vector3()
const lockedViewUp = new THREE.Vector3(0, 1, 0)
let hasLockedView = false
let lockedPerspectiveDistance = 0
let lockedOrthoHalfHeight = 1
let lockedZoomFactor = 1
const FIXED_MARKER_SIZE = 10
const FIXED_LINE_WIDTH = 3
/**
 * Skin-conformal render settings (方案 A). These describe how the annotation
 * is drawn, never where it sits: they are not part of the document and are
 * never exported.
 */
let skinLiftMm = DEFAULT_SKIN_LIFT_MM
let ribbonWidthMm = DEFAULT_RIBBON_WIDTH_MM
let markerDiameterMm = DEFAULT_MARKER_DIAMETER_MM
let xrayEdit = false
/** Framed model height, so the millimetre settings mean the same on any GLB. */
let bodyHeightWorld = 0
const framedHeightByBody = { male: 0, female: 0 }

/** Male-authored world lengths × this = current body (female GLB is ~200× taller). */
function statureScale() {
  const height = Number(bodyHeightWorld)
  if (!(height > 0)) return 1
  return height / REFERENCE_BODY_HEIGHT_M
}

function statureWorld(maleWorld) {
  return Number(maleWorld) * statureScale()
}
const skinDecalMaterials = new Set()
const conformCache = new Map()
const discCache = new Map()
const visibleMeridianIds = new Set()
const linkedMeridianIds = new Set()
const storageKeyForBody = (body) => `meridian-studio-document-v2-${inferBodyModel({ body })}`
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
const BODY_MODEL_HREFS = {
  male: new URL('../models/male_character.glb', import.meta.url).href,
  female: new URL('../models/female-character.glb', import.meta.url).href,
}
const bodyModelHref = (bodyId) => BODY_MODEL_HREFS[resolveStudioBodyId(bodyId)]
const yieldToMain = () => new Promise((resolve) => {
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => requestAnimationFrame(resolve))
  } else {
    setTimeout(resolve, 0)
  }
})
const createModelLoader = () => {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
  const draco = new DRACOLoader()
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/')
  loader.setDRACOLoader(draco)
  return { loader, draco }
}

async function loadStudioGltf(url, onProgress) {
  const { loader, draco } = createModelLoader()
  try {
    return await loader.loadAsync(url, onProgress)
  } finally {
    draco.dispose?.()
  }
}

const sideLabel = (side) => ({ left: '左側', right: '右側', midline: '中線' })[side] || side
const shortSide = (side) => ({ left: 'L', right: 'R', midline: 'M' })[side] || ''
const escapeHtml = (value) => {
  const div = document.createElement('div')
  div.textContent = value
  return div.innerHTML
}

function setStatus(message) { $('#status').textContent = message }

function setModelLoadingUi(message) {
  const overlay = $('#model-loading')
  const text = $('#model-loading-text')
  if (text) text.textContent = message
  if (overlay) overlay.hidden = false
  const status = $('#model-status')
  if (status) status.textContent = message
}

function clearModelLoadingUi() {
  const overlay = $('#model-loading')
  if (overlay) overlay.hidden = true
}
let toastTimer
function toast(message, kind = 'ok') {
  const element = $('#toast')
  element.textContent = message
  element.className = `show ${kind}`
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { element.className = '' }, 3600)
}

function persistState() {
  try {
    const body = inferBodyModel(state.model)
    const cloned = cloneStudioDocument(state)
    if (cloned) documentsByBody[body] = cloned
    // Session draft only — startup never auto-restores acupoint JSON.
    localStorage.setItem(storageKeyForBody(body), JSON.stringify(state))
  } catch {
    /* ignore quota / private mode */
  }
}

function syncBodyModelSelect() {
  const select = $('#body-model-filter')
  if (select) select.value = activeBody
}

function syncControlsEnabled() {
  if (dragging) {
    controls.enabled = false
    return
  }
  controls.enabled = true
  controls.enableRotate = !orbitLocked
  controls.enablePan = true
  // While rotation is locked, one-finger touch must not orbit the camera.
  controls.touches = orbitLocked
    ? { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN }
    : { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }
}

function selectedSegmentReady() {
  return appMode === 'edit'
    && selected?.type === 'meridian'
    && Boolean(selected.fromPointId)
    && Boolean(selected.toPointId)
}

function syncRedrawButton() {
  const enabled = selectedSegmentReady()
    && !isRenDuMeridian(state.meridians.find((item) => item.id === selected.id)?.meridianId)
  ;['redraw-segment', 'add-locator', 'remove-locator'].forEach((id) => {
    const button = $(`#${id}`)
    if (button) button.disabled = !enabled
  })
}

function syncMeridianDragButtons() {
  syncRedrawButton()
}

function syncOrbitLockButton() {
  const button = $('#lock-orbit')
  if (!button) return
  button.classList.toggle('active', orbitLocked)
  button.setAttribute('aria-pressed', orbitLocked ? 'true' : 'false')
  button.title = orbitLocked
    ? '解除鎖定：恢復旋轉模型'
    : '鎖定旋轉：可上下左右平移，視角朝向不變，仍可編輯'
}

function captureLockedView() {
  lockedViewOffset.copy(camera.position).sub(controls.target)
  if (lockedViewOffset.lengthSq() < 1e-10) lockedViewOffset.set(0, 0.2, 1)
  lockedViewUp.copy(camera.up).normalize()
  hasLockedView = true
}

function clearLockedView() {
  hasLockedView = false
}

function syncOrthographicFrustum(halfHeight = lockedOrthoHalfHeight) {
  const width = Math.max(viewport.clientWidth, 1)
  const height = Math.max(viewport.clientHeight, 1)
  const aspect = width / height
  const safeHeight = Math.max(halfHeight, 1e-4)
  orthographicCamera.left = -safeHeight * aspect
  orthographicCamera.right = safeHeight * aspect
  orthographicCamera.top = safeHeight
  orthographicCamera.bottom = -safeHeight
  orthographicCamera.near = perspectiveCamera.near
  orthographicCamera.far = perspectiveCamera.far
  orthographicCamera.updateProjectionMatrix()
}

function fitOrthographicToPerspective() {
  const distance = Math.max(perspectiveCamera.position.distanceTo(controls.target), 0.05)
  lockedPerspectiveDistance = distance
  lockedZoomFactor = referenceZoomDistance > 0 ? referenceZoomDistance / distance : 1
  lockedOrthoHalfHeight = Math.tan(THREE.MathUtils.degToRad(perspectiveCamera.fov) / 2) * distance
  orthographicCamera.position.copy(perspectiveCamera.position)
  orthographicCamera.quaternion.copy(perspectiveCamera.quaternion)
  orthographicCamera.up.copy(perspectiveCamera.up)
  orthographicCamera.zoom = 1
  syncOrthographicFrustum(lockedOrthoHalfHeight)
}

function restorePerspectiveFromOrthographic() {
  const target = controls.target.clone()
  const direction = orthographicCamera.position.clone().sub(target)
  if (direction.lengthSq() < 1e-10) direction.copy(lockedViewOffset)
  const zoom = Math.max(orthographicCamera.zoom, 1e-4)
  const distance = Math.min(
    controls.maxDistance,
    Math.max(controls.minDistance, lockedPerspectiveDistance / zoom),
  )
  direction.setLength(distance)
  perspectiveCamera.position.copy(target).add(direction)
  perspectiveCamera.up.copy(orthographicCamera.up)
  perspectiveCamera.lookAt(target)
  perspectiveCamera.updateProjectionMatrix()
}

function setActiveCamera(nextCamera) {
  camera = nextCamera
  controls.object = nextCamera
  controls.update()
}

function enforceLockedView() {
  if (!orbitLocked || !hasLockedView) return
  const distance = Math.max(camera.position.distanceTo(controls.target), 0.05)
  const direction = lockedViewOffset.clone().normalize()
  camera.position.copy(controls.target).addScaledVector(direction, distance)
  camera.up.copy(lockedViewUp)
  camera.lookAt(controls.target)
}

function pixelSizeToWorld(pixelSize, distanceForPerspective = 1) {
  const viewportHeight = Math.max(viewport.clientHeight, 1)
  const pixels = Number(pixelSize) || 1
  if (camera.isOrthographicCamera) {
    const viewHeight = (camera.top - camera.bottom) / Math.max(camera.zoom, 1e-6)
    return Math.max(0.004, pixels * viewHeight / viewportHeight)
  }
  const fov = THREE.MathUtils.degToRad(camera.fov || 45)
  const distance = Math.max(Number(distanceForPerspective) || 0.01, 0.01)
  return Math.max(0.004, 2 * distance * Math.tan(fov / 2) * pixels / viewportHeight)
}

function detachOrbitLock({ restorePerspective = true } = {}) {
  if (restorePerspective && camera.isOrthographicCamera) {
    restorePerspectiveFromOrthographic()
  }
  orbitLocked = false
  orbitLockSticky = false
  clearLockedView()
  setActiveCamera(perspectiveCamera)
  syncControlsEnabled()
  syncOrbitLockButton()
}

function setOrbitLocked(locked, { sticky = false } = {}) {
  const nextLocked = Boolean(locked)
  if (nextLocked === orbitLocked) {
    if (nextLocked && sticky) orbitLockSticky = true
    if (!nextLocked) orbitLockSticky = false
    syncControlsEnabled()
    syncOrbitLockButton()
    return
  }
  if (nextLocked) {
    orbitLocked = true
    if (sticky) orbitLockSticky = true
    // Perspective pan makes off-center anatomy look turned; switch to ortho so
    // left/right translation keeps the exact same facing.
    fitOrthographicToPerspective()
    setActiveCamera(orthographicCamera)
    captureLockedView()
    syncControlsEnabled()
    syncOrbitLockButton()
    syncZoomUI({ force: true })
    setStatus(sticky
      ? '旋轉已鎖定 · 可上下左右平移 · 視角朝向不變 · 仍可編輯'
      : '編輯曲度中 · 旋轉暫時鎖定')
    return
  }

  detachOrbitLock({ restorePerspective: true })
  syncZoomUI({ force: true })
  setStatus('模型旋轉已解除鎖定')
}

function meridiansWithPlacedData() {
  const ids = new Set([
    ...state.acupoints.map((point) => point.meridianId),
    ...state.meridians.map((route) => route.meridianId),
  ])
  return MERIDIANS.filter((item) => ids.has(item.id))
}

function pruneVisibleMeridianIds() {
  const available = new Set(meridiansWithPlacedData().map((item) => item.id))
  for (const id of [...visibleMeridianIds]) {
    if (!available.has(id)) visibleMeridianIds.delete(id)
  }
}

function ensureVisibleMeridian(meridianId, { exclusive = false } = {}) {
  if (!meridianId) return
  if (exclusive) visibleMeridianIds.clear()
  visibleMeridianIds.add(meridianId)
}

function syncVisibleMeridiansFromDocument({ selectAll = false } = {}) {
  const available = meridiansWithPlacedData().map((item) => item.id)
  if (selectAll || visibleMeridianIds.size === 0) {
    visibleMeridianIds.clear()
    available.forEach((id) => visibleMeridianIds.add(id))
    return
  }
  pruneVisibleMeridianIds()
}

function visibleMeridianIdList() {
  return MERIDIANS
    .map((item) => item.id)
    .filter((id) => visibleMeridianIds.has(id))
}

function renderVisibleMeridianList() {
  const root = $('#visible-meridians')
  if (!root) return
  pruneVisibleMeridianIds()
  const items = meridiansWithPlacedData()
  if (!items.length) {
    root.innerHTML = '<p class="empty">尚無已定位經脈；於左方加入穴位後會顯示於此</p>'
    return
  }
  root.innerHTML = items.map((item) => {
    const placed = state.acupoints.filter((point) => point.meridianId === item.id).length
    const routeCount = state.meridians.filter((route) => route.meridianId === item.id).length
    const checked = visibleMeridianIds.has(item.id) ? 'checked' : ''
    const meta = routeCount ? `${placed} 穴 · ${routeCount} 線` : `${placed} 穴`
    return `<label class="visible-meridian-row">
      <input type="checkbox" data-meridian-id="${item.id}" ${checked}>
      <span><b>${escapeHtml(item.name)}</b><small>${item.id} · ${meta}</small></span>
    </label>`
  }).join('')
}

function updateDeleteButton() {
  const button = $('#delete-selection')
  if (!button) return
  const canDelete = appMode === 'edit' && Boolean(selected)
  button.disabled = !canDelete
  if (appMode !== 'edit') {
    button.title = '檢視模式為唯讀，請切換編輯後再刪除'
    return
  }
  if (!selected) {
    button.title = '先選取穴位或經脈路線後再刪除'
    return
  }
  button.title = selected.type === 'acupoint'
    ? '刪除選取的穴位（左右配對會一併移除）'
    : '刪除選取的經脈路線'
}

function buildMeridianRoutesFromPlaced(meridian, placedPoints, {
  previousRoutes = [],
  width = FIXED_LINE_WIDTH,
} = {}) {
  const required = pointsForMeridian(meridian.id)
  const pairId = meridian.bilateral
    ? (previousRoutes.find((route) => route.pairId)?.pairId || makeId())
    : null
  const sides = meridian.bilateral ? ['left', 'right'] : ['midline']
  const color = meridianLineColor(meridian.id)
  const routes = []
  for (const side of sides) {
    const previous = previousRoutes.find((route) => route.side === side)
    const anchors = buildRouteNodesFromPlaced(required, placedPoints, side)
    const nodes = mergeControlsIntoRoute(previous?.nodes || [], anchors)
    if (!routeHasDrawableAcupoints(nodes)) continue
    routes.push({
      id: previous?.id || makeId(),
      pairId: meridian.bilateral ? pairId : null,
      meridianId: meridian.id,
      name: meridian.name,
      color,
      width: FIXED_LINE_WIDTH,
      side,
      nodes,
    })
  }
  return routes
}

function syncMeridianRoutes(meridians, meridian, placedPoints, { allowCreate = false } = {}) {
  const existing = meridians.filter((route) => route.meridianId === meridian.id)
  if (!existing.length && !allowCreate) return meridians

  const nextForMeridian = buildMeridianRoutesFromPlaced(meridian, placedPoints, {
    previousRoutes: existing,
  })
  const unchanged = existing.length === nextForMeridian.length
    && nextForMeridian.every((route) => {
      const previous = existing.find((item) => item.id === route.id)
      return previous
        && previous.color === route.color
        && previous.width === route.width
        && JSON.stringify(previous.nodes) === JSON.stringify(route.nodes)
    })
  if (unchanged) return meridians
  return [
    ...meridians.filter((route) => route.meridianId !== meridian.id),
    ...nextForMeridian,
  ]
}

function normalizeMeridianColors(meridians = state.meridians) {
  let changed = false
  const next = meridians.map((route) => {
    const color = meridianLineColor(route.meridianId)
    if (route.color === color) return route
    changed = true
    return { ...route, color }
  })
  return changed ? next : meridians
}

function applyGlobalMeridianColors({ commitHistory = false } = {}) {
  const meridians = normalizeMeridianColors(state.meridians)
  if (meridians === state.meridians) return false
  if (commitHistory) {
    commit({ ...state, meridians }, '經脈顏色已套用全域設定')
  } else {
    state = { ...state, meridians }
    persistState()
  }
  return true
}

function commit(nextState, message) {
  state = history.commit(nextState)
  persistState()
  rebuildAnnotations()
  updateUI()
  setStatus(message)
}

function replaceWithoutHistory(nextState) {
  state = structuredClone(nextState)
  rebuildAnnotations()
  updateUI()
}

function previewAcupointDrag(pointId, hit) {
  state = updatePairedPoint(pointId, hit)
  const point = getPoint(pointId)
  const ids = new Set([pointId])
  if (point?.pairId) {
    state.acupoints.forEach((item) => {
      if (item.pairId === point.pairId) ids.add(item.id)
    })
  }
  markerVisuals.forEach((entry) => {
    if (!ids.has(entry.point.id)) return
    const current = getPoint(entry.point.id)
    if (!current) return
    entry.point = current
    const anchor = new THREE.Vector3(...resolvedNode(current).position)
    entry.mesh.position.copy(anchor)
    if (entry.label) entry.label.position.copy(anchor)
  })
}

function capturePointer(event) {
  try {
    renderer.domElement.setPointerCapture(event.pointerId)
  } catch {
    /* pointer may already be captured */
  }
}

function getPoint(id) {
  return state.acupoints.find((point) => point.id === id)
}

function resolvedNode(node) {
  if (node.type === 'acupoint' && node.pointId) {
    const point = getPoint(node.pointId)
    if (point) return { position: point.position, normal: point.normal }
  }
  return node
}

function offsetPosition(node, amount = 0.008) {
  const resolved = resolvedNode(node)
  return new THREE.Vector3(...resolved.position)
    .addScaledVector(new THREE.Vector3(...resolved.normal), amount)
}

/** Place names outward from the Ren (mid-sagittal) line; Ren/Du stay on the right. */
function labelPlacementClass(point) {
  // 任督二脈／中線穴位：名稱固定在穴位右側（依附圖不變）
  if (point?.side === 'midline' || point?.meridianId === 'CV' || point?.meridianId === 'GV') {
    return 'label-right'
  }

  // 以實際位置相對任脈中線（x=0）決定：任脈左側→名稱靠左，右側→靠右
  const x = Number(point?.position?.[0]) || 0
  if (x < 0) return 'label-left'
  if (x > 0) return 'label-right'

  // 恰在中線附近時，退回宣告側別；仍預設靠右
  if (point?.side === 'left') return 'label-left'
  return 'label-right'
}

function applyLabelPlacement(labelElement, point) {
  if (!labelElement) return
  const placement = labelPlacementClass(point)
  labelElement.classList.toggle('label-left', placement === 'label-left')
  labelElement.classList.toggle('label-right', placement === 'label-right')
}

function refreshBodyFrontAxis() {
  if (!modelMeshes.length) return
  const box = new THREE.Box3().setFromObject(modelGroup)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  // Depth = thinner horizontal axis (front↔back). Width = shoulders (left↔right).
  // Ear tips are wide on X and must not be treated as "front".
  const depthIsZ = size.z <= size.x
  const faceMinY = box.min.y + size.y * 0.72
  const band = (depthIsZ ? size.x : size.z) * 0.12

  // Built-in male/female assets both face +Z after framing, but come from
  // different exporters. Prefer the authored axis when the loaded file matches.
  const preset = BODY_MODELS[activeBody]
  const loadedName = String(state.model?.name || '').toLowerCase()
  const presetStem = String(preset?.fileName || '').replace(/\.glb$/i, '').toLowerCase()
  if (preset?.frontAxis && presetStem && loadedName.includes(presetStem)) {
    bodyFront.set(preset.frontAxis[0], preset.frontAxis[1], preset.frontAxis[2])
    return
  }

  let maxAlong = -Infinity
  let minAlong = Infinity
  let maxY = -Infinity
  let minY = -Infinity
  let normalPos = 0
  let normalNeg = 0
  const world = new THREE.Vector3()
  const worldNormal = new THREE.Vector3()
  const normalMatrix = new THREE.Matrix3()
  modelMeshes.forEach((mesh) => {
    const attribute = mesh.geometry?.attributes?.position
    if (!attribute) return
    mesh.updateWorldMatrix(true, false)
    const normals = mesh.geometry?.attributes?.normal
    if (normals) normalMatrix.getNormalMatrix(mesh.matrixWorld)
    const step = Math.max(1, Math.floor(attribute.count / 10000))
    for (let index = 0; index < attribute.count; index += step) {
      world.fromBufferAttribute(attribute, index).applyMatrix4(mesh.matrixWorld)
      if (world.y < faceMinY) continue
      const width = depthIsZ ? (world.x - center.x) : (world.z - center.z)
      if (Math.abs(width) > band) continue
      const along = depthIsZ ? (world.z - center.z) : (world.x - center.x)
      if (along > maxAlong) {
        maxAlong = along
        maxY = world.y
      }
      if (along < minAlong) {
        minAlong = along
        minY = world.y
      }
      if (normals) {
        worldNormal.fromBufferAttribute(normals, index).applyMatrix3(normalMatrix).normalize()
        const alongNormal = depthIsZ ? worldNormal.z : worldNormal.x
        if (alongNormal > 0.35) normalPos += 1
        else if (alongNormal < -0.35) normalNeg += 1
      }
    }
  })

  const fromNormals = inferBodyFrontFromNormalVote(
    { x: size.x, z: size.z },
    { pos: normalPos, neg: normalNeg },
  )
  if (fromNormals) {
    bodyFront.set(fromNormals[0], fromNormals[1], fromNormals[2])
    return
  }

  if (Number.isFinite(maxAlong) && Number.isFinite(minAlong)) {
    const front = inferBodyFrontFromBounds(
      { x: size.x, z: size.z },
      { maxAlong, minAlong, maxY, minY },
    )
    bodyFront.set(front[0], front[1], front[2])
    return
  }

  // Fallback for empty meshes: thinner axis, positive +Z / +X (matches built-ins).
  if (depthIsZ) bodyFront.set(0, 0, 1)
  else bodyFront.set(1, 0, 0)
}

function faceBodySide(side) {
  if (!modelMeshes.length) return toast('請先載入人體模型', 'warn')
  if (orbitLocked) setOrbitLocked(false)
  refreshBodyFrontAxis()

  const box = new THREE.Box3().setFromObject(modelGroup)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const target = [
    center.x,
    box.min.y + size.y * 0.45,
    center.z,
  ]
  const currentDistance = camera.position.distanceTo(controls.target)
  const fallbackDistance = Math.max(size.x, size.y, size.z) * 2.2
  const distance = Number.isFinite(currentDistance) && currentDistance > 0.05
    ? currentDistance
    : fallbackDistance
  // Camera sits on anatomical front to view the face; opposite axis for the back.
  const viewAxis = side === 'back'
    ? bodyFront.clone().negate()
    : bodyFront.clone()
  const pose = cameraPoseFacingAxis(target, toArray(viewAxis), distance)

  controls.target.set(...pose.target)
  camera.position.set(...pose.position)
  camera.up.set(...pose.up)
  camera.lookAt(controls.target)
  controls.update()
  syncZoomUI({ force: true })
  if (side === 'back') {
    setStatus('已將身體背面朝向螢幕')
    toast('背面已對準 · 可定位督脈')
  } else {
    setStatus('已將身體正面朝向螢幕')
    toast('正面已對準 · 可定位任脈')
  }
}

function screenPointer(event) {
  const rect = renderer.domElement.getBoundingClientRect()
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(pointer, camera)
}

function surfaceHit(event) {
  return surfaceHits(event)[0] || null
}

function mapRaySkinHit(hit, outward = null) {
  const normal = hit.face.normal.clone()
    .applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld))
    .normalize()
  if (outward && outward.lengthSq() > 1e-10 && normal.dot(outward) < 0) normal.negate()
  return { position: toArray(hit.point), normal: toArray(normal), distance: hit.distance }
}

function surfaceHits(event) {
  screenPointer(event)
  const toCamera = new THREE.Vector3()
  return raycaster.intersectObjects(modelMeshes, false)
    .filter((hit) => hit?.face)
    .map((hit) => {
      toCamera.copy(camera.position).sub(hit.point)
      return mapRaySkinHit(hit, toCamera)
    })
}

function raySkinHits(origin, direction, maxDistance, outward = null) {
  if (!modelMeshes.length) return []
  const dir = direction.clone()
  if (dir.lengthSq() < 1e-10) return []
  dir.normalize()
  const guide = outward?.lengthSq() > 1e-10 ? outward : dir.clone().negate()
  const caster = new THREE.Raycaster(origin, dir, 0, maxDistance)
  return caster.intersectObjects(modelMeshes, false)
    .filter((hit) => hit?.face)
    .map((hit) => mapRaySkinHit(hit, guide))
}

function annotationHit(event, types) {
  screenPointer(event)
  const objects = [
    ...markerVisuals.map((entry) => entry.mesh),
    ...handleVisuals.map((entry) => entry.mesh),
    ...midpointVisuals.map((entry) => entry.mesh),
    ...routeVisuals.map((entry) => entry.line),
  ]
  return raycaster.intersectObjects(objects, false)
    .find((hit) => types.includes(hit.object.userData.type))
}

function projectHandleToScreen(mesh) {
  const ndc = mesh.position.clone().project(camera)
  if (!Number.isFinite(ndc.x) || ndc.z < -1 || ndc.z > 1) return null
  const rect = renderer.domElement.getBoundingClientRect()
  return {
    x: rect.left + (ndc.x + 1) * 0.5 * rect.width,
    y: rect.top + (-ndc.y + 1) * 0.5 * rect.height,
  }
}

function screenDistanceToHit(event, hit) {
  if (!hit?.object) return Infinity
  const screen = projectHandleToScreen(hit.object)
  if (!screen) return Infinity
  return Math.hypot(screen.x - event.clientX, screen.y - event.clientY)
}

/** Prefer the visible acupoint marker, even when a meridian line is closer in 3D. */
function nearestAcupointMarkerHit(event) {
  const exact = annotationHit(event, ['acupoint'])
  if (exact) return exact
  const screens = []
  const meshes = []
  markerVisuals.forEach(({ mesh }) => {
    if (!mesh.visible || mesh.userData?.type !== 'acupoint') return
    const screen = projectHandleToScreen(mesh)
    if (!screen) return
    screens.push(screen)
    meshes.push(mesh)
  })
  const index = nearestScreenIndex(
    screens,
    { x: event.clientX, y: event.clientY },
    HANDLE_PICK_RADIUS_PX,
  )
  if (index < 0) return null
  return { object: meshes[index], point: meshes[index].position.clone() }
}

/** Prefer the visible black handle, even when the meridian line is closer in 3D. */
function nearestHandleHit(event) {
  const exact = annotationHit(event, ['route-handle'])
  if (exact) return exact
  const screens = []
  const meshes = []
  handleVisuals.forEach(({ mesh }) => {
    if (!mesh.visible) return
    const screen = projectHandleToScreen(mesh)
    if (!screen) return
    screens.push(screen)
    meshes.push(mesh)
  })
  const index = nearestScreenIndex(
    screens,
    { x: event.clientX, y: event.clientY },
    HANDLE_PICK_RADIUS_PX,
  )
  if (index < 0) return null
  return { object: meshes[index], point: meshes[index].position.clone() }
}

function cameraPlanePoint(event, anchor) {
  screenPointer(event)
  const towardCamera = camera.position.clone().sub(anchor)
  if (towardCamera.lengthSq() < 1e-10) return null
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(towardCamera.normalize(), anchor)
  const target = new THREE.Vector3()
  return raycaster.ray.intersectPlane(plane, target) ? target : null
}

function pairSideX(fromNode, toNode) {
  const a = resolvedNode(fromNode).position?.[0]
  const b = resolvedNode(toNode).position?.[0]
  if (!Number.isFinite(a) && !Number.isFinite(b)) return null
  return ((Number.isFinite(a) ? a : 0) + (Number.isFinite(b) ? b : 0)) / 2
}

function restSideX(rest = []) {
  if (!rest.length) return null
  const sum = rest.reduce((total, point) => total + (Number(point?.[0]) || 0), 0)
  return sum / rest.length
}

/**
 * Snap a 3D probe onto the nearest mesh triangle, preferring the same
 * sagittal side so head locators do not jump to the far skull.
 */
function closestSkinHit(position, {
  maxDistance = HANDLE_SKIN_SNAP_RADIUS,
  sideX = null,
  guideNormal = null,
  preferPosterior = false,
} = {}) {
  if (!modelMeshes.length || !position) return null
  const target = new THREE.Vector3(...position)
  const sameSide = []
  const any = []
  for (const mesh of modelMeshes) {
    const bvh = mesh.geometry?.boundsTree
    if (!bvh) continue
    const local = mesh.worldToLocal(target.clone())
    const info = bvh.closestPointToPoint(local, { point: new THREE.Vector3() }, 0, maxDistance)
    if (!info?.point) continue
    const worldPoint = mesh.localToWorld(info.point.clone())
    const distance = worldPoint.distanceTo(target)
    if (distance > maxDistance) continue
    let hitNormal = new THREE.Vector3(0, 1, 0)
    const fromQuery = worldPoint.clone().sub(target)
    if (fromQuery.lengthSq() > 1e-10) hitNormal.copy(fromQuery).normalize()
    if (Number.isInteger(info.faceIndex) && mesh.geometry?.getIndex()) {
      try {
        const tri = getTriangleHitPointInfo(info.point, mesh.geometry, info.faceIndex)
        if (tri?.face?.normal) {
          hitNormal.copy(tri.face.normal)
            .applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld))
            .normalize()
        }
      } catch {
        // Keep the query→surface estimate when the triangle lookup fails.
      }
    }
    if (guideNormal) {
      const guide = new THREE.Vector3(...guideNormal)
      if (guide.lengthSq() > 1e-10 && hitNormal.dot(guide) < 0) hitNormal.negate()
    }
    const hit = {
      position: toArray(worldPoint),
      normal: toArray(hitNormal),
      distance,
      mesh,
      faceIndex: info.faceIndex,
    }
    any.push(hit)
    if (sideX == null || Math.abs(sideX) <= 0.03 || hit.position[0] * sideX >= 0) {
      sameSide.push(hit)
    }
  }
  const pool = sameSide.length ? sameSide : any
  if (!pool.length) return null
  const chosen = preferPosterior
    ? (pool.filter((hit) => hit.position[2] <= 0.02).length
      ? pool.filter((hit) => hit.position[2] <= 0.02)
      : pool)
    : pool
  chosen.sort((a, b) => a.distance - b.distance)
  return chosen[0]
}

const frameScratch = {
  probe: new THREE.Vector3(),
  local: new THREE.Vector3(),
  world: new THREE.Vector3(),
  best: new THREE.Vector3(),
  normal: new THREE.Vector3(),
  corner: new THREE.Vector3(),
  guide: new THREE.Vector3(),
  inward: new THREE.Vector3(),
  hit: { point: new THREE.Vector3() },
  triangle: { face: { normal: new THREE.Vector3() }, barycoord: new THREE.Vector3() },
}
const normalMatrices = new Map()

function meshNormalMatrix(mesh) {
  let matrix = normalMatrices.get(mesh)
  if (!matrix) {
    matrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld)
    normalMatrices.set(mesh, matrix)
  }
  return matrix
}

/** Smooth (barycentric) surface normal at a closest-point hit. */
function smoothNormalAt(mesh, localPoint, faceIndex) {
  const geometry = mesh.geometry
  if (!geometry?.getIndex() || !Number.isInteger(faceIndex) || faceIndex < 0) return null
  let info = null
  try {
    info = getTriangleHitPointInfo(localPoint, geometry, faceIndex, frameScratch.triangle)
  } catch {
    return null
  }
  if (!info?.face) return null
  const normals = geometry.getAttribute('normal')
  const target = frameScratch.normal
  if (normals && info.barycoord) {
    target.set(0, 0, 0)
    const weights = [info.barycoord.x, info.barycoord.y, info.barycoord.z]
    const corners = [info.face.a, info.face.b, info.face.c]
    for (let index = 0; index < 3; index += 1) {
      frameScratch.corner.fromBufferAttribute(normals, corners[index])
      target.addScaledVector(frameScratch.corner, weights[index])
    }
    if (target.lengthSq() < 1e-12) target.copy(info.face.normal)
  } else {
    target.copy(info.face.normal)
  }
  return target.applyNormalMatrix(meshNormalMatrix(mesh)).normalize()
}

const normalCaster = new THREE.Raycaster()
normalCaster.firstHitOnly = true

/**
 * Drop a sample straight onto the skin along `guide`. Nearest-point snapping
 * would slide it sideways wherever a crease wall is closer than the skin
 * directly beneath, which wobbles the drawn line off the authored route; a
 * cast along the normal only moves it in and out.
 */
function surfaceFrameAlongNormal(point, guide, reach = 0.008) {
  const direction = frameScratch.guide.set(guide[0], guide[1], guide[2])
  if (direction.lengthSq() < 1e-10) return null
  direction.normalize()
  const origin = frameScratch.probe
    .set(point[0], point[1], point[2])
    .addScaledVector(direction, reach)
  normalCaster.set(origin, frameScratch.inward.copy(direction).negate())
  normalCaster.near = 0
  normalCaster.far = reach * 2
  const hit = normalCaster.intersectObjects(modelMeshes, false)[0]
  if (!hit?.face) return null
  const depth = hit.distance - reach
  if (Math.abs(depth) > reach) return null
  const local = frameScratch.local.copy(hit.point)
  hit.object.worldToLocal(local)
  const smooth = smoothNormalAt(hit.object, local, hit.faceIndex)
  const normal = smooth
    ? [smooth.x, smooth.y, smooth.z]
    : [direction.x, direction.y, direction.z]
  if (normal[0] * direction.x + normal[1] * direction.y + normal[2] * direction.z < 0) {
    normal[0] = -normal[0]
    normal[1] = -normal[1]
    normal[2] = -normal[2]
  }
  return {
    position: [hit.point.x, hit.point.y, hit.point.z],
    normal,
    distance: Math.abs(depth),
  }
}

/** Nearest point on the skin plus its smooth normal. */
function nearestSurfaceFrame(point, guideNormal = null, maxDistance = 0.02) {
  if (!modelMeshes.length || !point) return null
  const probe = frameScratch.probe.set(point[0], point[1], point[2])
  let bestMesh = null
  let bestFace = -1
  let bestDistance = Infinity
  for (const mesh of modelMeshes) {
    const bvh = mesh.geometry?.boundsTree
    if (!bvh) continue
    const local = frameScratch.local.copy(probe)
    mesh.worldToLocal(local)
    const box = mesh.geometry.boundingBox
    if (box && box.distanceToPoint(local) > maxDistance) continue
    const info = bvh.closestPointToPoint(local, frameScratch.hit, 0, maxDistance)
    if (!info?.point) continue
    const world = frameScratch.world.copy(info.point)
    mesh.localToWorld(world)
    const distance = world.distanceTo(probe)
    if (distance >= bestDistance) continue
    bestDistance = distance
    bestMesh = mesh
    bestFace = info.faceIndex
    frameScratch.best.copy(world)
  }
  if (!bestMesh) return null
  const local = frameScratch.local.copy(frameScratch.best)
  bestMesh.worldToLocal(local)
  const normal = smoothNormalAt(bestMesh, local, bestFace)
  const surface = normal
    ? [normal.x, normal.y, normal.z]
    : (guideNormal ? [...guideNormal] : [0, 1, 0])
  if (guideNormal) {
    const guide = frameScratch.guide.set(guideNormal[0], guideNormal[1], guideNormal[2])
    if (guide.lengthSq() > 1e-10
      && (surface[0] * guide.x + surface[1] * guide.y + surface[2] * guide.z) < 0) {
      surface[0] = -surface[0]
      surface[1] = -surface[1]
      surface[2] = -surface[2]
    }
  }
  return {
    position: [frameScratch.best.x, frameScratch.best.y, frameScratch.best.z],
    normal: surface,
    distance: bestDistance,
  }
}

/**
 * Skin frame for one annotation vertex: dropped along `guideNormal` when there
 * is one, else the nearest surface point. Every rendered vertex passes through
 * here, so a sample can never be left hanging in the air by an upstream
 * fallback.
 */
function surfaceFrameAt(point, guideNormal = null, maxDistance = 0.02) {
  if (!modelMeshes.length || !point) return null
  if (guideNormal) {
    const dropped = surfaceFrameAlongNormal(point, guideNormal, Math.max(maxDistance * 0.6, 0.012))
    if (dropped) return dropped
  }
  return nearestSurfaceFrame(point, guideNormal, maxDistance)
}

function projectHandleOnSkin(planePoint, guideNormal, radius, sideX = null) {
  return closestSkinHit(toArray(planePoint), {
    maxDistance: radius,
    sideX,
    guideNormal,
  })
    || projectNearSurface(toArray(planePoint), guideNormal, radius)
    || projectNearSurface(toArray(planePoint), guideNormal, radius * 1.6)
}

/** Move a locator on skin like an acupoint; stay on this limb. */
function handleSkinHit(event, drag) {
  const rest = drag.rest
  const anchor = drag.anchor
  if (!rest?.length || !anchor) return null
  const sideX = restSideX(rest)
  const route = state.meridians.find((item) => item.id === drag.routeId)
  const pair = route && acupointPairs(route).find((item) =>
    item.fromPointId === drag.fromPointId && item.toPointId === drag.toPointId)
  const fromNode = pair?.fromNode
  const toNode = pair?.toNode
  const from = fromNode ? resolvedNode(fromNode) : null
  const to = toNode ? resolvedNode(toNode) : null
  const skipLimbGap = Boolean(pair && pairKeepsOffPathLocators(
    routeNodeCode(fromNode),
    routeNodeCode(toNode),
  ))
  const gbPair = Boolean(pair && from && to && isGbShoulderAxillaSpan(
    routeNodeCode(fromNode),
    routeNodeCode(toNode),
    from.position,
    to.position,
  ))
  const scale = statureScale()
  const maxOffPath = statureWorld(HANDLE_STRETCH_MAX_OFF_PATH)
  const snapRadius = statureWorld(HANDLE_SKIN_SNAP_RADIUS)
  const projectRadius = gbPair
    ? Math.max(
      statureWorld(HANDLE_STRETCH_PROJECT_RADIUS * 1.6),
      gbPairSpan(from.position, to.position) * 0.45,
    )
    : statureWorld(Math.max(HANDLE_STRETCH_PROJECT_RADIUS, HANDLE_SKIN_SNAP_RADIUS * 0.7))
  const accept = (hit) => {
    if (!hit) return false
    if (!isProbeOnSameLimbSegment(rest, hit.position, maxOffPath, {
      skipLimbGap,
      worldScale: scale,
    })) return false
    if (gbPair && !isGbJianjingYuanyeHandleOk(hit.position, from.position, to.position)) return false
    return true
  }
  const pickAccepted = (hits, near = null) => {
    const ok = (hits || []).filter(accept)
    if (!ok.length) return null
    if (near) {
      ok.sort((left, right) => dist3(left.position, near) - dist3(right.position, near))
    }
    return ok[0]
  }
  if (gbPair) {
    // First legal hit along the camera ray. Skip the T-pose arm; do not
    // snap back to the old locator or the meridian cannot move right.
    const alongRay = pickAccepted(surfaceHits(event))
    if (alongRay) return alongRay
  } else {
    const direct = surfaceHit(event)
    if (accept(direct)) return direct
  }
  const planePoint = cameraPlanePoint(event, new THREE.Vector3(...anchor.position))
  if (planePoint) {
    const planeArr = toArray(planePoint)
    const guide = gbPair
      ? gbLateralChestGuide(planeArr, sideX)
      : anchor.normal
    const projected = projectHandleOnSkin(
      planePoint,
      guide,
      projectRadius,
      sideX,
    )
    if (accept(projected)) return projected
    if (gbPair) {
      const standoff = gbLocatorCastStandoff(from.position, to.position)
      const probe = gbLocatorOutsideProbe(planeArr, from.position, to.position)
      const side = Math.sign(sideX) || Math.sign(from.position[0]) || 1
      const inward = new THREE.Vector3(-side, 0, 0)
      const reach = Math.max(projectRadius * 2, standoff * 3)
      const picked = pickAccepted([
        ...projectFromOutsideHits(planePoint, guide, standoff),
        ...projectFromOutsideHits(new THREE.Vector3(...probe), guide, standoff),
        ...raySkinHits(planePoint, inward, reach, new THREE.Vector3(side, 0, 0)),
      ], planeArr)
      if (picked) return picked
    }
  }
  if (!gbPair) {
    const direct = surfaceHit(event)
    if (direct) {
      const snapped = closestSkinHit(direct.position, {
        maxDistance: snapRadius,
        sideX,
        guideNormal: direct.normal,
      })
      if (accept(snapped)) return snapped
    }
  }
  return null
}

function handleDragHit(event, drag) {
  return handleSkinHit(event, drag)
}

function handleDragAnchor(data) {
  const route = state.meridians.find((item) => item.id === data.routeId)
  if (!route) return null
  const pair = acupointPairs(route).find((item) =>
    item.fromPointId === data.fromPointId && item.toPointId === data.toPointId)
  if (!pair) return null
  const rest = restPathArrays(pair.fromNode, pair.toNode)
  const count = visibleHandleCount(
    polylineArcLength(rest),
    shortSegmentReferenceArc(route.side),
    pair.handles.length,
  )
  const records = pairHandleRecords(pair.fromNode, pair.toNode, pair.handles, count, rest)
  const placed = records[data.handleIndex ?? 0]
  if (!placed) return null
  return {
    rest,
    records,
    anchor: {
      position: [...placed.position],
      normal: [...placed.normal],
    },
  }
}

function projectNearSurface(position, normal, maxDistance = Infinity) {
  const radius = Number.isFinite(maxDistance) ? maxDistance : HANDLE_SKIN_SNAP_RADIUS
  const closest = closestSkinHit(position, {
    maxDistance: radius,
    sideX: position?.[0],
    guideNormal: normal,
  })
  if (closest) return closest

  const target = new THREE.Vector3(...position)
  const primary = new THREE.Vector3(...normal)
  if (primary.lengthSq() < 1e-10) primary.set(0, 0, 1)
  else primary.normalize()

  // Probe along the guide normal plus a few perpendiculars so wrap samples
  // around a wrist/hand still find skin when the chord sits inside the mesh.
  const up = Math.abs(primary.y) < 0.85 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
  const side = new THREE.Vector3().crossVectors(primary, up).normalize()
  const binormal = new THREE.Vector3().crossVectors(primary, side).normalize()
  const guides = [
    primary,
    side,
    binormal,
    primary.clone().lerp(side, 0.45).normalize(),
    primary.clone().lerp(binormal, 0.45).normalize(),
  ]

  const candidates = []
  for (const guide of guides) {
    for (const standoff of [0.04, 0.09, 0.18, 0.32, 0.5, 0.75]) {
      for (const sign of [1, -1]) {
        const origin = target.clone().addScaledVector(guide, standoff * sign)
        const caster = new THREE.Raycaster(
          origin,
          guide.clone().multiplyScalar(-sign),
          0,
          standoff * 2.5,
        )
        const hit = caster.intersectObjects(modelMeshes, false)[0]
        if (!hit?.face) continue
        const hitNormal = hit.face.normal.clone()
          .applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld))
          .normalize()
        // Face the cast guide so outside→skin hits keep an outward normal.
        if (hitNormal.dot(guide) < 0) hitNormal.negate()
        candidates.push({
          distance: hit.point.distanceTo(target),
          alignment: hitNormal.dot(primary),
          position: toArray(hit.point),
          normal: toArray(hitNormal),
        })
      }
    }
  }

  if (!candidates.length) return null
  const nearby = Number.isFinite(maxDistance)
    ? candidates.filter((item) => item.distance <= maxDistance)
    : candidates
  if (!nearby.length) return null
  nearby.sort((a, b) => (
    Math.abs(b.alignment - a.alignment) > 0.12
      ? b.alignment - a.alignment
      : a.distance - b.distance
  ))
  return { position: nearby[0].position, normal: nearby[0].normal }
}

function projectNearSurfaceOrFallback(position, normal, fallback) {
  return projectNearSurface(position, normal) || fallback
}

function mirroredNode(node) {
  const resolved = resolvedNode(node)
  const mirroredPosition = [-resolved.position[0], resolved.position[1], resolved.position[2]]
  const mirroredNormal = [-resolved.normal[0], resolved.normal[1], resolved.normal[2]]
  return projectNearSurfaceOrFallback(
    mirroredPosition,
    mirroredNormal,
    { position: mirroredPosition, normal: mirroredNormal },
  )
}

function pairedPointId(pointId) {
  const point = getPoint(pointId)
  if (!point?.pairId) return null
  return state.acupoints.find((item) => item.pairId === point.pairId && item.id !== point.id)?.id || null
}

function makeMirroredRouteNode(node) {
  if (node.type === 'acupoint' && node.pointId) {
    const mirrorId = pairedPointId(node.pointId)
    const point = mirrorId && getPoint(mirrorId)
    if (point) {
      return sanitizeRouteNode({
        type: 'acupoint',
        pointId: mirrorId,
        position: point.position,
        normal: point.normal,
      })
    }
  }
  const mirrored = mirroredNode(node)
  return sanitizeRouteNode({
    type: 'control',
    pointId: null,
    position: mirrored.position,
    normal: mirrored.normal,
    style: node.style,
  })
}

function appendSkinPoint(points, point, previousRef) {
  if (previousRef.current && previousRef.current.distanceToSquared(point) <= 1e-8) return
  points.push(point)
  previousRef.current = point
}

/** Cast from a short stand-off along a guide normal onto the nearest skin hit. */
function projectFromOutsideHits(chordPoint, guide, standoff) {
  const normal = new THREE.Vector3(...guide)
  if (normal.lengthSq() < 1e-10) return []
  normal.normalize()
  const origin = chordPoint.clone().addScaledVector(normal, standoff)
  return raySkinHits(origin, normal.clone().negate(), standoff * 2.2, normal)
}

function projectFromOutside(chordPoint, guide, standoff) {
  return projectFromOutsideHits(chordPoint, guide, standoff)[0] || null
}

function triangleCornerIds(geometry, faceIndex) {
  if (!Number.isInteger(faceIndex) || faceIndex < 0 || !geometry) return null
  const offset = faceIndex * 3
  const index = geometry.getIndex()
  if (index) {
    if (offset + 2 >= index.count) return null
    return [index.getX(offset), index.getX(offset + 1), index.getX(offset + 2)]
  }
  const count = geometry.getAttribute('position')?.count || 0
  if (offset + 2 >= count) return null
  return [offset, offset + 1, offset + 2]
}

function geodesicCacheKey(a, b) {
  const quantize = (point) => point.map((value) => Number(value).toFixed(4)).join(',')
  return `${quantize(a.position)}>${quantize(b.position)}`
}

function collapseNearPoints(points, normals) {
  if (!points.length) return { points: [], normals: [] }
  const outPoints = [points[0]]
  const outNormals = [normals[0] || [0, 1, 0]]
  for (let index = 1; index < points.length; index += 1) {
    if (dist3(points[index], outPoints[outPoints.length - 1]) < 1e-7) continue
    outPoints.push(points[index])
    outNormals.push(normals[index] || outNormals[outNormals.length - 1])
  }
  return { points: outPoints, normals: outNormals }
}

function projectGeodesicSample(point, guideNormal) {
  const hit = closestSkinHit(point, {
    maxDistance: 0.012,
    guideNormal,
  })
  if (!hit) return null
  if (dist3(hit.position, point) > 0.014) return null
  return { position: hit.position, normal: hit.normal }
}

function liftGeodesicPolyline(points, normals) {
  const cleaned = collapseOppositeWallSpikes(points, normals)
  const taut = tautOnSurfacePolyline(cleaned.points, cleaned.normals, {
    iterations: 12,
    strength: 0.65,
    maxStep: 0.006,
    corridor: cleaned.points,
    corridorRadius: 0.014,
  })
  const dense = densifyPolylineWithNormals(taut.points, taut.normals, 0.01)
  const snapped = snapPolylineToSurface(dense.points, dense.normals, projectGeodesicSample, {
    corridor: cleaned.points,
    corridorRadius: 0.018,
    minNormalDot: 0.25,
    maxJump: 0.014,
  })
  const guarded = collapseSharpChordSpikes(snapped.points, snapped.normals)
  return guarded.points.map((point, index) => (
    new THREE.Vector3(...point).addScaledVector(
      new THREE.Vector3(...(guarded.normals[index] || [0, 1, 0])),
      SKIN_LIFT,
    )
  ))
}

function clearPathCaches() {
  geodesicCache.clear()
  restPathCache.clear()
  conformCache.clear()
  discCache.clear()
  shortArcCache = null
}

async function rebuildSurfaceGraph({ isStale } = {}) {
  clearPathCaches()
  normalMatrices.clear()
  const chunks = []
  const meshOffsets = new Map()
  for (const mesh of modelMeshes) {
    const geometry = mesh.geometry
    const positionAttr = geometry?.getAttribute('position')
    if (!positionAttr) continue
    mesh.updateMatrixWorld(true)
    const normalAttr = geometry.getAttribute('normal')
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld)
    const positions = []
    const normals = []
    const vertex = new THREE.Vector3()
    const normal = new THREE.Vector3()
    for (let index = 0; index < positionAttr.count; index += 1) {
      vertex.fromBufferAttribute(positionAttr, index).applyMatrix4(mesh.matrixWorld)
      positions.push(toArray(vertex))
      if (normalAttr) {
        normal.fromBufferAttribute(normalAttr, index)
          .applyNormalMatrix(normalMatrix)
          .normalize()
        normals.push(toArray(normal))
      } else {
        normals.push([0, 1, 0])
      }
      if (index > 0 && index % 32768 === 0) {
        await yieldToMain()
        if (isStale?.()) return
      }
    }
    const triangles = []
    const indexAttr = geometry.getIndex()
    if (indexAttr) {
      for (let index = 0; index < indexAttr.count; index += 1) triangles.push(indexAttr.getX(index))
    } else {
      for (let index = 0; index < positionAttr.count; index += 1) triangles.push(index)
    }
    meshOffsets.set(mesh, chunks.reduce((sum, chunk) => sum + chunk.positions.length, 0))
    chunks.push({ positions, normals, triangles })
    await yieldToMain()
    if (isStale?.()) return
  }
  if (!chunks.length) {
    surfaceGraph = null
    return
  }
  surfaceGraph = { ...buildCombinedSurfaceGraph(chunks), meshOffsets }
}

function globalTriangleCorners(mesh, faceIndex) {
  const offset = surfaceGraph?.meshOffsets?.get(mesh)
  if (offset == null) return null
  const local = triangleCornerIds(mesh.geometry, faceIndex)
  if (!local) return null
  return local.map((id) => offset + id)
}

/** Shortest path on the loaded mesh; every sample lies on a triangle or edge. */
function geodesicOnSkin(a, b) {
  if (!surfaceGraph?.adjacency) return null
  const start = a?.position
  const end = b?.position
  if (!start || !end) return null
  const key = geodesicCacheKey(a, b)
  const reverseKey = geodesicCacheKey(b, a)
  if (geodesicCache.has(key)) return geodesicCache.get(key).map((point) => point.clone())
  if (geodesicCache.has(reverseKey)) {
    return geodesicCache.get(reverseKey).map((point) => point.clone()).reverse()
  }

  const hitA = closestSkinHit(start, { maxDistance: 0.12, guideNormal: a.normal })
  const hitB = closestSkinHit(end, { maxDistance: 0.12, guideNormal: b.normal })
  if (!hitA?.mesh || !hitB?.mesh) return null
  const cornersA = globalTriangleCorners(hitA.mesh, hitA.faceIndex)
  const cornersB = globalTriangleCorners(hitB.mesh, hitB.faceIndex)
  if (!cornersA || !cornersB) return null

  const sameFace = hitA.mesh === hitB.mesh && hitA.faceIndex === hitB.faceIndex
  let points
  let normals
  if (sameFace) {
    points = [hitA.position, hitB.position]
    normals = [hitA.normal, hitB.normal]
  } else {
    const startSeeds = cornersA.map((id) => {
      const canonical = surfaceGraph.remap[id]
      return { id: canonical, cost: dist3(surfaceGraph.positions[canonical], hitA.position) }
    })
    const goalIds = [...new Set(cornersB.map((id) => surfaceGraph.remap[id]))]
    const found = shortestSurfacePath({
      adjacency: surfaceGraph.adjacency,
      positions: surfaceGraph.positions,
      startSeeds,
      goalIds,
      goalPoint: hitB.position,
      maxExplored: 120000,
    })
    if (!found?.ids?.length) return null
    points = [hitA.position, ...found.ids.map((id) => surfaceGraph.positions[id]), hitB.position]
    normals = [hitA.normal, ...found.ids.map((id) => surfaceGraph.normals[id] || hitA.normal), hitB.normal]
  }

  const collapsed = collapseNearPoints(points, normals)
  if (collapsed.points.length < 2) return null
  const lifted = liftGeodesicPolyline(collapsed.points, collapsed.normals)
  geodesicCache.set(key, lifted)
  return lifted.map((point) => point.clone())
}

function chordDivesThroughSkin(a, b) {
  const start = new THREE.Vector3(...a.position)
  const end = new THREE.Vector3(...b.position)
  const mid = start.clone().lerp(end, 0.5)
  const sideX = (a.position[0] + b.position[0]) / 2
  const snap = closestSkinHit(toArray(mid), {
    maxDistance: HANDLE_SKIN_SNAP_RADIUS,
    sideX,
  })
  if (!snap) return false
  return isPointBehindSurface(toArray(mid), snap.position, snap.normal, 0.016)
    || mid.distanceTo(new THREE.Vector3(...snap.position)) > 0.016
}

function sampleWrapGuide(a, b, chord, t) {
  const slerp = slerpUnitVectors(a.normal, b.normal, t)
  const dropY = Math.abs(a.position[1] - b.position[1])
  if (shouldPosteriorWrap(a.position, b.position)) {
    const wrap = posteriorWrapGuide(toArray(chord))
    const mixed = [
      slerp[0] * 0.25 + wrap[0] * 0.75,
      slerp[1] * 0.25 + wrap[1] * 0.75,
      slerp[2] * 0.25 + wrap[2] * 0.75,
    ]
    const length = Math.hypot(...mixed) || 1
    return mixed.map((value) => value / length)
  }
  const wrap = outwardWrapGuide(toArray(chord), (a.position[0] + b.position[0]) / 2, { dropY })
  if (dropY <= 0.1) return slerp
  const mixed = [
    slerp[0] * 0.4 + wrap[0] * 0.6,
    slerp[1] * 0.4 + wrap[1] * 0.6,
    slerp[2] * 0.4 + wrap[2] * 0.6,
  ]
  const length = Math.hypot(...mixed) || 1
  return mixed.map((value) => value / length)
}

function wrapProbeGuides(guide, sideX, frontBias, backBias = false, midline = false) {
  const lateral = Number.isFinite(sideX) && Math.abs(sideX) > 1e-6 ? Math.sign(sideX) : 1
  const guides = [guide]
  if (backBias) {
    guides.push([0, 0.08, -1])
    guides.push(normalizeGuide([guide[0] * 0.25, 0.1, -1]))
    return guides
  }
  if (frontBias) {
    guides.push([0, 0, 1])
    guides.push(normalizeGuide([guide[0], Math.max(guide[1], 0.15), 1]))
    // Lateral chest probes are for 肩井→淵腋. On 任督 they fly into the
    // sky beside the face or jog the sternum sideways.
    if (!midline) {
      guides.push(normalizeGuide([lateral * 0.45, 0.2, 1]))
      guides.push(normalizeGuide([lateral * 0.7, 0.35, 0.55]))
    }
  }
  return guides
}

function normalizeGuide(guide) {
  const length = Math.hypot(guide[0] || 0, guide[1] || 0, guide[2] || 0) || 1
  return [guide[0] / length, guide[1] / length, guide[2] / length]
}

function acceptWrapHit(hit, from, to, previous) {
  if (!hit) return false
  if (!isHitOnWrapSide(hit.position, from, to)) return false
  if (!hitStaysOnFrontMidline(hit.position, from, to)) return false
  if (previous && shouldFrontWrap(from, to)) {
    const prevZ = previous.isVector3 ? previous.z : previous[2]
    if (Number.isFinite(prevZ) && hit.position[2] < prevZ - 0.055) return false
  }
  return true
}

function hitFromWrapProbe(chord, guide, sideX, from, to, previous = null) {
  const frontBias = shouldFrontWrap(from, to)
  const backBias = shouldPosteriorWrap(from, to)
  const midline = isSagittalMidlineSpan(from, to)
  const wrapSideX = midline ? null : sideX
  const standoffs = midline && frontBias
    ? [0.04, 0.08, 0.12]
    : frontBias ? [0.1, 0.16, 0.24, 0.34] : backBias ? [0.08, 0.14, 0.22] : [0.14, 0.22]
  for (const nextGuide of wrapProbeGuides(guide, sideX, frontBias, backBias, midline)) {
    for (const standoff of standoffs) {
      const pushed = chord.clone().addScaledVector(new THREE.Vector3(...nextGuide), standoff)
      const hit = projectFromOutside(pushed, nextGuide, standoff * 1.8)
        || closestSkinHit(toArray(pushed), {
          maxDistance: midline ? 0.10 : 0.28,
          sideX: wrapSideX,
          guideNormal: nextGuide,
          preferPosterior: backBias,
        })
      if (acceptWrapHit(hit, from, to, previous)) return hit
    }
  }
  return null
}

/** Project a convex interior chord onto the outer same-side skin. */
function snapChordSamplesToSkin(a, b) {
  const start = new THREE.Vector3(...a.position)
  const end = new THREE.Vector3(...b.position)
  const from = [...a.position]
  const to = [...b.position]
  const sideX = (from[0] + to[0]) / 2
  const dist = Math.max(start.distanceTo(end), 1e-6)
  const count = Math.min(72, Math.max(22, Math.ceil(Math.min(dist, 0.45) / 0.007) + 14))
  const points = []
  const previousRef = { current: null }
  appendSkinPoint(points, start.clone().addScaledVector(new THREE.Vector3(...a.normal), SKIN_LIFT), previousRef)
  for (let index = 1; index < count - 1; index += 1) {
    const t = index / (count - 1)
    const chord = start.clone().lerp(end, t)
    const guide = sampleWrapGuide(a, b, chord, t)
    const hit = hitFromWrapProbe(chord, guide, sideX, from, to, previousRef.current)
    if (!hit) continue
    const lifted = new THREE.Vector3(...hit.position)
      .addScaledVector(new THREE.Vector3(...hit.normal), SKIN_LIFT)
    appendSkinPoint(points, lifted, previousRef)
  }
  appendSkinPoint(points, end.clone().addScaledVector(new THREE.Vector3(...b.normal), SKIN_LIFT), previousRef)
  if (points.length < 2) return null
  const filled = fillClippedSpans(points, sideX, from, to)
  const outer = keepOuterSkinPolyline(filled, sideX, from, to)
  if (!outer || outer.length < 2) return filled
  return isShoulderAxillaWrap(from, to) ? simplifyLiftedPolyline(outer) : outer
}

function keepOuterSkinPolyline(points, sideX, from, to) {
  if (!points || points.length < 2) return points
  const wrapSideX = isSagittalMidlineSpan(from, to) ? null : sideX
  const out = [points[0]]
  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index]
    const hit = closestSkinHit(toArray(point), {
      maxDistance: 0.14,
      sideX: wrapSideX,
      preferPosterior: shouldPosteriorWrap(from, to),
    })
    if (!hit || !isHitOnWrapSide(hit.position, from, to)) continue
    const lifted = new THREE.Vector3(...hit.position)
      .addScaledVector(new THREE.Vector3(...hit.normal), SKIN_LIFT)
    if (out[out.length - 1].distanceToSquared(lifted) > 1e-8) out.push(lifted)
  }
  const last = points[points.length - 1]
  if (out[out.length - 1].distanceToSquared(last) > 1e-8) out.push(last)
  else out[out.length - 1] = last
  return out.length >= 2 ? out : points
}

function wrapWaypointBetween(a, b, sideX, wrapFrom, wrapTo) {
  const mid = a.clone().lerp(b, 0.5)
  const from = wrapFrom || toArray(a)
  const to = wrapTo || toArray(b)
  const dropY = Math.abs(from[1] - to[1])
  const guide = shouldPosteriorWrap(from, to)
    ? posteriorWrapGuide(toArray(mid))
    : outwardWrapGuide(toArray(mid), sideX, { dropY })
  const hit = hitFromWrapProbe(mid, guide, sideX, from, to, a)
  if (!hit) return null
  return new THREE.Vector3(...hit.position)
    .addScaledVector(new THREE.Vector3(...hit.normal), SKIN_LIFT)
}

/** Insert outer-skin waypoints wherever a span still tunnels through the mesh. */
function fillClippedSpans(points, sideX, wrapFrom, wrapTo, depth = 0) {
  if (!points || points.length < 2 || depth > 8) return points
  const from = wrapFrom || toArray(points[0])
  const to = wrapTo || toArray(points[points.length - 1])
  const out = [points[0]]
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1]
    const b = points[index]
    const mid = a.clone().lerp(b, 0.5)
    const span = a.distanceTo(b)
    const snap = span > 0.014
      ? closestSkinHit(toArray(mid), {
        maxDistance: 0.36,
        sideX,
        preferPosterior: shouldPosteriorWrap(from, to),
      })
      : null
    const clipped = snap && isPointBehindSurface(toArray(mid), snap.position, snap.normal)
    if (clipped) {
      const waypoint = wrapWaypointBetween(a, b, sideX, from, to)
      if (
        waypoint
        && waypoint.distanceTo(a) > 0.007
        && waypoint.distanceTo(b) > 0.007
        && isHitOnWrapSide(toArray(waypoint), from, to)
      ) {
        const left = fillClippedSpans([a, waypoint], sideX, from, to, depth + 1)
        const right = fillClippedSpans([waypoint, b], sideX, from, to, depth + 1)
        for (let cursor = 1; cursor < left.length; cursor += 1) out.push(left[cursor])
        for (let cursor = 1; cursor < right.length; cursor += 1) out.push(right[cursor])
        continue
      }
    }
    out.push(b)
  }
  return out
}

function simplifyLiftedPolyline(points) {
  const arrays = arraysFromSkin(points)
  if (arrays.length < 4) return points
  const normals = arrays.map((point, index) => {
    const prev = arrays[Math.max(0, index - 1)]
    const next = arrays[Math.min(arrays.length - 1, index + 1)]
    const tangent = [next[0] - prev[0], next[1] - prev[1], next[2] - prev[2]]
    const guide = Number.isFinite(point[0]) ? [point[0], 0.15, Math.max(0.2, point[2] + 0.35)] : [0, 0, 1]
    const normal = [
      tangent[1] * guide[2] - tangent[2] * guide[1],
      tangent[2] * guide[0] - tangent[0] * guide[2],
      tangent[0] * guide[1] - tangent[1] * guide[0],
    ]
    const length = Math.hypot(...normal) || 1
    return [normal[0] / length, normal[1] / length, normal[2] / length]
  })
  const collapsed = collapseOppositeWallSpikes(arrays, normals)
  const simplified = simplifyPolylineWithNormals(collapsed.points, collapsed.normals, 0.007)
  return vectorsFromArrays(simplified.points)
}

/**
 * March along the mesh from A to B as a single polyline.
 * Opposite-normal segments (太淵→魚際→少商) orbit the limb instead of
 * cutting through / spawning multiple floating chords.
 */
/**
 * 任督中線：依 Y 切片貼回皮膚。
 * 臉段從前方 −Z、後枕從後方 +Z；胸腹段只鎖 X，Z 可跟著胸骨／乳房起伏。
 */
function snapMidlineChordToSkin(a, b, {
  followProfile = false,
  keepStraight = false,
  fromBack = false,
} = {}) {
  const start = new THREE.Vector3(...a.position)
  const end = new THREE.Vector3(...b.position)
  const from = a.position
  const to = b.position
  const span = Math.max(start.distanceTo(end), 1e-6)
  const count = Math.min(72, Math.max(20, Math.ceil(span / Math.max(statureWorld(0.004), span * 0.03)) + 10))
  const maxZ = Math.max(from[2], to[2])
  const minZ = Math.min(from[2], to[2])
  const inward = new THREE.Vector3(0, 0, fromBack ? 1 : -1)
  const outward = new THREE.Vector3(0, 0, fromBack ? -1 : 1)
  const standoffs = followProfile
    ? [statureWorld(0.06), statureWorld(0.10), statureWorld(0.16)]
    : [statureWorld(0.05), statureWorld(0.09)]
  const extraReach = Math.max(statureWorld(0.12), maxZ - minZ + statureWorld(0.04))
  const xSlack = Math.max(statureWorld(0.008), span * 0.05)
  const lift = statureWorld(SKIN_LIFT)
  const points = []
  const previousRef = { current: null }
  const liftHit = (hit) => new THREE.Vector3(...hit.position)
    .addScaledVector(new THREE.Vector3(...hit.normal), lift)
  const legal = (hit, t, sampleX) => {
    if (!hit) return false
    if (!hitStaysOnFrontMidline(hit.position, from, to)) return false
    if (!hitMatchesMidlineSampleY(hit.position, from, to, t)) return false
    if (keepStraight && !hitStaysOnMidlineX(hit.position, from, to, t)) return false
    if (keepStraight && Math.abs(hit.position[0] - sampleX) > xSlack) return false
    return true
  }
  const pickHit = (origin, maxDistance, t, sampleX) => {
    const hits = raySkinHits(origin, inward, maxDistance, outward)
    for (const hit of hits) {
      if (legal(hit, t, sampleX)) return hit
    }
    return null
  }

  appendSkinPoint(points, start.clone().addScaledVector(new THREE.Vector3(...a.normal), lift), previousRef)
  for (let index = 1; index < count - 1; index += 1) {
    const t = index / (count - 1)
    const sample = fromBack
      ? midlineBackProbeOrigin(from, to, t, 0)
      : midlineFrontProbeOrigin(from, to, t, 0)
    const x = sample[0]
    const y = sample[1]
    const dx = Math.max(statureWorld(0.012), span * 0.03)
    const xs = followProfile
      ? [x, x + dx, x - dx, x + dx * 2, x - dx * 2, (from[0] + to[0]) / 2]
      : [x]
    let hit = null
    let bestZ = fromBack ? Infinity : -Infinity
    for (const ox of xs) {
      for (const standoff of standoffs) {
        const origin = fromBack
          ? new THREE.Vector3(...midlineBackProbeOrigin(from, to, t, standoff))
          : new THREE.Vector3(ox, y, maxZ + standoff)
        if (fromBack) origin.x = ox
        const candidate = pickHit(origin, standoff + extraReach, t, x)
        if (!candidate) continue
        if (followProfile) {
          const better = fromBack
            ? candidate.position[2] < bestZ
            : candidate.position[2] > bestZ
          if (better) {
            hit = candidate
            bestZ = candidate.position[2]
          }
        } else {
          hit = candidate
          break
        }
      }
      if (hit && !followProfile) break
    }
    if (!hit && keepStraight) {
      const chord = start.clone().lerp(end, t)
      const nearby = closestSkinHit(toArray(chord), {
        maxDistance: Math.max(statureWorld(0.04), span * 0.5),
        sideX: null,
        guideNormal: fromBack ? [0, 0, -1] : [0, 0, 1],
      })
      if (legal(nearby, t, x)) hit = nearby
    }
    if (!hit) continue
    appendSkinPoint(points, liftHit(hit), previousRef)
  }
  appendSkinPoint(points, end.clone().addScaledVector(new THREE.Vector3(...b.normal), lift), previousRef)
  if (isDevMode(import.meta.env)) {
    window.__midlineSnap = window.__midlineSnap || []
    window.__midlineSnap.push({
      followProfile,
      keepStraight,
      fromBack,
      n: points.length,
      from: [...from],
      to: [...to],
      xs: points.map((point) => point.x),
      ys: points.map((point) => point.y),
      zs: points.map((point) => point.z),
    })
  }
  return points.length >= 3 ? points : null
}

/** Project a same-face limb chord onto the facing skin (inner arm, not through it). */
function snapFacingChordToSkin(a, b) {
  const start = new THREE.Vector3(...a.position)
  const end = new THREE.Vector3(...b.position)
  const sideX = (a.position[0] + b.position[0]) / 2
  const dist = Math.max(start.distanceTo(end), 1e-6)
  const count = Math.min(48, Math.max(16, Math.ceil(dist / 0.01) + 8))
  const points = []
  const previousRef = { current: null }
  appendSkinPoint(points, start.clone().addScaledVector(new THREE.Vector3(...a.normal), SKIN_LIFT), previousRef)
  for (let index = 1; index < count - 1; index += 1) {
    const t = index / (count - 1)
    const chord = start.clone().lerp(end, t)
    const guide = slerpUnitVectors(a.normal, b.normal, t)
    const guideVec = new THREE.Vector3(...guide)
    const standoff = 0.045
    const pushed = chord.clone().addScaledVector(guideVec, standoff)
    const hit = projectFromOutside(pushed, guide, standoff * 2)
      || closestSkinHit(toArray(chord), {
        maxDistance: 0.07,
        sideX,
        guideNormal: guide,
      })
    if (!hit) continue
    const hitNormal = new THREE.Vector3(...hit.normal)
    if (hitNormal.dot(guideVec) < 0.15) continue
    if (hit.position[0] * sideX < 0 && Math.abs(hit.position[0]) > 0.04) continue
    const lifted = new THREE.Vector3(...hit.position).addScaledVector(hitNormal, SKIN_LIFT)
    appendSkinPoint(points, lifted, previousRef)
  }
  appendSkinPoint(points, end.clone().addScaledVector(new THREE.Vector3(...b.normal), SKIN_LIFT), previousRef)
  if (points.length < 2) return null
  if (!pathFollowsFacingChord(arraysFromSkin(points), a.position, b.position)) return null
  return points
}

function isUsableDigitPath(points, from, to) {
  if (!points || points.length < 5) return false
  if (maxPolylineEdge(points) > 0.016) return false
  for (const point of points) {
    const sample = point?.isVector3 ? toArray(point) : point
    if (!isOnDigitSkin(sample, from, to, 0.026)) return false
  }
  return true
}

/** Split short on-skin gaps; never subdivide a long air chord (that zigzags through the finger). */
function densifyDigitSkin(points, sideX, from, to, depth = 0) {
  if (!points || points.length < 2 || depth > 5) return points
  const out = [points[0]]
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1]
    const b = points[index]
    const span = a.distanceTo(b)
    if (span > 0.007 && span <= 0.02) {
      const mid = a.clone().lerp(b, 0.5)
      const hit = closestSkinHit(toArray(mid), { maxDistance: 0.012, sideX })
      if (hit && isOnDigitSkin(hit.position, from, to, 0.024)) {
        const lifted = new THREE.Vector3(...hit.position)
          .addScaledVector(new THREE.Vector3(...hit.normal), SKIN_LIFT)
        const left = densifyDigitSkin([a, lifted], sideX, from, to, depth + 1)
        const right = densifyDigitSkin([lifted, b], sideX, from, to, depth + 1)
        for (let cursor = 1; cursor < left.length; cursor += 1) out.push(left[cursor])
        for (let cursor = 1; cursor < right.length; cursor += 1) out.push(right[cursor])
        continue
      }
    }
    out.push(b)
  }
  return out
}

/**
 * Walk the mesh toward `b` from a known skin point.
 * Only record real hits a few millimetres away — never an air sample.
 */
function marchOnSkinHits(a, b, { hint = null, stepScale = 0.5 } = {}) {
  let pos = new THREE.Vector3(...a.position)
  let normal = new THREE.Vector3(...a.normal).normalize()
  const end = new THREE.Vector3(...b.position)
  const endNormal = new THREE.Vector3(...b.normal).normalize()
  const sideX = (a.position[0] + b.position[0]) / 2
  const from = a.position
  const to = b.position
  const totalDist = Math.max(pos.distanceTo(end), 1e-6)
  const stepLen = Math.max(0.0022, surfaceStepLength(totalDist, normal.dot(endNormal)) * stepScale)
  const hintVec = hint ? new THREE.Vector3(...hint) : end.clone().sub(pos)
  const hintN = hintVec.lengthSq() > 1e-8 ? hintVec.normalize() : new THREE.Vector3(0, 1, 0)
  const points = [pos.clone().addScaledVector(normal, SKIN_LIFT)]
  const maxSteps = Math.max(72, Math.ceil(totalDist / stepLen) * 14 + 32)

  for (let step = 0; step < maxSteps; step += 1) {
    const toEnd = end.clone().sub(pos)
    const remaining = toEnd.length()
    if (remaining < stepLen * 1.05) break

    let tangent = toEnd.clone().addScaledVector(normal, -toEnd.dot(normal))
    if (tangent.lengthSq() < 1e-10 || tangent.length() < remaining * 0.12) {
      let axis = new THREE.Vector3().crossVectors(normal, endNormal)
      if (axis.lengthSq() < 1e-8) axis.crossVectors(normal, hintN)
      if (axis.lengthSq() < 1e-8) axis.set(0, 1, 0).cross(normal)
      axis.normalize()
      tangent = new THREE.Vector3().crossVectors(axis, normal)
      if (tangent.dot(toEnd) < 0) tangent.negate()
      const along = hintN.clone().addScaledVector(normal, -hintN.dot(normal))
      if (along.lengthSq() > 1e-8) tangent.lerp(along.normalize(), 0.72)
    }
    tangent.normalize().multiplyScalar(Math.min(stepLen, remaining * 0.35))

    const progress = 1 - remaining / totalDist
    const guide = slerpUnitVectors(
      toArray(normal),
      toArray(endNormal),
      Math.min(0.8, progress + 0.03),
      toArray(hintN),
    )
    const candidate = pos.clone().add(tangent)
    const hit = closestSkinHit(toArray(candidate), {
      maxDistance: 0.01,
      sideX,
      guideNormal: guide,
    })
      || projectFromOutside(candidate, guide, 0.01)
      || projectFromOutside(pos.clone().addScaledVector(normal, 0.008), toArray(normal), 0.01)
    if (!hit) continue
    const next = new THREE.Vector3(...hit.position)
    if (next.distanceTo(pos) > 0.012) continue
    if (next.distanceTo(end) > remaining + 0.01) continue
    if (!isOnDigitSkin(hit.position, from, to, 0.026)) continue
    pos.copy(next)
    normal.set(...hit.normal).normalize()
    points.push(pos.clone().addScaledVector(normal, SKIN_LIFT))
  }
  points.push(end.clone().addScaledVector(endNormal, SKIN_LIFT))
  return isUsableDigitPath(points, from, to) ? points : null
}

/** Palm → pinky pad samples, then a short outside cast around the fingertip onto the nail. */
function sampleDigitSkinPath(a, b, tipPos, tipNormal, { distal, palmar, sideX, tipOnSkin = false }) {
  const start = new THREE.Vector3(...a.position)
  const end = new THREE.Vector3(...b.position)
  const tipGuide = Array.isArray(tipNormal) ? tipNormal : toArray(tipNormal)
  const points = []
  const previousRef = { current: null }
  const accept = (hit) => {
    if (!hit || !isOnDigitSkin(hit.position, a.position, b.position, 0.024)) return
    const lifted = new THREE.Vector3(...hit.position)
      .addScaledVector(new THREE.Vector3(...hit.normal), SKIN_LIFT)
    appendSkinPoint(points, lifted, previousRef)
  }

  accept({ position: a.position, normal: a.normal })

  const palmarCount = 32
  for (let index = 1; index < palmarCount; index += 1) {
    const t = index / palmarCount
    const chord = start.clone().lerp(tipPos, t)
    const guide = slerpUnitVectors(a.normal, tipGuide, t, distal)
    const hit = projectFromOutside(chord, guide, 0.01)
      || closestSkinHit(toArray(chord), { maxDistance: 0.012, sideX, guideNormal: guide })
    accept(hit)
  }

  if (tipOnSkin) accept({ position: toArray(tipPos), normal: tipGuide })

  const wrapCenter = tipPos.clone().lerp(end, 0.45)
  const wrapCount = 18
  for (let index = 1; index < wrapCount; index += 1) {
    const t = index / wrapCount
    const guide = slerpUnitVectors(palmar, b.normal, t, distal)
    const hit = projectFromOutside(wrapCenter, guide, 0.011)
      || closestSkinHit(
        toArray(wrapCenter.clone().addScaledVector(new THREE.Vector3(...guide), 0.006)),
        { maxDistance: 0.012, sideX, guideNormal: guide },
      )
    accept(hit)
  }

  accept({ position: b.position, normal: b.normal })
  return points
}

/** 少府→少衝: stay on the pinky skin to the fingertip, then onto the nail. */
function snapDigitTipWrap(a, b) {
  const distal = digitDistalDir(a.position, b.position)
  const palmar = digitPalmarDir(a.normal, b.normal)
  const sideX = (a.position[0] + b.position[0]) / 2
  const probe = digitTipProbe(a.position, b.position, a.normal, b.normal)
  const tipHit = closestSkinHit(probe, {
    maxDistance: 0.014,
    sideX,
    guideNormal: palmar,
  })
  const tipOnSkin = tipHit && isOnDigitSkin(tipHit.position, a.position, b.position, 0.022)
  const tipPos = tipOnSkin
    ? new THREE.Vector3(...tipHit.position)
    : new THREE.Vector3(...probe)
  const tipNormal = tipOnSkin ? tipHit.normal : palmar

  const finish = (points) => {
    if (!points || points.length < 3) return null
    const dense = densifyDigitSkin(points, sideX, a.position, b.position)
    return isUsableDigitPath(dense, a.position, b.position) ? dense : null
  }

  const sampled = finish(sampleDigitSkinPath(a, b, tipPos, tipNormal, {
    distal,
    palmar,
    sideX,
    tipOnSkin,
  }))
  if (sampled) return sampled

  if (tipOnSkin) {
    const tip = { position: tipHit.position, normal: tipHit.normal }
    const joined = finish(concatSkinPieces([geodesicOnSkin(a, tip), geodesicOnSkin(tip, b)]))
    if (joined) return joined
    const marched = finish(concatSkinPieces([
      marchOnSkinHits(a, tip, { hint: distal, stepScale: 0.5 }),
      marchOnSkinHits(tip, b, { hint: distal, stepScale: 0.45 }),
    ]))
    if (marched) return marched
  }

  const fallback = finish(marchOnSkinHits(a, b, { hint: distal, stepScale: 0.45 }))
  if (fallback) return fallback
  return densifyDigitSkin(
    sampleDigitSkinPath(a, b, tipPos, tipNormal, { distal, palmar, sideX, tipOnSkin }),
    sideX,
    a.position,
    b.position,
  )
}

function sameHeadSideHit(hit, sideX) {
  if (!hit) return false
  if (!Number.isFinite(sideX) || Math.abs(sideX) <= 0.03) return true
  return !(hit.position[0] * sideX < 0 && Math.abs(hit.position[0]) > 0.03)
}

function densifyHeadSkin(points, sideX, depth = 0) {
  if (!points || points.length < 2 || depth > 6) return points
  const out = [points[0]]
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1]
    const b = points[index]
    const span = a.distanceTo(b)
    if (span > 0.004 && span <= 0.03) {
      const mid = a.clone().lerp(b, 0.5)
      const hit = closestSkinHit(toArray(mid), { maxDistance: 0.022, sideX })
      if (hit && sameHeadSideHit(hit, sideX)) {
        const lifted = new THREE.Vector3(...hit.position)
          .addScaledVector(new THREE.Vector3(...hit.normal), SKIN_LIFT)
        const left = densifyHeadSkin([a, lifted], sideX, depth + 1)
        const right = densifyHeadSkin([lifted, b], sideX, depth + 1)
        for (let cursor = 1; cursor < left.length; cursor += 1) out.push(left[cursor])
        for (let cursor = 1; cursor < right.length; cursor += 1) out.push(right[cursor])
        continue
      }
    }
    out.push(b)
  }
  return out
}

function snapTeHeadSamplesToSkin(samples, a, b, fromCode = '', toCode = '', {
  followLocators = false,
} = {}) {
  const sideX = (a.position[0] + b.position[0]) / 2
  const temple = isTeTempleRunPair(fromCode, toCode)
  const center = teEarCenter(a.position, b.position)
  const points = []
  const previousRef = { current: null }
  const accept = (hit) => {
    if (!sameHeadSideHit(hit, sideX)) return
    const lifted = new THREE.Vector3(...hit.position)
      .addScaledVector(new THREE.Vector3(...hit.normal), SKIN_LIFT)
    appendSkinPoint(points, lifted, previousRef)
  }
  accept({ position: a.position, normal: a.normal })
  for (let index = 1; index < samples.length - 1; index += 1) {
    const t = index / Math.max(1, samples.length - 1)
    const sample = samples[index]
    const slerp = slerpUnitVectors(a.normal, b.normal, t)
    let guide = slerp
    if (!temple && !followLocators) {
      const radial = [
        sample[0] - center[0],
        sample[1] - center[1],
        sample[2] - center[2],
      ]
      const len = Math.hypot(...radial)
      if (len > 1e-6) {
        guide = [
          radial[0] / len * 0.7 + slerp[0] * 0.3,
          radial[1] / len * 0.7 + slerp[1] * 0.3,
          radial[2] / len * 0.7 + slerp[2] * 0.3,
        ]
      }
    }
    const origin = new THREE.Vector3(...sample)
    const hit = projectFromOutside(origin, guide, followLocators ? 0.028 : (temple ? 0.022 : 0.016))
      || closestSkinHit(sample, {
        maxDistance: followLocators ? 0.12 : (temple ? 0.09 : 0.06),
        sideX,
        guideNormal: guide,
      })
      || projectFromOutside(origin, slerp, followLocators ? 0.06 : 0.04)
    accept(hit)
  }
  accept({ position: b.position, normal: b.normal })
  if (points.length < 2) return null
  return densifyHeadSkin(points, sideX)
}

function tautTeHeadOnSkin(points, a, b, { followLocators = false } = {}) {
  if (!points || points.length < 4) return points
  const arrays = arraysFromSkin(points)
  const sideX = (a.position[0] + b.position[0]) / 2
  const normals = arrays.map((_, index) => (
    slerpUnitVectors(a.normal, b.normal, index / Math.max(1, arrays.length - 1))
  ))
  const taut = tautOnSurfacePolyline(arrays, normals, {
    iterations: followLocators ? 8 : 18,
    strength: followLocators ? 0.4 : 0.72,
    maxStep: followLocators ? 0.002 : 0.0028,
    corridor: arrays,
    corridorRadius: followLocators ? 0.045 : 0.016,
    minNormalDot: 0.05,
    project: (point, normal) => {
      const hit = closestSkinHit(point, {
        maxDistance: followLocators ? 0.028 : 0.016,
        sideX,
        guideNormal: normal,
      })
      return hit && sameHeadSideHit(hit, sideX)
        ? { position: hit.position, normal: hit.normal }
        : null
    },
  })
  return taut.points.map((point, index) => (
    new THREE.Vector3(...point).addScaledVector(
      new THREE.Vector3(...(taut.normals[index] || [0, 1, 0])),
      SKIN_LIFT,
    )
  ))
}

function snapTeHeadArcToSkin(a, b, fromCode, toCode, records = [], rest = []) {
  const path = rest.length >= 2 ? rest : [a.position, b.position]
  const ordered = [...records].sort((left, right) => (
    closestTOnPolyline(path, left.position) - closestTOnPolyline(path, right.position)
  ))
  const followLocators = ordered.length > 0
  const samples = followLocators
    ? catmullRomThrough(
      [a.position, ...ordered.map((record) => record.position), b.position],
      16,
    )
    : teHeadArcPoints(fromCode, toCode, a.position, b.position)
  const snapped = snapTeHeadSamplesToSkin(samples, a, b, fromCode, toCode, { followLocators })
  if (snapped?.length >= 4) return tautTeHeadOnSkin(snapped, a, b, { followLocators })
  return snapped
}

function snapCurveSamplesToHeadSkin(samples, a, b) {
  return snapTeHeadSamplesToSkin(samples, a, b)
}

function snapTeTempleCurveToSkin(a, b, records, rest = []) {
  const path = rest.length >= 2 ? rest : [a.position, b.position]
  const ordered = [...records].sort((left, right) => (
    closestTOnPolyline(path, left.position) - closestTOnPolyline(path, right.position)
  ))
  return snapTeHeadArcToSkin(a, b, 'TE22', 'TE23', ordered, rest)
}

function snapSiArmShoulderToSkin(a, b, records = [], rest = []) {
  const sideX = (a.position[0] + b.position[0]) / 2
  const path = rest.length >= 2 ? rest : siArmShoulderGuidePoints(a.position, b.position)
  const ordered = [...records].sort((left, right) => (
    closestTOnPolyline(path, left.position) - closestTOnPolyline(path, right.position)
  ))
  const sanitized = ordered
    .map((record) => snapSiHandleToSkin(record, a, b, path))
    .filter(Boolean)
  const hasUserHandles = sanitized.length > 0
  const samples = hasUserHandles
    ? catmullRomThrough(
      [a.position, ...sanitized.map((record) => record.position), b.position],
      16,
    )
    : siArmShoulderGuidePoints(a.position, b.position, 14)
  const points = []
  const previousRef = { current: null }
  const accept = (hit, t) => {
    if (!hit) return
    const ok = hasUserHandles
      ? isSiArmShoulderHandleOk(hit.position, a.position, b.position)
      : isSiArmShoulderHit(hit.position, a.position, b.position, t)
    if (!ok) return
    const lifted = new THREE.Vector3(...hit.position)
      .addScaledVector(new THREE.Vector3(...hit.normal), SKIN_LIFT)
    appendSkinPoint(points, lifted, previousRef)
  }
  accept({ position: a.position, normal: a.normal }, 0)
  for (let index = 1; index < samples.length - 1; index += 1) {
    const t = index / Math.max(1, samples.length - 1)
    const outer = siArmShoulderOuterPoint(a.position, b.position, t)
    const sample = samples[index]
    const side = Math.sign(sideX) || 1
    let probe = sample
    if (!hasUserHandles) {
      const tooMedial = Math.abs(sample[0]) < Math.abs(outer[0]) - 0.003
      const tooAnterior = sample[2] > outer[2] + 0.006
      if (tooMedial || tooAnterior) probe = outer
    }
    const guide = siArmShoulderWrapGuide(probe, side)
    let hit = projectFromOutside(new THREE.Vector3(...probe), guide, 0.03)
      || closestSkinHit(probe, { maxDistance: hasUserHandles ? 0.22 : 0.04, sideX: side, guideNormal: guide })
    if (hasUserHandles) {
      hit = closestSkinHit(sample, { maxDistance: 0.22, sideX: side, guideNormal: guide })
        || closestSkinHit(sample, { maxDistance: 0.38, sideX: side, guideNormal: guide })
        || projectFromOutside(new THREE.Vector3(...sample), guide, 0.45)
        || hit
      if (hit && (
        !isSiArmShoulderHandleOk(hit.position, a.position, b.position)
        || isSiXiaohaiJianzhenAxillaHollow(hit.position, a.position, b.position)
      )) {
        const rescueGuide = siArmShoulderWrapGuide(outer, side)
        const rescued = projectFromOutside(new THREE.Vector3(...outer), rescueGuide, 0.03)
          || closestSkinHit(outer, { maxDistance: 0.22, sideX: side, guideNormal: rescueGuide })
        if (rescued) hit = rescued
      }
    }
    accept(hit, t)
  }
  accept({ position: b.position, normal: b.normal }, 1)
  return points.length >= 3 ? points : null
}

function snapSiHandleToSkin(placed, fromResolved, toResolved, rest = []) {
  if (!placed?.position) return null
  const from = fromResolved.position
  const to = toResolved.position
  const sideX = (from[0] + to[0]) / 2
  const t = rest.length >= 2 ? closestTOnPolyline(rest, placed.position) : 0.5
  const guide = placed.normal || siArmShoulderWrapGuide(placed.position, sideX)
  const hit = closestSkinHit(placed.position, {
    maxDistance: 0.32,
    sideX,
    guideNormal: guide,
  })
    || closestSkinHit(placed.position, {
      maxDistance: 0.5,
      sideX,
      guideNormal: guide,
    })
    || projectFromOutside(new THREE.Vector3(...placed.position), guide, 0.55)
  if (hit && isSiArmShoulderHandleOk(hit.position, from, to)) {
    return { position: hit.position, normal: hit.normal }
  }
  const outer = siArmShoulderOuterPoint(from, to, t)
  const fallbackGuide = siArmShoulderWrapGuide(outer, sideX)
  const fallback = closestSkinHit(outer, { maxDistance: 0.26, sideX, guideNormal: fallbackGuide })
    || projectFromOutside(new THREE.Vector3(...outer), fallbackGuide, 0.4)
  if (fallback && isSiArmShoulderHandleOk(fallback.position, from, to)) {
    return { position: fallback.position, normal: fallback.normal }
  }
  if (fallback) return { position: fallback.position, normal: fallback.normal }
  return { position: [...outer], normal: [...(placed.normal || fallbackGuide)] }
}

function snapGbHandleToSkin(placed, fromResolved, toResolved, rest = []) {
  if (!placed?.position) return null
  const from = fromResolved.position
  const to = toResolved.position
  const sideX = (from[0] + to[0]) / 2
  const span = gbPairSpan(from, to)
  const t = rest.length >= 2 ? closestTOnPolyline(rest, placed.position) : 0.5
  const guide = placed.normal || gbLateralChestGuide(placed.position, sideX)
  const near = Math.max(0.02, span * 0.05)
  const standoff = gbLocatorCastStandoff(from, to)
  const probe = gbLocatorOutsideProbe(placed.position, from, to)
  const legalHit = (hit) => hit && isGbJianjingYuanyeHandleOk(hit.position, from, to)
  const nearHit = closestSkinHit(placed.position, {
    maxDistance: near,
    sideX,
    guideNormal: guide,
  })
  const hit = legalHit(nearHit)
    ? nearHit
    : projectFromOutsideHits(new THREE.Vector3(...probe), guide, standoff).find(legalHit)
      || projectFromOutsideHits(new THREE.Vector3(...placed.position), guide, standoff).find(legalHit)
      || null
  if (hit) {
    return { position: hit.position, normal: hit.normal }
  }
  // Keep a legal 側胸 drag. Never rescue onto the default corridor — that
  // pinned the black dots while the user pulled them to the right.
  if (isGbJianjingYuanyeHandleOk(placed.position, from, to)) {
    return { position: [...placed.position], normal: [...(placed.normal || guide)] }
  }
  const outer = gbJianjingYuanyeOuterPoint(from, to, t)
  const fallbackGuide = gbLateralChestGuide(outer, sideX)
  const fallback = closestSkinHit(outer, {
    maxDistance: Math.max(0.08, span * 0.18),
    sideX,
    guideNormal: fallbackGuide,
  })
    || projectFromOutside(new THREE.Vector3(...outer), fallbackGuide, standoff)
  if (fallback && isGbJianjingYuanyeHandleOk(fallback.position, from, to)) {
    return { position: fallback.position, normal: fallback.normal }
  }
  return null
}

function snapGbJianjingYuanyeToSkin(a, b, records = [], rest = []) {
  const sideX = (a.position[0] + b.position[0]) / 2
  const span = gbPairSpan(a.position, b.position)
  const path = rest.length >= 2 ? rest : gbJianjingYuanyeGuidePoints(a.position, b.position)
  const ordered = [...records].sort((left, right) => (
    closestTOnPolyline(path, left.position) - closestTOnPolyline(path, right.position)
  ))
  const sanitized = ordered
    .map((record) => snapGbHandleToSkin(record, a, b, path))
    .filter(Boolean)
  const hasUserHandles = sanitized.length > 0
  const sampleCount = 28
  const samples = hasUserHandles
    ? catmullRomThrough(
      [a.position, ...sanitized.map((record) => record.position), b.position],
      16,
    )
    : gbJianjingYuanyeGuidePoints(a.position, b.position, sampleCount)
  const points = []
  const previousRef = { current: null }
  const probeRadius = Math.max(0.028, span * 0.12)
  const snapRadius = Math.max(0.05, span * 0.22)
  const locatorStandoff = gbLocatorCastStandoff(a.position, b.position)
  const locatorNear = Math.max(0.06, span * 0.14)
  const liftHit = (hit) => new THREE.Vector3(...hit.position)
    .addScaledVector(new THREE.Vector3(...hit.normal), SKIN_LIFT)
  const accept = (hit) => {
    if (!hit) return false
    appendSkinPoint(points, liftHit(hit), previousRef)
    return true
  }
  const hitOk = (hit, t) => {
    if (!hit) return false
    return hasUserHandles
      ? isGbJianjingYuanyeHandleOk(hit.position, a.position, b.position)
      : isGbJianjingYuanyeHit(hit.position, a.position, b.position, t)
  }
  accept({ position: a.position, normal: a.normal })
  for (let index = 1; index < samples.length - 1; index += 1) {
    const t = index / Math.max(1, samples.length - 1)
    const outer = gbJianjingYuanyeOuterPoint(a.position, b.position, t)
    const sample = samples[index]
    const side = Math.sign(sideX) || 1
    if (hasUserHandles) {
      const guide = gbLateralChestGuide(sample, side)
      const probe = gbLocatorOutsideProbe(sample, a.position, b.position)
      const hit = projectFromOutside(new THREE.Vector3(...probe), guide, locatorStandoff)
        || projectFromOutside(new THREE.Vector3(...sample), guide, locatorStandoff)
        || closestSkinHit(sample, { maxDistance: locatorNear, sideX: side, guideNormal: guide })
      // Locators are the path. Always emit a point under the curve; never
      // rescue onto the default mid-axillary corridor, and never drop the
      // sample (that left a jagged ribbon while the black dots moved).
      if (hit) accept(hit)
      else accept({ position: [...sample], normal: [...guide] })
      continue
    }
    let probe = sample
    const tooMedial = Math.abs(sample[0]) < Math.abs(outer[0]) - span * 0.012
    const tooAnterior = sample[2] > outer[2] + span * 0.08
    const tooLateral = Math.abs(sample[0]) > Math.abs(outer[0]) + span * 0.12
    const tooPosterior = sample[2] < outer[2] - span * 0.10
    if (tooMedial || tooAnterior || tooLateral || tooPosterior) probe = outer
    const guide = gbLateralChestGuide(probe, side)
    const rescueGuide = gbLateralChestGuide(outer, side)
    let hit = projectFromOutside(new THREE.Vector3(...probe), guide, probeRadius)
      || closestSkinHit(probe, { maxDistance: snapRadius, sideX: side, guideNormal: guide })
    if (!hitOk(hit, t) || (hit && isGbAxillaHollow(hit.position, a.position, b.position))) {
      hit = projectFromOutside(new THREE.Vector3(...outer), rescueGuide, probeRadius)
        || closestSkinHit(outer, { maxDistance: Math.max(0.22, span), sideX: side, guideNormal: rescueGuide })
        || projectFromOutside(new THREE.Vector3(...outer), rescueGuide, Math.max(0.08, span * 0.4))
      if (!hitOk(hit, t)) {
        hit = { position: [...outer], normal: [...rescueGuide] }
      }
    }
    if (hitOk(hit, t)) accept(hit)
  }
  accept({ position: b.position, normal: b.normal })
  return points.length >= 3 ? points : null
}

/** 陰谷→長強: posterior thigh, then a straight diagonal into the natal cleft. */
function snapKiYinguChangqiangToSkin(a, b) {
  const start = new THREE.Vector3(...a.position)
  const end = new THREE.Vector3(...b.position)
  const span = Math.max(start.distanceTo(end), 1e-6)
  const count = Math.min(64, Math.max(20, Math.ceil(span / Math.max(statureWorld(0.007), span * 0.04)) + 10))
  const standoff = kiYinguChangqiangCastStandoff(a.position, b.position)
  const extraReach = Math.max(standoff * 1.25, statureWorld(0.08))
  const lift = statureWorld(SKIN_LIFT)
  const xSlack = Math.max(statureWorld(0.008), span * 0.05)
  const points = []
  const previousRef = { current: null }
  const liftHit = (hit) => new THREE.Vector3(...hit.position)
    .addScaledVector(new THREE.Vector3(...hit.normal), lift)
  const legal = (hit, t, outer) => {
    if (!hit) return false
    if (!isKiYinguChangqiangHit(hit.position, a.position, b.position, t)) return false
    return Math.abs(hit.position[0]) <= Math.abs(outer[0]) + xSlack
  }
  const accept = (hit) => {
    if (!hit) return false
    appendSkinPoint(points, liftHit(hit), previousRef)
    return true
  }
  accept({ position: a.position, normal: a.normal })
  for (let index = 1; index < count - 1; index += 1) {
    const t = index / (count - 1)
    const outer = kiYinguChangqiangOuterPoint(a.position, b.position, t)
    const guide = kiYinguChangqiangGuide(a.position, b.position, t)
    const probe = [
      outer[0] + guide[0] * standoff,
      outer[1] + guide[1] * standoff,
      outer[2] + guide[2] * standoff,
    ]
    let hit = projectFromOutside(new THREE.Vector3(...probe), guide, standoff)
      || projectFromOutside(new THREE.Vector3(...outer), guide, extraReach)
    if (!legal(hit, t, outer)) {
      const innerT = Math.min(1, t + (1 - KI_YINGU_CHANGQIANG_FOLD_T) * 0.18)
      const inner = kiYinguChangqiangOuterPoint(a.position, b.position, innerT)
      hit = projectFromOutside(new THREE.Vector3(...inner), guide, extraReach)
      if (!legal(hit, t, outer)) hit = null
    }
    if (!hit && t < KI_YINGU_CHANGQIANG_FOLD_T) {
      hit = closestSkinHit(outer, {
        maxDistance: extraReach,
        sideX: a.position[0],
        preferPosterior: true,
        guideNormal: guide,
      })
      if (!legal(hit, t, outer)) hit = null
    }
    if (hit) accept(hit)
  }
  accept({ position: b.position, normal: b.normal })
  if (points.length < 3) return null
  const arrays = points.map((point) => [point.x, point.y, point.z])
  const simplified = simplifyPolylineWithNormals(
    arrays,
    arrays.map(() => [0, 0, -1]),
    statureWorld(0.0025),
  )
  return simplified.points.map((point) => new THREE.Vector3(...point))
}

/** 承靈→腦空: stay on the parietal–occipital scalp, not the hair bun or air. */
function snapGbChenglingNaokongToSkin(a, b) {
  const start = new THREE.Vector3(...a.position)
  const end = new THREE.Vector3(...b.position)
  const span = Math.max(start.distanceTo(end), 1e-6)
  const count = Math.min(56, Math.max(18, Math.ceil(span / Math.max(statureWorld(0.005), span * 0.04)) + 8))
  const standoff = gbChenglingNaokongCastStandoff(a.position, b.position)
  const extraReach = Math.max(standoff * 1.5, statureWorld(0.07))
  const lift = statureWorld(SKIN_LIFT)
  const points = []
  const previousRef = { current: null }
  const liftHit = (hit) => new THREE.Vector3(...hit.position)
    .addScaledVector(new THREE.Vector3(...hit.normal), lift)
  const pickHit = (hits, t, chord) => {
    const legal = (hits || []).filter((hit) => (
      isGbChenglingNaokongHit(hit.position, a.position, b.position, t)
    ))
    if (!legal.length) return null
    legal.sort((left, right) => {
      const dLeft = dist3(left.position, chord)
      const dRight = dist3(right.position, chord)
      return dLeft - dRight
    })
    return legal[0]
  }
  const accept = (hit) => {
    if (!hit) return false
    appendSkinPoint(points, liftHit(hit), previousRef)
    return true
  }
  accept({ position: a.position, normal: a.normal })
  for (let index = 1; index < count - 1; index += 1) {
    const t = index / (count - 1)
    const outer = gbChenglingNaokongOuterPoint(a.position, b.position, t)
    const guide = gbChenglingNaokongGuide(a.position, b.position, t)
    const probe = [
      outer[0] + guide[0] * standoff,
      outer[1] + guide[1] * standoff,
      outer[2] + guide[2] * standoff,
    ]
    let hit = pickHit(
      projectFromOutsideHits(new THREE.Vector3(...probe), guide, standoff),
      t,
      outer,
    ) || pickHit(
      projectFromOutsideHits(new THREE.Vector3(...outer), guide, extraReach),
      t,
      outer,
    )
    if (!hit) {
      const closest = closestSkinHit(outer, {
        maxDistance: extraReach,
        sideX: a.position[0],
        guideNormal: guide,
      })
      if (closest && isGbChenglingNaokongHit(closest.position, a.position, b.position, t)) {
        hit = closest
      }
    }
    if (hit) accept(hit)
  }
  accept({ position: b.position, normal: b.normal })
  if (points.length < 3) return null
  const arrays = points.map((point) => [point.x, point.y, point.z])
  const simplified = simplifyPolylineWithNormals(
    arrays,
    arrays.map(() => gbChenglingNaokongGuide(a.position, b.position, 0.5)),
    statureWorld(0.003),
  )
  return simplified.points.map((point) => new THREE.Vector3(...point))
}

function skinSegmentPoints(a, b, {
  allowGeodesic = true,
  preferWrap = false,
  earArc = false,
  teTemple = false,
  fromCode = '',
  toCode = '',
} = {}) {
  const start = new THREE.Vector3(...a.position)
  const end = new THREE.Vector3(...b.position)
  let normal = new THREE.Vector3(...a.normal).normalize()
  const endNormal = new THREE.Vector3(...b.normal).normalize()
  const normalDot = normal.dot(endNormal)
  const totalDist = Math.max(start.distanceTo(end), 1e-6)
  const sideX = (a.position[0] + b.position[0]) / 2
  const siArmShoulder = isSiXiaohaiJianzhenPair(fromCode, toCode)
  const gbShoulderAxilla = isGbShoulderAxillaSpan(fromCode, toCode, a.position, b.position)
  const kiYingu = isKiYinguChangqiangPair(fromCode, toCode)
  const gbScalp = isGbChenglingNaokongPair(fromCode, toCode)
  const duBack = isDuBackWrapPair(fromCode, toCode) && shouldPosteriorWrap(a.position, b.position)
  const teHead = isTeHeadPair(fromCode, toCode)
  if (siArmShoulder) {
    const wrapped = snapSiArmShoulderToSkin(a, b)
    if (wrapped?.length >= 3) return wrapped
  }
  if (gbShoulderAxilla) {
    const wrapped = snapGbJianjingYuanyeToSkin(a, b)
    if (wrapped?.length >= 3) return wrapped
  }
  if (kiYingu) {
    const wrapped = snapKiYinguChangqiangToSkin(a, b)
    if (wrapped?.length >= 3) return wrapped
  }
  if (gbScalp) {
    const wrapped = snapGbChenglingNaokongToSkin(a, b)
    if (wrapped?.length >= 3) return wrapped
  }
  if (teHead) {
    const arced = snapTeHeadArcToSkin(a, b, fromCode, toCode)
    if (arced?.length >= 3) return arced
  }
  const digitTip = isDigitTipWrap(a.position, b.position, normalDot)
  if (digitTip) {
    const wrapped = snapDigitTipWrap(a, b)
    if (wrapped?.length >= 2) return wrapped
    return [
      start.clone().addScaledVector(normal, SKIN_LIFT),
      end.clone().addScaledVector(endNormal, SKIN_LIFT),
    ]
  }
  const facingLimb = !siArmShoulder && !gbShoulderAxilla && !kiYingu && !gbScalp && isFacingLimbSpan(a.position, b.position, normalDot)
  if (facingLimb) {
    const facing = snapFacingChordToSkin(a, b)
    if (facing?.length >= 2) return facing
  }
  const gvFace = isGvFacePair(fromCode, toCode)
  const gvOcciput = isGvOcciputPair(fromCode, toCode)
  const cvAnterior = isCvAnteriorPair(fromCode, toCode)
  if (gvFace || gvOcciput || cvAnterior) {
    const wrapped = snapMidlineChordToSkin(a, b, {
      followProfile: gvFace || gvOcciput,
      keepStraight: cvAnterior || gvFace || gvOcciput,
      fromBack: gvOcciput,
    })
    if (wrapped?.length >= 2) return wrapped
  }
  const mustWrap = !siArmShoulder && !gbShoulderAxilla && !kiYingu && !gbScalp && !teHead && !facingLimb && !digitTip && !gvFace && !gvOcciput && !cvAnterior && (
    preferWrap
    || pairPrefersWrap(fromCode, toCode, a.position, b.position)
  )
  if (mustWrap) {
    const wrapped = snapChordSamplesToSkin(a, b)
    if (wrapped?.length >= 2) return wrapped
  }
  if (allowGeodesic && !mustWrap && !duBack && !siArmShoulder && !gbShoulderAxilla && !kiYingu && !gbScalp && !teHead && !facingLimb && !digitTip && !gvFace && !gvOcciput && !cvAnterior) {
    const geodesic = geodesicOnSkin(a, b)
    const stable = earArc
      ? (geodesicIsStable(geodesic, TE_EAR_GEODESIC_STABLE) || geodesic?.length >= 6)
      : geodesicIsStable(geodesic)
    const midlineOk = !isSagittalMidlineSpan(a.position, b.position)
      || !geodesic
      || geodesic.every((point) => {
        const sample = point?.isVector3 ? toArray(point) : point
        return hitStaysOnFrontMidline(sample, a.position, b.position)
      })
    if (geodesic && stable && midlineOk) return geodesic
  }
  let pos = start.clone()
  // Convex wrap: the 3D chord is inside the head or shoulder. Snap samples
  // onto the outer skin so the line does not vanish into the mesh.
  if (!siArmShoulder && !gbShoulderAxilla && !kiYingu && !gbScalp && !duBack && !teHead && !facingLimb && !digitTip && !gvFace && !gvOcciput && !cvAnterior && useConvexChordWrap(normalDot) && chordDivesThroughSkin(a, b)) {
    const wrapped = snapChordSamplesToSkin(a, b)
    if (wrapped?.length >= 2) return wrapped
  }
  const stepLen = surfaceStepLength(totalDist, normalDot)
  const standoff = marchStandoff(normalDot)
  const maxSteps = Math.max(36, Math.ceil(totalDist / stepLen) * 6 + 48)
  const hintVec = end.clone().sub(start)
  const hint = hintVec.lengthSq() > 1e-8 ? hintVec.normalize() : new THREE.Vector3(0, 1, 0)

  const raw = [pos.clone().addScaledVector(normal, SKIN_LIFT)]

  for (let step = 0; step < maxSteps; step += 1) {
    const toEnd = end.clone().sub(pos)
    const remaining = toEnd.length()
    if (remaining < stepLen * 0.85) break

    let tangent = toEnd.clone().addScaledVector(normal, -toEnd.dot(normal))
    if (tangent.lengthSq() < 1e-10 || tangent.length() < remaining * 0.18) {
      let axis = new THREE.Vector3().crossVectors(normal, endNormal)
      if (axis.lengthSq() < 1e-8) axis.crossVectors(normal, hint)
      if (axis.lengthSq() < 1e-8) axis.set(0, 1, 0).cross(normal)
      axis.normalize()
      tangent = new THREE.Vector3().crossVectors(axis, normal)
      if (tangent.dot(toEnd) < 0) tangent.negate()
      const along = hint.clone().addScaledVector(normal, -hint.dot(normal))
      if (along.lengthSq() > 1e-8) tangent.lerp(along.normalize(), 0.45)
    }
    tangent.normalize().multiplyScalar(Math.min(stepLen, remaining * 0.4))

    const progress = 1 - remaining / totalDist
    const guide = slerpUnitVectors(
      toArray(normal),
      toArray(endNormal),
      Math.min(0.9, progress + 0.05),
      toArray(hint),
    )
    const probe = pos.clone().add(tangent).addScaledVector(new THREE.Vector3(...guide), standoff)
    let hit = projectFromOutside(probe, guide, standoff)
    if (!hit) {
      hit = projectFromOutside(
        pos.clone().add(tangent).addScaledVector(normal, standoff),
        toArray(normal),
        standoff,
      )
    }

    const maxJump = Math.max(stepLen * 3.5, 0.028)
    if (hit) {
      const next = new THREE.Vector3(...hit.position)
      // Keep the march local — reject torso/finger false hits.
      if (next.distanceTo(pos) <= maxJump && next.distanceTo(end) <= remaining + maxJump) {
        pos.copy(next)
        normal.set(...hit.normal).normalize()
      } else {
        pos.add(tangent)
        const tight = projectFromOutside(pos.clone().addScaledVector(normal, standoff), toArray(normal), standoff)
        if (tight) {
          const tightPos = new THREE.Vector3(...tight.position)
          if (tightPos.distanceTo(pos) <= maxJump) {
            pos.copy(tightPos)
            normal.set(...tight.normal).normalize()
          }
        }
      }
    } else {
      pos.add(tangent)
    }

    raw.push(pos.clone().addScaledVector(normal, SKIN_LIFT))
  }

  raw.push(end.clone().addScaledVector(endNormal, SKIN_LIFT))
  const pruned = pruneBacktracking(raw.map(toArray), toArray(end))
  const snapped = pruned.map((point) => {
    const hit = closestSkinHit(point, { maxDistance: 0.12, sideX, guideNormal: toArray(normal) })
    if (!hit) return new THREE.Vector3(...point)
    return new THREE.Vector3(...hit.position)
      .addScaledVector(new THREE.Vector3(...hit.normal), SKIN_LIFT)
  })
  return fillClippedSpans(snapped, sideX, a.position, b.position)
}

/** Concatenate on-skin marches; never leave floating air samples. */
function joinOnSkin(anchors) {
  if (!anchors.length) return []
  if (anchors.length === 1) return [offsetPosition(resolvedNode(anchors[0]), SKIN_LIFT)]
  const points = []
  const previousRef = { current: null }
  for (let index = 0; index < anchors.length - 1; index += 1) {
    const from = resolvedNode(anchors[index])
    const to = resolvedNode(anchors[index + 1])
    const skipGeodesic = pairPrefersWrap(
      '',
      '',
      from.position,
      to.position,
    ) || isShoulderAxillaWrap(
      from.position,
      to.position,
    ) || isDigitTipWrap(
        from.position,
        to.position,
        new THREE.Vector3(...from.normal).normalize().dot(new THREE.Vector3(...to.normal).normalize()),
      )
    const piece = skinSegmentPoints(
      resolvedNode(anchors[index]),
      resolvedNode(anchors[index + 1]),
      { allowGeodesic: !skipGeodesic },
    )
    if (piece.length < 2) return null
    const start = points.length === 0 ? 0 : 1
    for (let i = start; i < piece.length; i += 1) {
      appendSkinPoint(points, piece[i], previousRef)
    }
  }
  return points.length >= 2 ? points : null
}

function arraysFromSkin(points = []) {
  return points.map((point) => (point?.isVector3 ? toArray(point) : [...point]))
}

function vectorsFromArrays(points = []) {
  return points.map((point) => (point?.isVector3 ? point : new THREE.Vector3(...point)))
}

function preferCleanSkinPath(candidate, fallback, guide = [], maxLengthRatio = 1.85) {
  if (!candidate || candidate.length < 2) return fallback
  const arrays = arraysFromSkin(candidate)
  const pruned = pruneBacktracking(arrays, arrays[arrays.length - 1])
  if (isDisorderedPolyline(pruned, guide, { maxLengthRatio })) {
    return fallback
  }
  return vectorsFromArrays(pruned)
}

function concatSkinPieces(pieces) {
  const points = []
  const previousRef = { current: null }
  for (const piece of pieces) {
    if (!piece || piece.length < 2) return null
    const start = points.length === 0 ? 0 : 1
    for (let index = start; index < piece.length; index += 1) {
      appendSkinPoint(points, piece[index], previousRef)
    }
  }
  return points.length >= 2 ? points : null
}

/** Localizers are extra on-skin points: 穴1 → 點… → 穴2, marched like acupoints. */
function pairDrawnSkinPoints(fromResolved, toResolved, records, rest = null, {
  preview = false,
  preferWrap = false,
  earArc = false,
  teTemple = false,
  siArmShoulder = false,
  gbShoulderAxilla = false,
  fromCode = '',
  toCode = '',
} = {}) {
  const restGuide = rest?.length >= 2 ? rest : null
  const restArrays = restGuide ? arraysFromSkin(restGuide) : []
  const drawSpan = (fromNode, toNode) => skinSegmentPoints(fromNode, toNode, {
    allowGeodesic: (!preview || teTemple || earArc) && !preferWrap && !siArmShoulder && !gbShoulderAxilla,
    preferWrap,
    earArc,
    teTemple,
    fromCode,
    toCode,
  })
  const teHead = isTeHeadPair(fromCode, toCode)
  if (teHead) {
    const usable = keepLocatorsOnPairLimb(fromResolved, toResolved, records, [])
    if (usable.length) {
      const curved = snapTeHeadArcToSkin(
        fromResolved,
        toResolved,
        fromCode,
        toCode,
        usable,
        restArrays,
      )
      if (curved?.length >= 3) return curved
      return vectorsFromArrays(catmullRomThrough(
        [fromResolved.position, ...usable.map((record) => record.position), toResolved.position],
        16,
      ))
    }
    const arced = snapTeHeadArcToSkin(fromResolved, toResolved, fromCode, toCode)
    if (arced?.length >= 3) return arced
  }
  if (teTemple && records.length) {
    const curved = snapTeTempleCurveToSkin(fromResolved, toResolved, records, restArrays)
    if (curved?.length >= 3) return curved
  }
  if (siArmShoulder) {
    const wrapped = snapSiArmShoulderToSkin(fromResolved, toResolved, records, restArrays)
    if (wrapped?.length >= 3) return wrapped
  }
  if (gbShoulderAxilla) {
    const wrapped = snapGbJianjingYuanyeToSkin(fromResolved, toResolved, records, restArrays)
    if (wrapped?.length >= 3) return wrapped
  }
  if (!records.length) {
    return restArrays.length >= 2
      ? vectorsFromArrays(restArrays)
      : drawSpan(fromResolved, toResolved)
  }
  const usable = (siArmShoulder || gbShoulderAxilla || teHead
    ? keepLocatorsOnPairLimb(fromResolved, toResolved, records, [])
    : keepLocatorsOnPairLimb(fromResolved, toResolved, records, restArrays))
  const spans = locatorSpans(restArrays, fromResolved, toResolved, usable)
  const pieces = spans.map((span) => drawSpan(
    {
      position: span.from.position,
      normal: span.from.normal || fromResolved.normal,
    },
    {
      position: span.to.position,
      normal: span.to.normal || toResolved.normal,
    },
  ))
  return concatSkinPieces(pieces) || drawSpan(fromResolved, toResolved)
}

function routeNodeCode(node) {
  if (!node?.pointId) return ''
  return getPoint(node.pointId)?.code || ''
}

function isOmittedSurfacePair(pair) {
  const fromCode = routeNodeCode(pair.fromNode)
  const toCode = routeNodeCode(pair.toNode)
  if (isOmittedSurfaceSpan(fromCode, toCode)) return true
  if (isRenDuCodePair(fromCode, toCode)) return false
  return !sameSpatialSide(resolvedNode(pair.fromNode), resolvedNode(pair.toNode))
}

function pairKey(pair) {
  return `${pair.fromPointId}|${pair.toPointId}`
}

function drawPairSkinSegment(route, pair, override = null) {
  const a = resolvedNode(pair.fromNode)
  const b = resolvedNode(pair.toNode)
  const isOverride = override
    && pair.fromNode.pointId === override.fromPointId
    && pair.toNode.pointId === override.toPointId
  const rest = isOverride && override.rest
    ? override.rest
    : restPathArrays(pair.fromNode, pair.toNode)
  const fromCode = routeNodeCode(pair.fromNode)
  const toCode = routeNodeCode(pair.toNode)
  if (!meridianUsesLocators(route.meridianId)
    || isKiYinguChangqiangPair(fromCode, toCode)
    || isGbChenglingNaokongPair(fromCode, toCode)) {
    return vectorsFromArrays(rest)
  }
  const count = visibleHandleCount(
    polylineArcLength(rest),
    shortSegmentReferenceArc(route.side),
    pair.handles.length,
  )
  const records = isOverride && override.records
    ? override.records
    : pairHandleRecords(pair.fromNode, pair.toNode, pair.handles, count, rest)
  const teTemple = isTeTempleHandlePair(fromCode, toCode)
  const earArc = isTeEarArcPair(fromCode, toCode)
  const siArmShoulder = isSiXiaohaiJianzhenPair(fromCode, toCode)
  const gbShoulderAxilla = isGbShoulderAxillaSpan(fromCode, toCode, a.position, b.position)
  return pairDrawnSkinPoints(a, b, records, rest, {
    preview: Boolean(isOverride && override.preview) && !teTemple && !earArc && !siArmShoulder && !gbShoulderAxilla,
    preferWrap: pairPrefersWrap(fromCode, toCode, a.position, b.position),
    earArc,
    teTemple,
    siArmShoulder,
    gbShoulderAxilla,
    fromCode,
    toCode,
  })
}

/** One or more on-skin polylines. Omitted spans (BL40–BL41, ST8–ST9, KI10–KI11) start a new run. */
function skinCurveRuns(route, override = null) {
  const pairRuns = appendExtraPairsToRuns(
    drawableSurfacePairRuns(consecutiveAcupointPairs(route), isOmittedSurfacePair),
    extraMeridianPairs(route),
  )
  return pairRuns.map((pairs) => {
    const points = []
    const pairKeys = []
    const previousRef = { current: null }
    pairs.forEach((pair) => {
      const segment = drawPairSkinSegment(route, pair, override)
      if (!segment?.length) return
      const start = points.length === 0 ? 0 : 1
      for (let i = start; i < segment.length; i += 1) {
        appendSkinPoint(points, segment[i], previousRef)
      }
      pairKeys.push(pairKey(pair))
    })
    return { points, pairKeys }
  }).filter((run) => run.points.length >= 2)
}

function restPathArrays(fromNode, toNode) {
  const a = resolvedNode(fromNode)
  const b = resolvedNode(toNode)
  const fromCode = routeNodeCode(fromNode)
  const toCode = routeNodeCode(toNode)
  const teTemple = isTeTempleHandlePair(fromCode, toCode)
  const earArc = isTeEarArcPair(fromCode, toCode)
  const siArmShoulder = isSiXiaohaiJianzhenPair(fromCode, toCode)
  const gbShoulderAxilla = isGbShoulderAxillaSpan(fromCode, toCode, a.position, b.position)
  const key = geodesicCacheKey(a, b)
  const reverseKey = geodesicCacheKey(b, a)
  const usableCached = (cached) => {
    if (!cached?.length) return false
    if (siArmShoulder) {
      if (isDisorderedPolyline(cached, [a.position, b.position], { maxLengthRatio: 1.55 })) return false
      const mid = cached[Math.floor(cached.length / 2)]
      return Boolean(mid) && isSiArmShoulderHit(mid, a.position, b.position)
    }
    if (gbShoulderAxilla) {
      if (isDisorderedPolyline(cached, [a.position, b.position], { maxLengthRatio: 1.7 })) return false
      const mid = cached[Math.floor(cached.length / 2)]
      return Boolean(mid) && isGbJianjingYuanyeHit(mid, a.position, b.position)
    }
    if (isDuBackWrapPair(fromCode, toCode) && shouldPosteriorWrap(a.position, b.position)) {
      const mid = cached[Math.floor(cached.length / 2)]
      const ceiling = Math.max(a.position[2], b.position[2]) + 0.04
      return Boolean(mid) && mid[2] <= ceiling
    }
    if (isKiYinguChangqiangPair(fromCode, toCode)) {
      const mid = cached[Math.floor(cached.length / 2)]
      return Boolean(mid) && isKiYinguChangqiangHit(mid, a.position, b.position, 0.5)
    }
    if (isGbChenglingNaokongPair(fromCode, toCode)) {
      const mid = cached[Math.floor(cached.length / 2)]
      return Boolean(mid) && isGbChenglingNaokongHit(mid, a.position, b.position, 0.5)
    }
    return true
  }
  if (restPathCache.has(key) && usableCached(restPathCache.get(key))) {
    return restPathCache.get(key).map((point) => [...point])
  }
  if (restPathCache.has(reverseKey) && usableCached(restPathCache.get(reverseKey))) {
    return restPathCache.get(reverseKey).map((point) => [...point]).reverse()
  }
  const points = skinSegmentPoints(a, b, {
    earArc,
    teTemple,
    fromCode,
    toCode,
  }).map(toArray)
  restPathCache.set(key, points)
  return points.map((point) => [...point])
}

function invalidatePairPathCache(fromNode, toNode) {
  const a = resolvedNode(fromNode)
  const b = resolvedNode(toNode)
  const key = geodesicCacheKey(a, b)
  const reverseKey = geodesicCacheKey(b, a)
  restPathCache.delete(key)
  restPathCache.delete(reverseKey)
  geodesicCache.delete(key)
  geodesicCache.delete(reverseKey)
}

function lu34Pair(side) {
  const lu3 = state.acupoints.find((point) => point.code === 'LU3' && (!side || point.side === side))
    || state.acupoints.find((point) => point.code === 'LU3')
  if (!lu3) return null
  const lu4 = state.acupoints.find((point) => point.code === 'LU4' && point.side === lu3.side)
    || state.acupoints.find((point) => point.code === 'LU4')
  return lu4 ? { lu3, lu4 } : null
}

/** 天府–俠白 rest-path arc; fallback when those points are missing. */
function shortSegmentReferenceArc(side) {
  const pair = lu34Pair(side) || lu34Pair(null)
  const fingerprint = pair
    ? `${pair.lu3.id}:${pair.lu3.position.join(',')}:${pair.lu4.position.join(',')}`
    : 'missing'
  const key = `${side || 'any'}|${fingerprint}`
  if (shortArcCache?.[key] != null) return shortArcCache[key]
  const value = pair
    ? polylineArcLength(restPathArrays(pair.lu3, pair.lu4))
    : FALLBACK_SHORT_SEGMENT_ARC
  const resolved = Number.isFinite(value) && value > 1e-4 ? value : FALLBACK_SHORT_SEGMENT_ARC
  shortArcCache = { [key]: resolved }
  return resolved
}

function snapHandleToSkin(placed, fromNode, toNode) {
  if (!placed?.position) return placed
  const from = resolvedNode(fromNode)
  const to = resolvedNode(toNode)
  if (isSiXiaohaiJianzhenPair(routeNodeCode(fromNode), routeNodeCode(toNode))) {
    return snapSiHandleToSkin(placed, from, to, restPathArrays(fromNode, toNode)) || placed
  }
  if (isGbShoulderAxillaSpan(routeNodeCode(fromNode), routeNodeCode(toNode), from.position, to.position)) {
    return snapGbHandleToSkin(placed, from, to, restPathArrays(fromNode, toNode)) || placed
  }
  const sideX = pairSideX(fromNode, toNode)
  return closestSkinHit(placed.position, {
    maxDistance: statureWorld(HANDLE_SKIN_SNAP_RADIUS),
    sideX,
    guideNormal: placed.normal,
  }) || projectNearSurface(placed.position, placed.normal, statureWorld(HANDLE_SKIN_SNAP_RADIUS)) || placed
}

function restPathAnchor(fromNode, toNode, rest, t) {
  const clamped = clampHandleT(t)
  const position = pointAtPolylineT(rest, clamped)
  const normal = slerpUnitVectors(
    resolvedNode(fromNode).normal,
    resolvedNode(toNode).normal,
    clamped,
  )
  return snapHandleToSkin({ position, normal }, fromNode, toNode)
}

function segmentHandlePosition(fromNode, toNode, handle, rest = restPathArrays(fromNode, toNode)) {
  const from = resolvedNode(fromNode)
  const to = resolvedNode(toNode)
  const trustsLocators = pairKeepsOffPathLocators(routeNodeCode(fromNode), routeNodeCode(toNode))
  if (handle?.position && (trustsLocators || locatorOnPairLimb(from, to, handle, rest))) {
    return snapHandleToSkin({ position: handle.position, normal: handle.normal }, fromNode, toNode)
  }
  const t = 0.5
  return restPathAnchor(fromNode, toNode, rest, t)
}

function pairWaypoints(fromNode, toNode, handles, count, rest) {
  const ignoreMirror = pairKeepsOffPathLocators(routeNodeCode(fromNode), routeNodeCode(toNode))
  const slots = resolveHandleSlots(
    keepLocatorsOnPairLimb(
      resolvedNode(fromNode),
      resolvedNode(toNode),
      handles,
      ignoreMirror ? [] : rest,
    ),
    count,
    rest,
  )
  const defaults = defaultHandleTs(count)
  return slots.map((handle, index) => {
    if (handle) return segmentHandlePosition(fromNode, toNode, handle, rest)
    return restPathAnchor(fromNode, toNode, rest, defaults[index])
  })
}

function pairHandleRecords(fromNode, toNode, handles, count, rest) {
  const from = resolvedNode(fromNode)
  const to = resolvedNode(toNode)
  const ignoreMirror = pairKeepsOffPathLocators(routeNodeCode(fromNode), routeNodeCode(toNode))
  const slots = resolveHandleSlots(
    keepLocatorsOnPairLimb(from, to, handles, ignoreMirror ? [] : rest),
    count,
    rest,
  )
  const defaults = defaultHandleTs(count)
  return slots.map((handle, index) => {
    const placed = handle
      ? segmentHandlePosition(fromNode, toNode, handle, rest)
      : restPathAnchor(fromNode, toNode, rest, defaults[index])
    return {
      type: 'control',
      pointId: null,
      position: [...placed.position],
      normal: [...placed.normal],
      style: handle?.style || 'along',
    }
  })
}

/** Polyline curve that stays exactly on the sampled skin points (no shortcut chords). */
function createPolylineCurve(points) {
  const curve = new THREE.Curve()
  const lengths = [0]
  for (let i = 1; i < points.length; i += 1) {
    lengths.push(lengths[i - 1] + points[i - 1].distanceTo(points[i]))
  }
  const total = lengths[lengths.length - 1] || 1
  curve.getPoint = (t, optionalTarget = new THREE.Vector3()) => {
    const distance = Math.min(1, Math.max(0, t)) * total
    let index = 0
    while (index < lengths.length - 2 && lengths[index + 1] < distance) index += 1
    const startLen = lengths[index]
    const endLen = lengths[index + 1] ?? startLen
    const span = Math.max(endLen - startLen, 1e-8)
    const localT = (distance - startLen) / span
    return optionalTarget.copy(points[index]).lerp(points[Math.min(index + 1, points.length - 1)], localT)
  }
  return curve
}

/**
 * Skin decal shader. Vertices sit on the skin; the strip is widened here,
 * across the view direction, so its screen width is stable and it cannot
 * twist. Nothing is pushed outward along the surface normal beyond `uLift`,
 * and the surface-normal fade stops the strip reaching past the silhouette.
 */
const SKIN_DECAL_VERTEX = /* glsl */`
attribute vec3 aOffset;
attribute vec3 aTangent;
attribute float aSign;
uniform float uWidth;
uniform float uMinPixels;
uniform float uPixelScale;
uniform float uOrthoPixel;
uniform float uIsOrtho;
uniform float uLift;
varying float vCoverage;
varying vec3 vSurfaceNormal;
varying vec3 vViewDirection;

void main() {
  vec3 anchor = position + normal * uLift;
  vec4 centre = modelViewMatrix * vec4(anchor, 1.0);
  float viewDepth = max(-centre.z, 1e-4);
  float pixel = mix(viewDepth * uPixelScale, uOrthoPixel, uIsOrtho);
  float inkHalf = uWidth * 0.5;
  float floorHalf = uMinPixels * pixel * 0.5;
  float drawHalf = max(inkHalf, floorHalf);
  // Widening to the pixel floor must not add ink: give back the coverage.
  vCoverage = drawHalf > 0.0 ? clamp(inkHalf / drawHalf, 0.0, 1.0) : 1.0;

  vec3 toEye = normalize(cameraPosition - anchor);
  vec3 across = cross(aTangent, toEye);
  float reach = length(across);
  // Where the path runs at the camera there is no stable screen side; fall
  // back to the tangent-plane direction, which is still on the skin.
  vec3 side = reach > 0.2 ? (across / reach) * aSign : aOffset;

  vec4 view = modelViewMatrix * vec4(anchor + side * drawHalf, 1.0);
  vSurfaceNormal = normalize(normalMatrix * normal);
  vViewDirection = -view.xyz;
  gl_Position = projectionMatrix * view;
}
`

const SKIN_DECAL_FRAGMENT = /* glsl */`
uniform vec3 uColor;
uniform float uOpacity;
uniform float uFade;
varying float vCoverage;
varying vec3 vSurfaceNormal;
varying vec3 vViewDirection;

void main() {
  float facing = abs(dot(normalize(vSurfaceNormal), normalize(vViewDirection)));
  float alpha = uOpacity * vCoverage * smoothstep(0.0, uFade, facing);
  if (alpha < 0.008) discard;
  gl_FragColor = vec4(uColor, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`

function skinLiftWorld() {
  return worldPerMillimetre(bodyHeightWorld) * skinLiftMm
}

function ribbonWidthWorld() {
  return worldPerMillimetre(bodyHeightWorld) * ribbonWidthMm
}

function markerDiameterWorld() {
  return worldPerMillimetre(bodyHeightWorld) * markerDiameterMm
}

/**
 * @param {number|string} color
 * @param {{ opacity?: number, widthWorld?: number, minPixels?: number, depthOffset?: number }} options
 */
function createSkinDecalMaterial(color, {
  opacity = 1,
  widthWorld = 0,
  minPixels = 0,
  depthOffset = -2,
} = {}) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
      uWidth: { value: widthWorld },
      uMinPixels: { value: minPixels },
      uPixelScale: { value: perspectivePixelScale(45, 1) },
      uOrthoPixel: { value: 0.001 },
      uIsOrtho: { value: 0 },
      uLift: { value: skinLiftWorld() },
      uFade: { value: 0.14 },
    },
    vertexShader: SKIN_DECAL_VERTEX,
    fragmentShader: SKIN_DECAL_FRAGMENT,
    transparent: true,
    depthTest: true,
    // Zero offset means the strip is coplanar with the skin; depth bias, not a
    // world-space lift, is what keeps it visible.
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: depthOffset,
    polygonOffsetUnits: depthOffset,
    toneMapped: true,
  })
  skinDecalMaterials.add(material)
  return material
}

function disposeSkinDecalMaterial(material) {
  if (!material) return
  skinDecalMaterials.delete(material)
  material.dispose?.()
}

function skinDecalGeometry(attributes) {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(attributes.position, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(attributes.normal, 3))
  geometry.setAttribute('aOffset', new THREE.BufferAttribute(attributes.offset, 3))
  geometry.setAttribute('aTangent', new THREE.BufferAttribute(attributes.tangent, 3))
  geometry.setAttribute('aSign', new THREE.BufferAttribute(attributes.sign, 1))
  geometry.setIndex(new THREE.BufferAttribute(attributes.index, 1))
  geometry.computeBoundingSphere()
  return geometry
}

function quantizeKey(point) {
  const value = point?.isVector3 ? [point.x, point.y, point.z] : point
  return `${Number(value[0]).toFixed(4)},${Number(value[1]).toFixed(4)},${Number(value[2]).toFixed(4)}`
}

function trimCache(cache, limit) {
  while (cache.size > limit) {
    const oldest = cache.keys().next().value
    cache.delete(oldest)
  }
}

/**
 * Resample a run to the current quality and pull every sample onto the skin.
 * Dragging uses the coarse step so a preview stays interactive; the settled
 * rebuild refines it.
 */
function conformRunToSkin(points) {
  const scale = Math.max(statureScale(), 1e-3)
  const step = sampleStepForQuality(dragging ? 'coarse' : 'fine') * scale
  const snap = 0.02 * scale
  const pull = MAX_CONFORM_PULL * scale
  const mid = points[Math.floor(points.length / 2)]
  const key = [
    points.length,
    step,
    quantizeKey(points[0]),
    quantizeKey(mid),
    quantizeKey(points[points.length - 1]),
  ].join('|')
  const cached = conformCache.get(key)
  if (cached) return cached
  const dense = densifyPath(points.map((point) => toArray(point)), step)
  const start = toArray(points[0])
  const end = toArray(points[points.length - 1])
  const lockMidlineX = Math.abs(start[0]) <= statureWorld(0.02)
    && Math.abs(end[0]) <= statureWorld(0.02)
  // Two passes: nearest-point first, only to learn a stable normal per sample,
  // then drop each sample along that normal so the drawn line keeps the
  // authored route instead of sliding toward whichever crease wall is nearer.
  const estimate = conformPath(dense, (point) => nearestSurfaceFrame(point, null, snap), { maxPull: pull })
  const guides = smoothPathNormals(estimate.normals, 2)
  const conformed = conformPath(dense, (point, guide) => surfaceFrameAt(point, guide, snap), {
    guides,
    maxPull: pull,
  })
  const run = {
    points: conformed.points.map((point, index) => {
      const placed = conformed.resolved[index] ? point : estimate.points[index]
      // 任督 x=0: nearest-point conform otherwise slides into the breasts
      // at the xiphoid dip and makes 鳩尾–巨闕 look crooked from the front.
      if (!lockMidlineX || !placed) return placed
      return [dense[index][0], placed[1], placed[2]]
    }),
    normals: smoothPathNormals(conformed.normals, 2),
    unresolved: conformed.resolved.reduce(
      (total, ok, index) => (ok || estimate.resolved[index] ? total : total + 1),
      0,
    ),
    tangentWindow: tangentWindow(step),
  }
  conformCache.set(key, run)
  trimCache(conformCache, 400)
  return run
}

const ribbonRayScratch = {
  onRay: new THREE.Vector3(),
  onSegment: new THREE.Vector3(),
}

/** Click target for a strip whose width only exists in the vertex shader. */
function ribbonPickRadius(distance) {
  return Math.max(ribbonWidthWorld(), pixelSizeToWorld(5, distance))
}

function raycastSkinRibbon(raycaster, intersects) {
  const points = this.userData?.tubePoints
  if (!this.visible || !points || points.length < 2) return
  let best = null
  for (let index = 1; index < points.length; index += 1) {
    const distanceSq = raycaster.ray.distanceSqToSegment(
      points[index - 1],
      points[index],
      ribbonRayScratch.onRay,
      ribbonRayScratch.onSegment,
    )
    const along = ribbonRayScratch.onRay.distanceTo(raycaster.ray.origin)
    const radius = ribbonPickRadius(along)
    if (distanceSq > radius * radius) continue
    if (best && along >= best.distance) continue
    best = {
      distance: along,
      point: ribbonRayScratch.onSegment.clone(),
      object: this,
    }
  }
  if (best) intersects.push(best)
}

function createMeridianLine(points, color) {
  const run = conformRunToSkin(points)
  const mesh = new THREE.Mesh(
    skinDecalGeometry(buildRibbonAttributes(run.points, run.normals, run.tangentWindow)),
    createSkinDecalMaterial(color, {
      widthWorld: ribbonWidthWorld(),
      minPixels: RIBBON_MIN_PIXELS,
      depthOffset: -4,
    }),
  )
  mesh.renderOrder = 2
  mesh.frustumCulled = false
  mesh.raycast = raycastSkinRibbon
  mesh.userData.tubePoints = run.points.map((point) => new THREE.Vector3(...point))
  mesh.userData.lineWidth = FIXED_LINE_WIDTH
  mesh.userData.unresolvedSamples = run.unresolved
  return mesh
}

function disposeRouteLine(line) {
  annotationGroup.remove(line)
  line.geometry?.dispose?.()
  disposeSkinDecalMaterial(line.material)
}

function addRouteLineVisuals(route, runs = []) {
  const color = meridianLineColor(route.meridianId)
  runs.forEach((run) => {
    const points = run.points || run
    if (!points || points.length < 2) return
    const mesh = createMeridianLine(points, color)
    mesh.userData.type = 'meridian'
    mesh.userData.id = route.id
    if (run.pairKeys) mesh.userData.pairKeys = run.pairKeys
    annotationGroup.add(mesh)
    routeVisuals.push({ line: mesh, route })
  })
}

function replaceRouteLine(routeId, runs) {
  const route = routeVisuals.find((entry) => entry.route.id === routeId)?.route
    || state.meridians.find((item) => item.id === routeId)
  if (!route) return
  routeVisuals.filter((entry) => entry.route.id === routeId).forEach(({ line }) => disposeRouteLine(line))
  routeVisuals = routeVisuals.filter((entry) => entry.route.id !== routeId)
  addRouteLineVisuals(route, runs)
}

/** Reveal the anatomy under the pointer while editing, without moving it. */
function skinDecalXray() {
  return appMode === 'edit' && (xrayEdit || Boolean(dragging))
}

/**
 * Per-frame uniforms: the strip's pixel floor and the depth-independent lift
 * are the only things that react to camera changes. Geometry never moves.
 */
function updateSkinDecalUniforms() {
  const viewportHeight = Math.max(viewport.clientHeight, 1)
  const isOrtho = Boolean(camera.isOrthographicCamera)
  const pixelScale = perspectivePixelScale(camera.fov || 45, viewportHeight)
  const orthoPixel = isOrtho
    ? (camera.top - camera.bottom) / Math.max(camera.zoom, 1e-6) / viewportHeight
    : 0.001
  const lift = skinLiftWorld()
  const xray = skinDecalXray()
  skinDecalMaterials.forEach((material) => {
    const uniforms = material.uniforms
    if (!uniforms) return
    uniforms.uPixelScale.value = pixelScale
    uniforms.uOrthoPixel.value = orthoPixel
    uniforms.uIsOrtho.value = isOrtho ? 1 : 0
    uniforms.uLift.value = lift
    if (material.userData?.type === 'acupoint') {
      const wantsDepthTest = !xray
      if (material.depthTest !== wantsDepthTest) {
        material.depthTest = wantsDepthTest
        material.needsUpdate = true
      }
      return
    }
    uniforms.uWidth.value = ribbonWidthWorld()
  })
}

/** Conformed dot geometry: a fan whose rim is projected onto the skin. */
function acupointDotGeometry(point, radius) {
  const resolved = resolvedNode(point)
  const key = `${quantizeKey(resolved.position)}|${radius.toFixed(5)}`
  const cached = discCache.get(key)
  if (cached) return cached
  const disc = conformDisc(
    resolved.position,
    resolved.normal,
    radius,
    (probe, guide) => surfaceFrameAt(probe, guide, Math.max(radius * 2, 0.006)),
    { segments: 24 },
  )
  const geometry = skinDecalGeometry(buildDiscAttributes(disc))
  discCache.set(key, geometry)
  trimCache(discCache, 1600)
  return geometry
}

/** Edit gizmos (locator handles) stay lifted spheres: they are UI, not anatomy. */
function createGizmoMaterial(color, { selected = false } = {}) {
  return new THREE.MeshBasicMaterial({
    color,
    depthTest: true,
    depthWrite: true,
    transparent: true,
    opacity: selected ? 1 : 0.92,
    polygonOffset: true,
    polygonOffsetFactor: -6,
    polygonOffsetUnits: -6,
  })
}

function createAcupointDot(point, { selected = false } = {}) {
  const material = createSkinDecalMaterial(acupointMarkerColor(point.meridianId, point.color), {
    opacity: selected ? 1 : 0.92,
    widthWorld: 0,
    minPixels: 0,
    depthOffset: -8,
  })
  material.userData.type = 'acupoint'
  const mesh = new THREE.Mesh(
    acupointDotGeometry(point, markerDiameterWorld() * 0.5),
    material,
  )
  mesh.renderOrder = 8
  mesh.frustumCulled = false
  return mesh
}

function isRenDuMeridian(meridianId) {
  return meridianId === 'CV' || meridianId === 'GV'
}

function isRouteSelected(route) {
  return selected?.type === 'meridian'
    && (selected.id === route.id || (route.pairId && selected.pairId === route.pairId))
}

function isSegmentSelected(route, fromPointId, toPointId) {
  return selected?.type === 'meridian'
    && isRouteSelected(route)
    && selected.fromPointId === fromPointId
    && selected.toPointId === toPointId
}

function consecutiveAcupointPairs(route) {
  const entries = []
  route.nodes.forEach((node, index) => {
    if (node.type !== 'acupoint') return
    const point = getPoint(node.pointId)
    const position = point?.position || node.position
    entries.push({
      index,
      node,
      pointId: node.pointId,
      code: point?.code || '',
      sequence: point?.sequence ?? catalogSequence(point?.code),
      side: placedPointSide({
        ...point,
        position,
        side: point?.side || route.side,
      }),
    })
  })
  const ordered = orderRouteAcupointsForDrawing(entries)
  const pairs = []
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const from = ordered[index]
    const to = ordered[index + 1]
    const lo = Math.min(from.index, to.index)
    const hi = Math.max(from.index, to.index)
    const between = route.nodes.slice(lo + 1, hi)
    const hasOtherAcupoint = between.some((node) => node.type === 'acupoint')
    pairs.push({
      fromIndex: from.index,
      toIndex: to.index,
      fromNode: from.node,
      toNode: to.node,
      fromPointId: from.pointId,
      toPointId: to.pointId,
      handles: hasOtherAcupoint
        ? []
        : keepLocatorsOnPairLimb(
          resolvedNode(from.node),
          resolvedNode(to.node),
          keepPairHandles(between.filter((node) => node.type === 'control')),
        ),
    })
  }
  return pairs
}

function extraMeridianPairs(route) {
  if (route.meridianId !== 'KI') return []
  const gv1 = state.acupoints.find((point) => point.code === 'GV1')
  if (!gv1) return []
  const pairs = []
  route.nodes.forEach((node, index) => {
    if (node.type !== 'acupoint') return
    if (getPoint(node.pointId)?.code !== 'KI10') return
    pairs.push({
      fromIndex: index,
      toIndex: -1,
      fromNode: node,
      toNode: {
        type: 'acupoint',
        pointId: gv1.id,
        position: gv1.position,
        normal: gv1.normal,
      },
      fromPointId: node.pointId,
      toPointId: gv1.id,
      handles: [],
    })
  })
  return pairs
}

function acupointPairs(route) {
  return consecutiveAcupointPairs(route)
    .filter((pair) => !isOmittedSurfacePair(pair))
    .concat(extraMeridianPairs(route))
}

function pairsOnClickedLine(pairs, line) {
  const keys = line?.userData?.pairKeys
  if (keys?.length) {
    const allowed = new Set(keys)
    return pairs.filter((pair) => allowed.has(pairKey(pair)))
  }
  const samples = line?.userData?.tubePoints
  if (!samples?.length) return pairs
  const near = (node) => {
    const target = new THREE.Vector3(...resolvedNode(node).position)
    let best = Infinity
    samples.forEach((sample) => {
      const distance = sample.distanceToSquared(target)
      if (distance < best) best = distance
    })
    return best < 0.04 * 0.04
  }
  return pairs.filter((pair) => near(pair.fromNode) && near(pair.toNode))
}

function nearestAcupointPair(route, worldPoint, line = null) {
  const probe = worldPoint?.isVector3 ? worldPoint : new THREE.Vector3(...toArray(worldPoint))
  const samples = line?.userData?.tubePoints
  const pairs = pairsOnClickedLine(acupointPairs(route), line)
  if (samples?.length >= 2 && pairs.length) {
    let clickIndex = 0
    let bestClick = Infinity
    samples.forEach((point, index) => {
      const distance = point.distanceToSquared(probe)
      if (distance < bestClick) {
        bestClick = distance
        clickIndex = index
      }
    })
    const nodes = [...pairs.map((pair) => pair.fromNode), pairs[pairs.length - 1].toNode]
    const nodeIndexes = []
    let searchFrom = 0
    nodes.forEach((node) => {
      const target = new THREE.Vector3(...resolvedNode(node).position)
      let bestIndex = searchFrom
      let bestDistance = Infinity
      for (let index = searchFrom; index < samples.length; index += 1) {
        const distance = samples[index].distanceToSquared(target)
        if (distance < bestDistance) {
          bestDistance = distance
          bestIndex = index
        }
      }
      nodeIndexes.push(bestIndex)
      searchFrom = bestIndex
    })
    const pairIndex = pickPairAlongPolyline(clickIndex, nodeIndexes)
    if (pairIndex >= 0) return pairs[pairIndex]
  }
  let best = { pair: null, distance: Infinity }
  pairs.forEach((pair) => {
    const distance = distanceToSegment3(
      toArray(probe),
      resolvedNode(pair.fromNode).position,
      resolvedNode(pair.toNode).position,
    )
    if (distance < best.distance) best = { pair, distance }
  })
  return best.pair
}

function addRouteEditHandles(route) {
  if (appMode !== 'edit') return
  if (isRenDuMeridian(route.meridianId)) return
  if (selected?.type !== 'meridian' || !isRouteSelected(route) || !selected.fromPointId) return

  const referenceArc = shortSegmentReferenceArc(route.side)
  acupointPairs(route)
    .filter((pair) => isSegmentSelected(route, pair.fromPointId, pair.toPointId))
    .filter((pair) => !isKiYinguChangqiangPair(routeNodeCode(pair.fromNode), routeNodeCode(pair.toNode)))
    .filter((pair) => !isGbChenglingNaokongPair(routeNodeCode(pair.fromNode), routeNodeCode(pair.toNode)))
    .forEach((pair) => {
      const rest = restPathArrays(pair.fromNode, pair.toNode)
      const count = visibleHandleCount(polylineArcLength(rest), referenceArc, pair.handles.length)
      pairWaypoints(pair.fromNode, pair.toNode, pair.handles, count, rest)
        .forEach((placed, handleIndex) => {
          const handle = new THREE.Mesh(
            new THREE.SphereGeometry(0.5, 12, 10),
            createGizmoMaterial(0x111111, { selected: true }),
          )
          handle.position.copy(offsetPosition(placed, statureWorld(0.006)))
          handle.scale.setScalar(statureWorld(0.012))
          handle.renderOrder = 12
          handle.material.depthTest = !skinDecalXray()
          handle.userData = {
            type: 'route-handle',
            routeId: route.id,
            fromPointId: pair.fromPointId,
            toPointId: pair.toPointId,
            handleIndex,
          }
          annotationGroup.add(handle)
          handleVisuals.push({ mesh: handle, routeId: route.id })
        })
    })
}

function clearRouteEditHandles() {
  handleVisuals.forEach(({ mesh }) => {
    annotationGroup.remove(mesh)
    mesh?.geometry?.dispose?.()
    mesh?.material?.dispose?.()
  })
  handleVisuals = []
}

/** Show locators for the selected segment without rebuilding every meridian. */
function refreshRouteEditHandles() {
  clearRouteEditHandles()
  if (appMode !== 'edit' || selected?.type !== 'meridian') return
  state.meridians.forEach((route) => {
    if (isRouteSelected(route)) addRouteEditHandles(route)
  })
}

function clearAnnotationVisuals() {
  routeVisuals.forEach(({ line }) => {
    line?.geometry?.dispose?.()
    disposeSkinDecalMaterial(line?.material)
  })
  markerVisuals.forEach(({ mesh, label }) => {
    mesh?.geometry?.dispose?.()
    disposeSkinDecalMaterial(mesh?.material)
    if (label?.element) label.element.remove()
  })
  handleVisuals.forEach(({ mesh }) => {
    mesh?.geometry?.dispose?.()
    mesh?.material?.dispose?.()
  })
  midpointVisuals.forEach(({ mesh }) => {
    mesh?.geometry?.dispose?.()
    mesh?.material?.dispose?.()
  })
  annotationGroup.clear()
  markerVisuals = []
  routeVisuals = []
  handleVisuals = []
  midpointVisuals = []
}

function isSharedSkinMaterial(material) {
  return material === idleSkinMaterial || material === orbitSkinMaterial
}

function disposeMeshResources(object) {
  if (!object) return
  if (object.geometry) {
    object.geometry.disposeBoundsTree?.()
    object.geometry.dispose?.()
  }
  const collected = []
  if (object.material) {
    collected.push(...(Array.isArray(object.material) ? object.material : [object.material]))
  }
  if (object.userData?.originalMaterial) {
    const original = object.userData.originalMaterial
    collected.push(...(Array.isArray(original) ? original : [original]))
  }
  collected.forEach((material) => {
    if (!material || isSharedSkinMaterial(material)) return
    material.map?.dispose?.()
    material.dispose?.()
  })
}

function disposeObjectTree(root) {
  if (!root) return
  root.traverse((object) => {
    if (object.isMesh) disposeMeshResources(object)
  })
}

/** Drop GPU meshes, BVH, and meridian visuals so the next GLB can decode. */
function releaseLoadedBody() {
  clearPathCaches()
  surfaceGraph = null
  normalMatrices.clear()
  clearAnnotationVisuals()
  disposeObjectTree(modelGroup)
  modelGroup.clear()
  modelMeshes = []
}

function rebuildAnnotations() {
  if (isDevMode(import.meta.env)) window.__midlineSnap = []
  clearAnnotationVisuals()

  const displayIds = new Set(visibleMeridianIdList())

  // Completed meridians (routes in state) always draw when checked on the right.
  state.meridians
    .filter((route) => displayIds.has(route.meridianId))
    .forEach((route) => {
      addRouteLineVisuals(route, skinCurveRuns(route))
      if (isRouteSelected(route)) addRouteEditHandles(route)
    })

  // Show acupoints for every checked meridian on the right panel.
  state.acupoints
    .filter((point) => displayIds.has(point.meridianId))
    .forEach((point) => {
      const isSelected = selected?.type === 'acupoint'
        && (selected.id === point.id || (point.pairId && selected.pairId === point.pairId))
      const pixelSize = FIXED_MARKER_SIZE
      const anchor = new THREE.Vector3(...resolvedNode(point).position)
      const marker = createAcupointDot(point, { selected: isSelected })
      marker.position.copy(anchor)
      marker.userData = { type: 'acupoint', id: point.id }
      annotationGroup.add(marker)

      const label = document.createElement('span')
      label.className = `point-marker ${isSelected ? 'selected' : ''}`
      label.style.setProperty('--marker-size', `${pixelSize}px`)
      label.innerHTML = `<b class="point-name">${escapeHtml(point.name)}</b>`
      applyLabelPlacement(label, point)
      const labelObject = new CSS2DObject(label)
      labelObject.position.copy(anchor)
      annotationGroup.add(labelObject)
      markerVisuals.push({ mesh: marker, label: labelObject, point })
    })
  updateMarkerScales()
}

function updateMarkerScales({ labels = !orbitFastView } = {}) {
  updateSkinDecalUniforms()
  const viewportHeight = Math.max(viewport.clientHeight, 1)
  const dotDiameter = markerDiameterWorld()
  const xray = skinDecalXray()
  markerVisuals.forEach(({ mesh, label, point }) => {
    const resolved = resolvedNode(point)
    const anchor = new THREE.Vector3(...resolved.position)
    mesh.position.copy(anchor)
    if (label) label.position.copy(anchor)
    const distance = camera.position.distanceTo(anchor)
    const pixel = camera.isOrthographicCamera
      ? (camera.top - camera.bottom) / Math.max(camera.zoom, 1e-6) / viewportHeight
      : perspectivePixelScale(camera.fov || 45, viewportHeight) * distance
    // Inflate only when an on-skin dot would otherwise fall below a few pixels.
    mesh.scale.setScalar(markerScreenScale(dotDiameter, pixel, MARKER_MIN_PIXELS))
    if (labels && label?.element) {
      label.element.style.setProperty('--marker-size', `${FIXED_MARKER_SIZE}px`)
      applyLabelPlacement(label.element, point)
    }
  })
  const handleSize = (position, pixels = 14) =>
    pixelSizeToWorld(pixels, camera.position.distanceTo(position))
  handleVisuals.forEach(({ mesh }) => {
    mesh.scale.setScalar(handleSize(mesh.position, 10))
    if (mesh.material) mesh.material.depthTest = !xray
  })
  midpointVisuals.forEach(({ mesh }) => {
    mesh.scale.setScalar(handleSize(mesh.position, 12))
    if (mesh.material) mesh.material.depthTest = !xray
  })
}

let lastLabelCheck = 0
function isPointOccluded(position, cameraPosition) {
  const origin = new THREE.Vector3(...cameraPosition)
  const surface = new THREE.Vector3(...position)
  const toCamera = origin.clone().sub(surface)
  if (toCamera.lengthSq() < 1e-10) return false
  toCamera.normalize()
  // Probe slightly toward the camera so concave creases (尺澤 / cubital fossa)
  // are not false-occluded by surrounding forearm flesh.
  const probe = surface.clone().addScaledVector(toCamera, 0.04)
  const direction = probe.clone().sub(origin)
  const distance = direction.length()
  if (distance < 1e-5) return false
  const caster = new THREE.Raycaster(origin, direction.normalize(), 0, distance)
  caster.firstHitOnly = true
  const hit = caster.intersectObjects(modelMeshes, false)[0]
  if (!hit) return false
  return isOcclusionHitBlocking(hit.distance, distance, hit.point.distanceTo(probe))
}

function isPointSelected(point) {
  return selected?.type === 'acupoint'
    && (selected.id === point.id || (point.pairId && selected.pairId === point.pairId))
}

function updateLabelVisibility(time, { force = false } = {}) {
  if (orbitFastView && !force) return
  if (!force && time - lastLabelCheck < 50) return
  lastLabelCheck = time
  const cam = toArray(camera.position)

  markerVisuals.forEach(({ mesh, label, point }) => {
    const facesCamera = isSurfaceFacingCamera(point.position, point.normal, cam)
    const occluded = facesCamera ? isPointOccluded(point.position, cam) : true
    // Always reveal the active selection so a crease placement is never "lost".
    const visible = isPointSelected(point) || (facesCamera && !occluded)
    if (label) {
      label.visible = visible
      if (label.element) {
        label.element.style.display = visible ? '' : 'none'
        label.element.style.visibility = visible ? 'visible' : 'hidden'
        label.element.setAttribute('aria-hidden', visible ? 'false' : 'true')
      }
    }
    mesh.visible = visible
  })

  routeVisuals.forEach(({ line, route, isDraft }) => {
    if (isDraft || !route) {
      line.visible = true
      return
    }
    // Keep all completed routes in the scene. Depth testing hides far-side geometry;
    // only cull when every node faces away from the camera.
    const nodes = route.nodes.map(resolvedNode)
    line.visible = nodes.some((node) => isSurfaceFacingCamera(node.position, node.normal, cam))
  })
}

function meridianProgress(meridianId = $('#meridian-filter').value) {
  const required = pointsForMeridian(meridianId)
  const placed = state.acupoints.filter((point) => point.meridianId === meridianId)
  return placementProgress(required, placed)
}

function renderCatalog() {
  const meridianId = $('#meridian-filter').value
  const query = $('#catalog-search').value.trim().toLowerCase()
  const points = pointsForMeridian(meridianId).filter((point) =>
    !query || point.code.toLowerCase().includes(query) || point.name.includes(query))
  $('#catalog-count').textContent = points.length
  $('#catalog').innerHTML = points.map((point) => {
    const placed = state.acupoints.some((item) => item.code === point.code)
    const classes = [
      'catalog-item',
      selectedCatalog?.code === point.code ? 'selected' : '',
      placed ? 'placed' : '',
    ].filter(Boolean).join(' ')
    return `<button class="${classes}" data-code="${point.code}">
      <b>${point.code}</b><span><strong>${point.name}</strong><small>${point.meridianName}</small></span>
    </button>`
  }).join('') || '<p class="empty">找不到符合的穴位</p>'
  renderPointDetails()
  updateSideControl()
}

function renderPointDetails() {
  const details = selectedCatalog?.details
  const progress = meridianProgress()
  const meridian = meridianById($('#meridian-filter').value)
  $('#point-details').innerHTML = selectedCatalog ? `
    <strong>${selectedCatalog.code} · ${escapeHtml(selectedCatalog.name)}</strong>
    <small>${escapeHtml(selectedCatalog.meridianName)}</small>
    <p>${escapeHtml(details.simpleLocation || details.location || '尚無取穴說明')}</p>` : ''
  $('#placement-progress').innerHTML = `
    <span>${escapeHtml(meridian.name)}定位進度</span>
    <b>${progress.placed} / ${progress.total}</b>
    <meter min="0" max="${progress.total}" value="${progress.placed}"></meter>
    <small>${progress.complete ? '已完成，經脈會自動連線顯示' : `尚缺 ${progress.total - progress.placed} 個穴位`}</small>`
}

function updateSideControl() {
  const meridian = meridianById($('#meridian-filter').value)
  $('#side-control').classList.toggle('hidden', !meridian?.bilateral)
}

function renderObjects() {
  const meridianIds = visibleMeridianIdList()
  if (!meridianIds.length) {
    $('#objects').innerHTML = '<p class="empty">請在上方勾選要顯示的經脈</p>'
    $('#object-count').textContent = '0'
    return
  }

  const rows = []
  let pointRows = 0
  let routeCount = 0
  meridianIds.forEach((meridianId) => {
    const meridian = meridianById(meridianId)
    const required = pointsForMeridian(meridianId)
    const placed = state.acupoints.filter((point) => point.meridianId === meridianId)
    const placedByCode = new Map()
    placed.forEach((point) => {
      const list = placedByCode.get(point.code) || []
      list.push(point)
      placedByCode.set(point.code, list)
    })
    const groupRows = required
      .filter((catalog) => placedByCode.has(catalog.code))
      .map((catalog) => {
        const group = placedByCode.get(catalog.code)
        const primary = group.find((item) => item.side === 'left' || item.side === 'midline') || group[0]
        const sides = [...new Set(group.map((item) => sideLabel(item.side)))].join('／')
        const selectedHere = selected?.type === 'acupoint'
          && group.some((item) => item.id === selected.id || (selected.pairId && item.pairId === selected.pairId))
        return `<button data-type="acupoint" data-id="${primary.id}" class="${selectedHere ? 'selected' : ''}">
          <i class="point-dot" style="background:${acupointMarkerColor(primary.meridianId, primary.color)}"></i>
          <span><b>${escapeHtml(catalog.code)} · ${escapeHtml(catalog.name)}</b><small>${sides}</small></span>
        </button>`
      })
    routeCount += state.meridians.filter((route) => route.meridianId === meridianId).length
    if (!groupRows.length) return
    pointRows += groupRows.length
    rows.push(`<div class="objects-group-label">${escapeHtml(meridian?.name || meridianId)}</div>`)
    rows.push(...groupRows)
  })

  $('#objects').innerHTML = rows.join('') || '<p class="empty">勾選的經脈尚無定位穴位</p>'
  $('#object-count').textContent = `${pointRows}${routeCount ? ` · ${routeCount}線` : ''}`
}

function updateUI() {
  $('#undo').disabled = !history.canUndo
  $('#redo').disabled = !history.canRedo
  const meridianDone = new Set(state.meridians.map((item) => item.meridianId)).size
  const heading = document.querySelector('.inspector-panel .panel-heading span')
  if (heading) heading.textContent = `場景物件（${meridianDone}/${MERIDIANS.length} 經脈）`
  renderVisibleMeridianList()
  renderObjects()
  syncStyleSettings()
  renderCatalog()
  updateDeleteButton()
  syncAppModeUI()
  syncOrbitLockButton()
  const undoStep = $('#undo-step')
  if (undoStep) undoStep.disabled = !history.canUndo
}

function syncStyleSettings() {
  const form = $('#style-settings')
  if (!form) return
  let markerColor = state.settings.markerColor
  let yangPoint = false
  if (selected?.type === 'acupoint') {
    const point = state.acupoints.find((entry) => entry.id === selected.id)
    if (point) {
      markerColor = acupointMarkerColor(point.meridianId, point.color)
      yangPoint = meridianById(point.meridianId)?.group === 'yang'
    }
  }
  form.markerColor.innerHTML = colorOptions(markerColor)
  if (form.surfaceFinish) form.surfaceFinish.value = surfaceFinish
  if (form.gridEnabled) form.gridEnabled.checked = gridEnabled
  const syncNumber = (slider, input, value) => {
    if (slider) slider.value = value
    if (input && document.activeElement !== input) input.value = value
  }
  syncNumber(form.ribbonWidth, form.ribbonWidthInput, ribbonWidthMm)
  syncNumber(form.markerDiameter, form.markerDiameterInput, markerDiameterMm)
  syncNumber(form.skinLift, form.skinLiftInput, skinLiftMm)
  if (form.xrayEdit) form.xrayEdit.checked = xrayEdit
  if (form.gridSpacing) form.gridSpacing.value = gridSpacing
  if (form.gridSpacingInput) form.gridSpacingInput.value = gridSpacing
  if (form.gridRotation) form.gridRotation.value = gridRotation
  if (form.gridRotationInput) form.gridRotationInput.value = gridRotation
  form.querySelectorAll('.grid-spacing-field, .grid-rotation-field').forEach((field) => {
    field.dataset.disabled = gridEnabled ? 'false' : 'true'
  })
  form.querySelectorAll('.doc-style-field').forEach((field) => {
    field.dataset.disabled = appMode === 'edit' && !yangPoint ? 'false' : 'true'
  })
  if (form.markerColor) form.markerColor.disabled = appMode !== 'edit' || yangPoint
  syncZoomUI()
}

function applyStyleSettings(data) {
  if (appMode !== 'edit') return toast('檢視模式為唯讀，請切換編輯後再改樣式', 'warn')
  const markerColor = data.markerColor
  const settings = {
    ...state.settings,
    markerColor,
    markerSize: FIXED_MARKER_SIZE,
    lineWidth: FIXED_LINE_WIDTH,
    lineColor: state.settings.lineColor,
  }
  if (selected?.type === 'acupoint') {
    const current = state.acupoints.find((item) => item.id === selected.id)
    if (!current) return
    const acupoints = state.acupoints.map((item) => {
      const matches = item.id === current.id || (current.pairId && item.pairId === current.pairId)
      return matches
        ? { ...item, color: acupointMarkerColor(item.meridianId, markerColor), size: FIXED_MARKER_SIZE }
        : item
    })
    commit({ ...state, settings, acupoints }, '穴位顏色已套用至左右配對')
    return
  }
  commit({ ...state, settings }, '已更新新定位樣式預設值')
}

function syncAppModeUI() {
  const viewBtn = $('#mode-view')
  const editBtn = $('#mode-edit')
  if (viewBtn) {
    viewBtn.classList.toggle('active', appMode === 'view')
    viewBtn.setAttribute('aria-pressed', appMode === 'view' ? 'true' : 'false')
  }
  if (editBtn) {
    editBtn.classList.toggle('active', appMode === 'edit')
    editBtn.setAttribute('aria-pressed', appMode === 'edit' ? 'true' : 'false')
  }
  document.body.classList.toggle('app-view-mode', appMode === 'view')
  document.body.classList.toggle('app-edit-mode', appMode === 'edit')
  syncMeridianDragButtons()
  viewport.className = appMode === 'edit' && selectedCatalog ? 'placing' : ''
  const midlineId = selectedCatalog && !meridianById(selectedCatalog.meridianId)?.bilateral
    ? selectedCatalog.meridianId
    : null
  const midlineHint = midlineId === 'GV'
    ? ' · 督脈建議先按「背面朝向」'
    : midlineId
      ? ' · 任脈建議先按「正面朝向」'
      : ''
  if (appMode === 'view') {
    $('#stage-help').textContent = orbitLocked
      ? '檢視模式 · 旋轉已鎖定 · 可上下左右平移 · 視角朝向不變'
      : '檢視模式 · 旋轉／縮放／平移 · 右側勾選顯示 · 可匯入匯出 · 穴位與經脈唯讀'
    return
  }
  if (orbitLocked) {
    $('#stage-help').textContent = orbitLockSticky
      ? '編輯 · 旋轉已鎖定 · 可上下左右平移 · 視角朝向不變 · 可拖穴位／調曲度'
      : '編輯曲度中 · 旋轉已暫時鎖定 · 放開編輯點後恢復'
    return
  }
  const dragHint = selectedSegmentReady()
    ? '可拖黑點改走向 · 「增加／刪除定位點」調整中繼點 · 放開或按「重繪經脈」後沿皮膚重畫這一段'
    : '點兩穴之間的經脈出現黑點（短段可為 0 顆，長段約每 40 mm 一顆），再拖到皮膚上的新位置'
  $('#stage-help').textContent = selectedCatalog
    ? `編輯 · 點皮膚定位 ${selectedCatalog.code} ${selectedCatalog.name} · ${dragHint}${midlineHint}`
    : `編輯 · 點兩穴之間的經脈出現黑點 · ${dragHint} · 拉錯按「回復上一步」`
}

function setAppMode(mode) {
  const next = mode === 'view' ? 'view' : 'edit'
  if (next === appMode) {
    syncAppModeUI()
    return
  }
  // Keep sticky orbit lock across view/edit so pan-without-rotate stays available.
  appMode = next
  rebuildAnnotations()
  updateUI()
  setStatus(appMode === 'view' ? '已切換檢視模式（唯讀）' : '已切換編輯模式')
}

function ensureMeridianRoutes(meridianId, { commitHistory = true } = {}) {
  const meridian = meridianById(meridianId)
  if (!meridian) return { ok: false, reason: '找不到經脈' }
  const required = pointsForMeridian(meridianId)
  const placed = state.acupoints.filter((point) => point.meridianId === meridianId)
  const existing = state.meridians.filter((route) => route.meridianId === meridianId)
  if (existing.length) {
    const synced = syncMeridianRoutes(state.meridians, meridian, placed)
    if (synced !== state.meridians) {
      if (commitHistory) {
        state = history.commit({ ...state, meridians: synced })
        persistState()
      } else {
        state = { ...state, meridians: synced }
      }
    }
    return { ok: true, meridian, created: false }
  }

  const progress = placementProgress(required, placed)
  if (!progress.complete) {
    return {
      ok: false,
      reason: `請先完成 ${meridian.name} 所有穴位（${progress.placed}/${progress.total}）`,
    }
  }

  const routes = buildMeridianRoutesFromPlaced(meridian, placed)
  if (!routes.length) return { ok: false, reason: '穴位不足，無法自動連線' }

  linkedMeridianIds.add(meridian.id)
  const next = { ...state, meridians: [...state.meridians, ...routes] }
  if (commitHistory) {
    state = history.commit(next)
    persistState()
  } else {
    state = next
  }
  return { ok: true, meridian, created: true, routes }
}

/** Auto-build routes for every meridian whose acupoints are complete. */
function autoEnsureCompletedMeridians() {
  const created = []
  MERIDIANS.forEach((meridian) => {
    const required = pointsForMeridian(meridian.id)
    const placed = state.acupoints.filter((point) => point.meridianId === meridian.id)
    if (!placementProgress(required, placed).complete) return
    ensureVisibleMeridian(meridian.id)
    const result = ensureMeridianRoutes(meridian.id, { commitHistory: false })
    if (result.ok && result.created) created.push(meridian.name)
  })
  applyGlobalMeridianColors()
  return created
}

function repairExistingMeridianRoutes(meridians, acupoints) {
  let next = meridians
  MERIDIANS.forEach((meridian) => {
    next = syncMeridianRoutes(
      next,
      meridian,
      acupoints.filter((point) => point.meridianId === meridian.id),
    )
  })
  return next
}

function normalizeFixedStyles(documentState) {
  const acupoints = (documentState.acupoints || []).map((point) => ({
    ...normalizePlacedPointSide(point),
    size: FIXED_MARKER_SIZE,
    color: acupointMarkerColor(point.meridianId, point.color),
  }))
  const meridians = repairExistingMeridianRoutes(
    (documentState.meridians || []).map((route) => ({
      ...route,
      width: FIXED_LINE_WIDTH,
      color: meridianLineColor(route.meridianId),
      nodes: (route.nodes || []).map(sanitizeRouteNode),
    })),
    acupoints,
  )
  return {
    ...documentState,
    settings: {
      ...documentState.settings,
      markerSize: FIXED_MARKER_SIZE,
      lineWidth: FIXED_LINE_WIDTH,
    },
    meridians,
    acupoints,
  }
}

function makePoint(catalog, side, pairId, hit) {
  return {
    id: makeId(),
    pairId,
    name: catalog.name,
    code: catalog.code,
    meridianId: catalog.meridianId,
    meridianName: catalog.meridianName,
    sequence: catalog.sequence,
    side,
    color: acupointMarkerColor(catalog.meridianId, state.settings.markerColor),
    size: FIXED_MARKER_SIZE,
    position: hit.position,
    normal: hit.normal,
  }
}

function placeAcupoint(hit) {
  if (!selectedCatalog) return toast('請先選擇穴位', 'warn')
  if (state.acupoints.some((point) => point.code === selectedCatalog.code)) {
    return toast(`${selectedCatalog.code} 已定位；請先刪除原定位再重設`, 'warn')
  }
  const meridian = meridianById(selectedCatalog.meridianId)
  let points
  if (meridian.bilateral) {
    const firstSide = spatialSideFromPosition(hit.position, $('#point-side').value)
    const otherSide = firstSide === 'left' ? 'right' : 'left'
    const pairId = makeId()
    const mirrored = mirroredNode(hit)
    points = [
      makePoint(selectedCatalog, firstSide, pairId, hit),
      makePoint(selectedCatalog, otherSide, pairId, mirrored),
    ]
    selected = { type: 'acupoint', id: points[0].id, pairId }
  } else {
    // 任脈／督脈：保留點擊位置，不強制鎖到模型中線（幾何中心與視覺中線常有誤差）。
    points = [makePoint(selectedCatalog, 'midline', null, hit)]
    selected = { type: 'acupoint', id: points[0].id, pairId: null }
  }
  ensureVisibleMeridian(meridian.id)
  const nextAcupoints = [...state.acupoints, ...points]
  const progressPreview = placementProgress(pointsForMeridian(meridian.id), nextAcupoints.filter((p) => p.meridianId === meridian.id))
  let nextMeridians = syncMeridianRoutes(state.meridians, meridian, nextAcupoints, {
    allowCreate: progressPreview.complete || linkedMeridianIds.has(meridian.id)
      || state.meridians.some((route) => route.meridianId === meridian.id),
  })
  const relinked = nextMeridians !== state.meridians
  state = { ...state, acupoints: nextAcupoints, meridians: nextMeridians }
  if (progressPreview.complete) {
    linkedMeridianIds.add(meridian.id)
    autoEnsureCompletedMeridians()
  }
  commit({ ...state, acupoints: nextAcupoints, meridians: state.meridians },
    meridian.bilateral ? `已建立 ${selectedCatalog.code} 左右配對` : `已定位 ${selectedCatalog.code}`)
  const progress = meridianProgress(meridian.id)
  if (progress.complete) {
    toast(`${meridian.name} 穴位已齊，已自動顯示經脈`)
  } else if (relinked) {
    toast(`${selectedCatalog.code} 已接回經脈線段`)
  }
}

function replacePairHandles(nodes, fromPointId, toPointId, controls) {
  const fromIndex = nodes.findIndex((node) => node.type === 'acupoint' && node.pointId === fromPointId)
  const toIndex = nodes.findIndex((node) => node.type === 'acupoint' && node.pointId === toPointId)
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return nodes
  const lo = Math.min(fromIndex, toIndex)
  const hi = Math.max(fromIndex, toIndex)
  return [...nodes.slice(0, lo + 1), ...controls, ...nodes.slice(hi)]
}

function writePairHandles(routeId, fromPointId, toPointId, controls) {
  const route = state.meridians.find((item) => item.id === routeId)
  if (!route || isRenDuMeridian(route.meridianId)) return state
  const pairRoute = route.pairId
    && state.meridians.find((item) => item.pairId === route.pairId && item.id !== route.id)
  const mirrorFrom = pairedPointId(fromPointId)
  const mirrorTo = pairedPointId(toPointId)
  const mirrored = controls.map((control) => ({
    ...makeMirroredRouteNode(control),
    style: control.style,
  }))
  const meridians = state.meridians.map((item) => {
    if (item.id === route.id) {
      return { ...item, nodes: replacePairHandles(item.nodes, fromPointId, toPointId, controls.map(sanitizeRouteNode)) }
    }
    if (pairRoute && item.id === pairRoute.id && mirrorFrom && mirrorTo) {
      return { ...item, nodes: replacePairHandles(item.nodes, mirrorFrom, mirrorTo, mirrored.map(sanitizeRouteNode)) }
    }
    return item
  })
  return { ...state, meridians }
}

function setSegmentHandle(routeId, fromPointId, toPointId, hit, handleIndex = 0) {
  const route = state.meridians.find((item) => item.id === routeId)
  if (!route || isRenDuMeridian(route.meridianId)) return state
  const pair = acupointPairs(route).find((item) =>
    item.fromPointId === fromPointId && item.toPointId === toPointId)
  if (!pair) return state
  const rest = restPathArrays(pair.fromNode, pair.toNode)
  const count = visibleHandleCount(
    polylineArcLength(rest),
    shortSegmentReferenceArc(route.side),
    pair.handles.length,
  )
  const records = pairHandleRecords(pair.fromNode, pair.toNode, pair.handles, count, rest)
  const index = Math.min(Math.max(0, handleIndex), Math.max(0, records.length - 1))
  const fromCode = routeNodeCode(pair.fromNode)
  const toCode = routeNodeCode(pair.toNode)
  const trustsLocators = pairKeepsOffPathLocators(fromCode, toCode)
  if (!isProbeOnSameLimbSegment(rest, hit.position, statureWorld(HANDLE_STRETCH_MAX_OFF_PATH), {
    skipLimbGap: trustsLocators,
    worldScale: statureScale(),
  })) {
    return state
  }
  const minGap = statureWorld(isTeHeadPair(fromCode, toCode) ? TE_HEAD_HANDLE_MIN_GAP : HANDLE_COMMIT_MIN_GAP)
  const tooClose = records.some((record, cursor) => {
    if (cursor === index) return false
    const gap = Math.hypot(
      hit.position[0] - record.position[0],
      hit.position[1] - record.position[1],
      hit.position[2] - record.position[2],
    )
    return gap < minGap
  })
  if (tooClose) return state
  const placed = isSiXiaohaiJianzhenPair(fromCode, toCode)
    ? snapSiHandleToSkin(hit, resolvedNode(pair.fromNode), resolvedNode(pair.toNode), rest) || hit
    : isGbShoulderAxillaSpan(fromCode, toCode, resolvedNode(pair.fromNode).position, resolvedNode(pair.toNode).position)
      ? snapGbHandleToSkin(hit, resolvedNode(pair.fromNode), resolvedNode(pair.toNode), rest) || hit
      : hit
  if (!records.length) {
    records.push({
      type: 'control',
      pointId: null,
      position: [...placed.position],
      normal: [...placed.normal],
      style: 'along',
    })
  } else {
    records[index] = {
      type: 'control',
      pointId: null,
      position: [...placed.position],
      normal: [...placed.normal],
      style: 'along',
    }
  }
  invalidatePairPathCache(pair.fromNode, pair.toNode)
  return writePairHandles(routeId, fromPointId, toPointId, records)
}

function previewHandleDrag(drag, hit) {
  const pairId = state.meridians.find((item) => item.id === drag.routeId)?.pairId || null
  const route = state.meridians.find((item) => item.id === drag.routeId)
  const pair = route && acupointPairs(route).find((item) =>
    item.fromPointId === drag.fromPointId && item.toPointId === drag.toPointId)
  const skinHit = pair && isSiXiaohaiJianzhenPair(routeNodeCode(pair.fromNode), routeNodeCode(pair.toNode))
    ? snapSiHandleToSkin(hit, resolvedNode(pair.fromNode), resolvedNode(pair.toNode), drag.rest || []) || hit
    : pair && isGbShoulderAxillaSpan(
      routeNodeCode(pair.fromNode),
      routeNodeCode(pair.toNode),
      resolvedNode(pair.fromNode).position,
      resolvedNode(pair.toNode).position,
    )
      ? snapGbHandleToSkin(hit, resolvedNode(pair.fromNode), resolvedNode(pair.toNode), drag.rest || []) || hit
      : hit
  handleVisuals.forEach(({ mesh }) => {
    const data = mesh.userData
    if (data.handleIndex !== drag.handleIndex) return
    const same = data.routeId === drag.routeId
    const mirrored = Boolean(pairId)
      && data.routeId !== drag.routeId
      && state.meridians.find((item) => item.id === data.routeId)?.pairId === pairId
    if (!same && !mirrored) return
    const node = same
      ? skinHit
      : {
        position: [-skinHit.position[0], skinHit.position[1], skinHit.position[2]],
        normal: [-skinHit.normal[0], skinHit.normal[1], skinHit.normal[2]],
      }
    mesh.position.copy(offsetPosition(node, statureWorld(0.006)))
  })
  if (!drag.records?.length || drag.handleIndex == null) return
  if (!route || !pair) return
  const records = drag.records.map((record, index) => (
    index === drag.handleIndex
      ? { ...record, position: [...skinHit.position], normal: [...skinHit.normal] }
      : record
  ))
  replaceRouteLine(route.id, skinCurveRuns(route, {
    fromPointId: pair.fromPointId,
    toPointId: pair.toPointId,
    records,
    rest: drag.rest,
    preview: true,
  }))
  if (pairId) {
    const mirror = state.meridians.find((item) => item.pairId === pairId && item.id !== route.id)
    const mirrorFrom = pairedPointId(pair.fromPointId)
    const mirrorTo = pairedPointId(pair.toPointId)
    const mirrorPair = mirror && acupointPairs(mirror).find((item) =>
      item.fromPointId === mirrorFrom && item.toPointId === mirrorTo)
    if (mirror && mirrorPair) {
      const mirroredRecords = records.map((record) => ({
        ...record,
        position: [-record.position[0], record.position[1], record.position[2]],
        normal: [-record.normal[0], record.normal[1], record.normal[2]],
      }))
      const mirroredRest = (drag.rest || []).map((point) => [-point[0], point[1], point[2]])
      replaceRouteLine(mirror.id, skinCurveRuns(mirror, {
        fromPointId: mirrorPair.fromPointId,
        toPointId: mirrorPair.toPointId,
        records: mirroredRecords,
        rest: mirroredRest,
        preview: true,
      }))
    }
  }
}

function redrawSelectedSegment({ announce = true } = {}) {
  if (appMode !== 'edit') return toast('檢視模式為唯讀，請切換編輯後再重繪經脈', 'warn')
  if (!selectedSegmentReady()) return toast('請先點選兩個穴位之間的經脈', 'warn')
  const route = state.meridians.find((item) => item.id === selected.id)
  if (!route || isRenDuMeridian(route.meridianId)) return toast('任督二脈沒有定位點可重繪', 'warn')
  const pair = acupointPairs(route).find((item) =>
    item.fromPointId === selected.fromPointId && item.toPointId === selected.toPointId)
  if (!pair) return toast('找不到這一段經脈', 'warn')
  invalidatePairPathCache(pair.fromNode, pair.toNode)
  const rest = restPathArrays(pair.fromNode, pair.toNode)
  const count = visibleHandleCount(
    polylineArcLength(rest),
    shortSegmentReferenceArc(route.side),
    pair.handles.length,
  )
  const records = pairHandleRecords(pair.fromNode, pair.toNode, pair.handles, count, rest)
  const next = writePairHandles(route.id, pair.fromPointId, pair.toPointId, records)
  state = history.commit(next)
  persistState()
  rebuildAnnotations()
  updateUI()
  if (announce) {
    setStatus('已依定位點沿皮膚重繪這段經脈（可按「回復上一步」還原）')
    toast('已重繪這段經脈')
  }
}

function selectedPairEditContext() {
  if (!selectedSegmentReady()) return null
  const route = state.meridians.find((item) => item.id === selected.id)
  if (!route || isRenDuMeridian(route.meridianId)) return null
  const pair = acupointPairs(route).find((item) =>
    item.fromPointId === selected.fromPointId && item.toPointId === selected.toPointId)
  if (!pair) return null
  const rest = restPathArrays(pair.fromNode, pair.toNode)
  const count = visibleHandleCount(
    polylineArcLength(rest),
    shortSegmentReferenceArc(route.side),
    pair.handles.length,
  )
  const records = pairHandleRecords(pair.fromNode, pair.toNode, pair.handles, count, rest)
  return { route, pair, rest, records }
}

function commitPairHandles(route, pair, records, message) {
  invalidatePairPathCache(pair.fromNode, pair.toNode)
  const ordered = [...records].sort((left, right) => (
    closestTOnPolyline(restPathArrays(pair.fromNode, pair.toNode), left.position)
    - closestTOnPolyline(restPathArrays(pair.fromNode, pair.toNode), right.position)
  ))
  const next = writePairHandles(route.id, pair.fromPointId, pair.toPointId, ordered)
  state = history.commit(next)
  persistState()
  rebuildAnnotations()
  updateUI()
  setStatus(message)
  toast(message)
}

function addLocatorToSelectedPair() {
  if (appMode !== 'edit') return toast('檢視模式為唯讀，請切換編輯後再增加定位點', 'warn')
  const ctx = selectedPairEditContext()
  if (!ctx) return toast('請先點選兩個穴位之間的經脈', 'warn')
  if (ctx.records.length >= MAX_PAIR_HANDLES) {
    return toast(`這一段最多 ${MAX_PAIR_HANDLES} 個定位點`, 'warn')
  }
  const t = nextHandleInsertT(ctx.records, ctx.rest)
  const placed = restPathAnchor(ctx.pair.fromNode, ctx.pair.toNode, ctx.rest, t)
  const records = [
    ...ctx.records,
    {
      type: 'control',
      pointId: null,
      position: [...placed.position],
      normal: [...placed.normal],
      style: 'along',
    },
  ]
  commitPairHandles(ctx.route, ctx.pair, records, `已增加定位點（目前 ${records.length} 個）`)
}

function removeLocatorFromSelectedPair() {
  if (appMode !== 'edit') return toast('檢視模式為唯讀，請切換編輯後再刪除定位點', 'warn')
  const ctx = selectedPairEditContext()
  if (!ctx) return toast('請先點選兩個穴位之間的經脈', 'warn')
  if (!ctx.records.length) return toast('這一段沒有定位點可刪', 'warn')
  const records = ctx.records.slice(0, -1)
  commitPairHandles(
    ctx.route,
    ctx.pair,
    records,
    records.length ? `已刪除定位點（剩下 ${records.length} 個）` : '已刪除定位點，改走兩穴之間的測地線',
  )
}

function placeAt(event) {
  const markerHit = nearestAcupointMarkerHit(event)
  const routeHit = annotationHit(event, ['meridian'])
  const acupointDist = screenDistanceToHit(event, markerHit)
  const preferAcupoint = markerHit && (!routeHit || acupointDist <= 8)
  if (preferAcupoint) {
    const point = getPoint(markerHit.object.userData.id)
    selected = { type: 'acupoint', id: point.id, pairId: point.pairId || null }
    if (appMode === 'edit') {
      selectedCatalog = POINT_BY_CODE.get(point.code) || selectedCatalog
      if (point.meridianId) $('#meridian-filter').value = point.meridianId
    }
    rebuildAnnotations()
    updateUI()
    return
  }

  if (routeHit) {
    const route = state.meridians.find((item) => item.id === routeHit.object.userData.id)
    const pair = route && !isRenDuMeridian(route.meridianId)
      ? nearestAcupointPair(route, routeHit.point, routeHit.object)
      : null
    selected = {
      type: 'meridian',
      id: routeHit.object.userData.id,
      pairId: route?.pairId || null,
      fromPointId: pair?.fromPointId || null,
      toPointId: pair?.toPointId || null,
    }
    if (route) replaceRouteLine(route.id, skinCurveRuns(route))
    refreshRouteEditHandles()
    updateUI()
    return
  }

  if (appMode !== 'edit') return
  const hit = surfaceHit(event)
  if (!hit) return toast('請點擊人體模型表面', 'warn')
  placeAcupoint(hit)
}

function updatePairedPoint(pointId, hit) {
  const point = getPoint(pointId)
  if (!point) return state
  const mirrored = point.pairId ? mirroredNode(hit) : null
  return {
    ...state,
    acupoints: state.acupoints.map((item) => {
      if (item.id === point.id) return { ...item, position: hit.position, normal: hit.normal }
      if (point.pairId && item.pairId === point.pairId) {
        return { ...item, position: mirrored.position, normal: mirrored.normal }
      }
      return item
    }),
  }
}

function removeSelected() {
  if (appMode !== 'edit') return toast('檢視模式為唯讀，請切換編輯後再刪除', 'warn')
  if (!selected) return
  if (selected.type === 'acupoint') {
    const point = getPoint(selected.id)
    const removedIds = new Set(state.acupoints
      .filter((item) => item.id === point?.id || (point?.pairId && item.pairId === point.pairId))
      .map((item) => item.id))
    const nextRoutes = state.meridians
      .map((route) => ({
        ...route,
        nodes: removePointIdsFromRouteNodes(route.nodes, removedIds),
      }))
      .filter((route) => routeHasDrawableAcupoints(route.nodes))
    selected = null
    return commit({
      ...state,
      acupoints: state.acupoints.filter((item) => !removedIds.has(item.id)),
      meridians: nextRoutes,
    }, '已刪除穴位，並移除相連首／尾線段')
  }
  const route = state.meridians.find((item) => item.id === selected.id)
  selected = null
  commit({
    ...state,
    meridians: state.meridians.filter((item) =>
      item.id !== route?.id && !(route?.pairId && item.pairId === route.pairId)),
  }, '已刪除經脈路線')
}

function applyHistory(nextState, message) {
  if (!nextState) return
  state = normalizeFixedStyles(nextState)
  selected = null
  if (orbitLocked) detachOrbitLock({ restorePerspective: true })
  state.meridians.forEach((route) => linkedMeridianIds.add(route.meridianId))
  autoEnsureCompletedMeridians()
  pruneVisibleMeridianIds()
  persistState()
  rebuildAnnotations()
  updateUI()
  setStatus(message)
}

function exportJSON() {
  const body = inferBodyModel(state.model)
  const preset = BODY_MODELS[body]
  const payload = normalizeFixedStyles({
    ...state,
    model: {
      ...state.model,
      body,
      name: state.model?.name || preset.fileName,
    },
  })
  const result = validateDocument(payload)
  if (!result.valid) return toast(`無法匯出：${result.errors[0]}`, 'error')
  const fileName = exportFileName(payload)
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }))
  link.download = fileName
  link.click()
  URL.revokeObjectURL(link.href)
  toast(`已匯出 ${fileName}（${preset.label}模型）`)
}

async function importJSON(file) {
  const result = parseDocument(await file.text())
  if (!result.valid) return toast(`匯入失敗：${result.errors[0]}`, 'error')
  const sourceBody = inferBodyModel(result.value.model)
  const targetBody = BODY_MODELS[activeBody] ? activeBody : 'male'
  const preset = BODY_MODELS[targetBody]
  let next = bindDocumentToBody(result.value, targetBody)
  const needsRetarget = sourceBody !== targetBody
  let retargetMissed = 0

  if (needsRetarget) {
    if (!modelMeshes.length) {
      const loaded = await loadBodyModel(targetBody, { keepDocument: true })
      if (!loaded) return
    }
    $('#model-status').textContent = `正在將${BODY_MODELS[sourceBody].label}穴位對應到${preset.label}模型…`
    try {
      const sourceHeight = await measureFramedHeight(sourceBody)
      const targetHeight = bodyHeightWorld || await measureFramedHeight(targetBody)
      let missed = 0
      next = mapDocumentAnnotations(next, (point) => {
        const scaled = scalePosition(point.position, sourceHeight, targetHeight)
        const sideX = point.side === 'left' ? -1 : point.side === 'right' ? 1 : scaled[0]
        const preferPosterior = point.meridianId === 'GV' || scaled[2] < -0.02 * targetHeight
        const hit = closestSkinHit(scaled, {
          maxDistance: Math.max(targetHeight * 0.25, HANDLE_SKIN_SNAP_RADIUS),
          sideX,
          guideNormal: point.normal,
          preferPosterior,
        })
        if (!hit) {
          missed += 1
          return { position: scaled, normal: point.normal }
        }
        return { position: hit.position, normal: hit.normal }
      })
      retargetMissed = missed
    } catch (error) {
      return toast(`對應到${preset.label}模型失敗：${error.message}`, 'error')
    }
  }

  state = normalizeFixedStyles({
    ...next,
    model: {
      ...next.model,
      body: targetBody,
      name: next.model?.name || preset.fileName,
    },
  })
  activeBody = targetBody
  documentsByBody[targetBody] = cloneStudioDocument(state) || state
  history.replace(state)
  selected = null
  if (orbitLocked) detachOrbitLock({ restorePerspective: true })
  linkedMeridianIds.clear()
  state.meridians.forEach((route) => linkedMeridianIds.add(route.meridianId))
  state = { ...state, meridians: normalizeMeridianColors(state.meridians) }
  syncVisibleMeridiansFromDocument({ selectAll: true })
  autoEnsureCompletedMeridians()
  persistState()
  syncBodyModelSelect()
  if (!modelMeshes.length) {
    await loadBodyModel(targetBody, { keepDocument: true })
  }
  rebuildAnnotations()
  updateUI()
  $('#model-status').textContent = `${preset.label} · ${preset.fileName}`
  const mappedNote = needsRetarget
    ? `（已從${BODY_MODELS[sourceBody].label}依身高貼到皮膚${retargetMissed ? `，${retargetMissed} 點未貼上` : ''}，請再微調）`
    : ''
  toast(`已匯入 ${preset.label}穴位：${state.meridians.length} 條路線、${state.acupoints.length} 個定位點${mappedNote}`)
}

function rememberFramedHeight(body, height) {
  if (!BODY_MODELS[body] || !(height > 0)) return
  framedHeightByBody[body] = height
}

async function measureFramedHeight(bodyId) {
  const body = BODY_MODELS[bodyId] ? bodyId : 'male'
  if (framedHeightByBody[body] > 0) return framedHeightByBody[body]
  if (body === activeBody && bodyHeightWorld > 0) {
    rememberFramedHeight(body, bodyHeightWorld)
    return bodyHeightWorld
  }
  const gltf = await loadStudioGltf(bodyModelHref(body))
  try {
    const root = gltf.scene
    const box = new THREE.Box3().setFromObject(root)
    const center = box.getCenter(new THREE.Vector3())
    root.position.x += -center.x
    root.position.z += -center.z
    root.position.y += -box.min.y
    root.updateMatrixWorld(true)
    const height = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).y
    rememberFramedHeight(body, height)
    return height
  } finally {
    disposeObjectTree(gltf.scene)
  }
}

async function applyModel(gltf, name, hash = null, { isStale } = {}) {
  const root = gltf.scene
  const box = new THREE.Box3().setFromObject(root)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  if (!Number.isFinite(size.y) || size.y === 0) throw new Error('模型尺寸無效')

  if (modelGroup.children.length) releaseLoadedBody()
  else {
    surfaceGraph = null
    clearPathCaches()
    modelMeshes = []
  }
  modelGroup.add(root)

  // Recenter at origin and sit on y=0 (same framing approach as the turntable viewer).
  root.position.x += -center.x
  root.position.z += -center.z
  root.position.y += -box.min.y
  root.updateMatrixWorld(true)

  const framedBox = new THREE.Box3().setFromObject(root)
  const framedSize = framedBox.getSize(new THREE.Vector3())
  const maxDim = Math.max(framedSize.x, framedSize.y, framedSize.z, 0.001)
  // Millimetre render settings are read against the framed stature, so the
  // same slider value means the same real width on any GLB.
  bodyHeightWorld = framedSize.y

  const radius = maxDim * 0.85
  pedestal.scale.setScalar(radius)
  pedestal.position.set(0, 0.0005, 0)
  pedestal.visible = true

  const shadowCam = keyLight.shadow.camera
  shadowCam.left = -radius * 1.4
  shadowCam.right = radius * 1.4
  shadowCam.top = radius * 1.4
  shadowCam.bottom = -radius * 1.4
  shadowCam.near = 0.01
  shadowCam.far = maxDim * 8
  keyLight.position.set(maxDim * 1.3, maxDim * 2.0, maxDim * 1.0)
  if (!keyLight.target.parent) scene.add(keyLight.target)
  keyLight.target.position.set(0, maxDim * 0.15, 0)
  shadowCam.updateProjectionMatrix()
  renderer.shadowMap.needsUpdate = true

  root.traverse((object) => {
    if (!object.isMesh) return
    object.castShadow = true
    object.receiveShadow = true
    if (object.geometry) {
      // GLBs without a NORMAL attribute shade as faceted grids in MeshStandard/
      // MeshPhysical materials; always restore smooth vertex normals.
      if (!object.geometry.getAttribute('normal')) {
        object.geometry.computeVertexNormals()
      }
      // Lets the conform pass skip meshes that cannot own the nearest point.
      if (!object.geometry.boundingBox) object.geometry.computeBoundingBox()
    }
    modelMeshes.push(object)
  })

  const fovRad = THREE.MathUtils.degToRad(perspectiveCamera.fov)
  const dist = (maxDim / 2) / Math.tan(fovRad / 2) * 1.65
  perspectiveCamera.near = Math.max(maxDim / 1000, 0.001)
  perspectiveCamera.far = Math.max(maxDim * 100, 100)
  perspectiveCamera.updateProjectionMatrix()
  perspectiveCamera.position.set(dist * 0.72, dist * 0.55, dist * 0.72)
  controls.target.set(0, framedSize.y * 0.4, 0)
  controls.minDistance = maxDim * 0.05
  controls.maxDistance = maxDim * 20
  if (orbitLocked) {
    detachOrbitLock({ restorePerspective: false })
  }
  controls.update()
  initialCamPos = perspectiveCamera.position.clone()
  initialTarget = controls.target.clone()
  referenceZoomDistance = perspectiveCamera.position.distanceTo(controls.target)
  syncZoomUI({ force: true })
  syncControlsEnabled()

  const body = inferBodyModel({ ...state.model, name, body: activeBody })
  rememberFramedHeight(body, bodyHeightWorld)
  state = {
    ...state,
    model: {
      name: name || BODY_MODELS[body].fileName,
      hash,
      body,
    },
  }
  const cloned = cloneStudioDocument(state)
  if (cloned) documentsByBody[body] = cloned
  history.replace(state)
  $('#model-status').textContent = `${BODY_MODELS[body].label} · ${state.model.name}`
  refreshBodyFrontAxis()
  updateUI()

  // Paint the mesh before BVH / surface-graph work freezes the main thread.
  await yieldToMain()
  if (isStale?.()) return

  try {
    for (const object of modelMeshes) {
      if (object.geometry && !object.geometry.boundsTree) {
        object.geometry.computeBoundsTree()
      }
      await yieldToMain()
      if (isStale?.()) return
    }
    await rebuildSurfaceGraph({ isStale })
  } catch (error) {
    console.warn('Surface graph rebuild failed', error)
  }
  if (isStale?.()) return
  refreshBodyFrontAxis()
}

let surfaceFinish = 'skin'
let gridEnabled = true
let gridSpacing = 20
let gridRotation = 0
let referenceZoomDistance = camera.position.distanceTo(controls.target)
let zoomIndicatorTimer = 0

function clampGridSpacing(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return gridSpacing
  return Math.min(200, Math.max(5, Math.round(number)))
}

function clampGridRotation(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return gridRotation
  return Math.min(90, Math.max(-90, Math.round(number)))
}

function applyViewportGrid() {
  const grid = $('#viewport-grid')
  if (!grid) return
  gridSpacing = clampGridSpacing(gridSpacing)
  gridRotation = clampGridRotation(gridRotation)
  grid.hidden = !gridEnabled
  grid.style.setProperty('--grid-spacing', `${gridSpacing}px`)
  grid.style.setProperty('--grid-rotation', `${gridRotation}deg`)
  const form = $('#style-settings')
  form?.querySelectorAll('.grid-spacing-field, .grid-rotation-field').forEach((field) => {
    field.dataset.disabled = gridEnabled ? 'false' : 'true'
  })
  if (form?.gridSpacing) form.gridSpacing.value = gridSpacing
  if (form?.gridSpacingInput && document.activeElement !== form.gridSpacingInput) {
    form.gridSpacingInput.value = gridSpacing
  }
  if (form?.gridRotation) form.gridRotation.value = gridRotation
  if (form?.gridRotationInput && document.activeElement !== form.gridRotationInput) {
    form.gridRotationInput.value = gridRotation
  }
  if (form?.gridEnabled) form.gridEnabled.checked = gridEnabled
}

function formatZoomFactor(value) {
  const zoom = Number(value)
  if (!Number.isFinite(zoom)) return '1.00×'
  const rounded = zoom >= 10 ? zoom.toFixed(1) : zoom.toFixed(2)
  return `${rounded}×`
}

function zoomLimits() {
  if (!(referenceZoomDistance > 0)) return { min: 0.25, max: 20 }
  const minDistance = Math.max(controls.minDistance || 0.05, 1e-4)
  const maxDistance = Math.max(controls.maxDistance || 500, minDistance * 2)
  const maxZoom = referenceZoomDistance / minDistance
  const minZoom = referenceZoomDistance / maxDistance
  return {
    min: Math.max(0.1, Number(minZoom.toFixed(3))),
    max: Math.min(50, Number(maxZoom.toFixed(3))),
  }
}

function getZoomFactor() {
  if (camera.isOrthographicCamera) {
    return Math.max(lockedZoomFactor * camera.zoom, 1e-6)
  }
  const distance = camera.position.distanceTo(controls.target)
  if (!(referenceZoomDistance > 0) || !(distance > 1e-6)) return 1
  return referenceZoomDistance / distance
}

function setZoomFactor(rawFactor, { announce = false } = {}) {
  if (!(referenceZoomDistance > 0)) {
    referenceZoomDistance = Math.max(perspectiveCamera.position.distanceTo(controls.target), 0.05)
  }
  const limits = zoomLimits()
  let factor = Number(rawFactor)
  if (!Number.isFinite(factor) || factor <= 0) factor = 1
  factor = Math.min(limits.max, Math.max(limits.min, factor))

  if (camera.isOrthographicCamera) {
    const base = Math.max(lockedZoomFactor, 1e-6)
    camera.zoom = Math.max(factor / base, 1e-4)
    camera.updateProjectionMatrix()
    controls.update()
    syncZoomUI({ force: true, flash: true })
    if (announce) setStatus(`模型放大 ${formatZoomFactor(getZoomFactor())}`)
    return
  }

  const desiredDistance = referenceZoomDistance / factor
  const distance = Math.min(
    controls.maxDistance,
    Math.max(controls.minDistance, desiredDistance),
  )
  const offset = camera.position.clone().sub(controls.target)
  if (offset.lengthSq() < 1e-10) offset.set(0, 0, 1)
  offset.setLength(distance)
  camera.position.copy(controls.target).add(offset)
  controls.update()
  syncZoomUI({ force: true, flash: true })
  if (announce) setStatus(`模型放大 ${formatZoomFactor(getZoomFactor())}`)
}

function syncZoomUI({ force = false, flash = false } = {}) {
  const zoom = getZoomFactor()
  const limits = zoomLimits()
  const display = formatZoomFactor(zoom)
  const indicator = $('#zoom-indicator')
  if (indicator) {
    indicator.textContent = display
    if (flash) {
      indicator.classList.add('is-active')
      window.clearTimeout(zoomIndicatorTimer)
      zoomIndicatorTimer = window.setTimeout(() => indicator.classList.remove('is-active'), 650)
    }
  }
  const label = $('#zoom-factor-label')
  if (label) label.textContent = display
  const form = $('#style-settings')
  if (!form?.modelZoom || !form?.modelZoomInput) return
  form.modelZoom.min = String(limits.min)
  form.modelZoom.max = String(limits.max)
  form.modelZoomInput.min = String(limits.min)
  form.modelZoomInput.max = String(limits.max)
  const editingInput = document.activeElement === form.modelZoomInput
  const sliderValue = Math.min(limits.max, Math.max(limits.min, zoom))
  form.modelZoom.value = String(sliderValue)
  if (force || !editingInput) {
    form.modelZoomInput.value = zoom >= 10 ? zoom.toFixed(1) : zoom.toFixed(2)
  }
}

function isNailMesh(object) {
  const materials = Array.isArray(object.material) ? object.material : [object.material]
  const names = materials.map((material) => (material?.name || '').toLowerCase())
  const objectName = `${object.name || ''} ${object.parent?.name || ''}`.toLowerCase()
  const isToeNail = objectName.includes('toenail')
    || names.some((name) => name.includes('toenail'))
  const isNail = !isToeNail && (
    objectName.includes('nail')
    || names.some((name) => name.includes('fingernail') || name.includes('nail'))
  )
  return isToeNail || isNail
}

function createNailMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0xffc8bc,
    emissive: 0x5a241c,
    emissiveIntensity: 0.18,
    metalness: 0.15,
    roughness: 0.32,
    flatShading: false,
    side: THREE.DoubleSide,
    depthTest: true,
    envMapIntensity: 0.55,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  })
}

function createSkinMaterial() {
  // Warm East-Asian skin response: soft diffuse, mild subsurface-like sheen.
  return new THREE.MeshPhysicalMaterial({
    color: 0xd4a88a,
    roughness: 0.52,
    metalness: 0.0,
    reflectivity: 0.22,
    clearcoat: 0.12,
    clearcoatRoughness: 0.48,
    sheen: 0.55,
    sheenRoughness: 0.62,
    sheenColor: new THREE.Color(0xe8b9a4),
    specularIntensity: 0.35,
    specularColor: new THREE.Color(0xf0cfc0),
    envMapIntensity: 0.16,
    flatShading: false,
  })
}

function getIdleSkinMaterial() {
  if (!idleSkinMaterial) idleSkinMaterial = createSkinMaterial()
  return idleSkinMaterial
}

function getOrbitSkinMaterial() {
  if (!orbitSkinMaterial) {
    orbitSkinMaterial = new THREE.MeshStandardMaterial({
      color: 0xd4a88a,
      roughness: 0.52,
      metalness: 0,
      envMapIntensity: 0.16,
      flatShading: false,
    })
  }
  return orbitSkinMaterial
}

function applyAuthoringPixelRatio(moving) {
  renderer.setPixelRatio(clampPixelRatio(devicePixelRatio, moving))
  const { clientWidth, clientHeight } = viewport
  renderer.setSize(Math.max(clientWidth, 1), Math.max(clientHeight, 1), false)
}

function setLabelLayerEnabled(enabled) {
  labelRenderer.domElement.style.visibility = enabled ? '' : 'hidden'
}

function setShadowQuality(moving) {
  const size = moving ? ORBIT_SHADOW_MAP_SIZE : IDLE_SHADOW_MAP_SIZE
  const type = moving ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap
  if (renderer.shadowMap.type !== type) renderer.shadowMap.type = type
  if (keyLight.shadow.mapSize.x !== size || keyLight.shadow.mapSize.y !== size) {
    keyLight.shadow.mapSize.set(size, size)
    if (keyLight.shadow.map) {
      keyLight.shadow.map.dispose()
      keyLight.shadow.map = null
    }
  }
  renderer.shadowMap.needsUpdate = true
}

function applyBodySkinPreview(moving) {
  if (surfaceFinish !== 'skin') return
  const material = moving ? getOrbitSkinMaterial() : getIdleSkinMaterial()
  modelGroup.traverse((object) => {
    if (!object.isMesh || isNailMesh(object)) return
    object.material = material
  })
}

function setOrbitFastView(active) {
  if (orbitFastView === active) return
  orbitFastView = active
  applyAuthoringPixelRatio(active)
  setShadowQuality(active)
  setLabelLayerEnabled(!active)
  applyBodySkinPreview(active)
  if (!active) {
    lastLabelCheck = 0
    updateMarkerScales({ labels: true })
    updateLabelVisibility(performance.now(), { force: true })
  }
}

function syncOrbitFastView(now = performance.now()) {
  setOrbitFastView(shouldUseFastOrbitView({
    pointerDown: orbitPointerDown,
    lastChangeAt: lastOrbitChangeAt,
    now,
  }))
}

function prepareModelMaterials(gltf) {
  // Preserve author materials for toggling; only restyle nail landmark meshes.
  gltf.scene.traverse((object) => {
    if (!object.isMesh) return
    if (!object.userData.originalMaterial) {
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      object.userData.originalMaterial = Array.isArray(object.material)
        ? materials.map((material) => material?.clone?.() ?? material)
        : (object.material?.clone?.() ?? object.material)
    }
    if (isNailMesh(object)) {
      const toe = `${object.name || ''}`.toLowerCase().includes('toe')
      object.material = createNailMaterial()
      object.renderOrder = 5
      if (!object.userData.nailScaled) {
        object.scale.multiplyScalar(toe ? 1.45 : 2.6)
        object.userData.nailScaled = true
      }
      object.frustumCulled = false
      return
    }
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    materials.forEach((material) => {
      if (!material) return
      // Keep sculptural contrast: IBL should not fill muscle grooves.
      if ('envMapIntensity' in material) material.envMapIntensity = 0.1
      if ('flatShading' in material) material.flatShading = false
      if ('color' in material && material.color) {
        // Slightly off-white so pure specular blowout is less likely.
        material.color.setHex(0xe8e4de)
      }
      if ('roughness' in material && material.roughness < 0.4) material.roughness = 0.45
      material.needsUpdate = true
    })
  })
  applySurfaceFinish(gltf.scene)
}

function applySurfaceFinish(root = modelGroup) {
  root.traverse((object) => {
    if (!object.isMesh || isNailMesh(object)) return
    if (surfaceFinish === 'skin') {
      object.material = orbitFastView ? getOrbitSkinMaterial() : getIdleSkinMaterial()
      return
    }
    const original = object.userData.originalMaterial
    if (original) {
      object.material = Array.isArray(original)
        ? original.map((material) => material?.clone?.() ?? material)
        : (original?.clone?.() ?? original)
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      materials.forEach((material) => {
        if (!material) return
        if ('envMapIntensity' in material) material.envMapIntensity = 0.1
        if ('color' in material && material.color) material.color.setHex(0xe8e4de)
        if ('roughness' in material && material.roughness < 0.4) material.roughness = 0.45
        material.needsUpdate = true
      })
    }
  })
}

async function loadBodyModel(bodyId, { keepDocument = false } = {}) {
  const body = resolveStudioBodyId(bodyId)
  const preset = BODY_MODELS[body]
  wantedBody = body
  const seq = ++bodyLoadSeq
  loadingBody = body
  const isStale = () => !isCurrentBodyLoad(seq, bodyLoadSeq, wantedBody, body)
  try {
    setModelLoadingUi(`正在載入${preset.label}模型…`)
    await yieldToMain()
    if (isStale()) return false
    // Free the current body (and JSON meridians) before decoding the next GLB.
    // Male JSON + female mesh together previously exhausted memory and the
    // female load then toasted 女性模型載入失敗.
    releaseLoadedBody()
    await yieldToMain()
    if (isStale()) return false
    const gltf = await loadStudioGltf(bodyModelHref(body), (event) => {
      if (isStale() || !event.total) return
      setModelLoadingUi(`正在載入${preset.label}模型 ${Math.round(event.loaded / event.total * 100)}%`)
    })
    if (isStale()) return false
    prepareModelMaterials(gltf)
    if (!keepDocument) {
      state = cloneStudioDocument(documentsByBody[body]) || emptyDocument(body)
      history.replace(state)
      linkedMeridianIds.clear()
      state.meridians.forEach((route) => linkedMeridianIds.add(route.meridianId))
      state = { ...state, meridians: normalizeMeridianColors(state.meridians) }
      syncVisibleMeridiansFromDocument({ selectAll: true })
    }
    activeBody = body
    syncBodyModelSelect()
    setModelLoadingUi(`正在顯示${preset.label}模型…`)
    await applyModel(gltf, preset.fileName, null, { isStale })
    if (isStale()) return false
    setStatus(`${preset.label}模型已就緒 · 請匯入對應 JSON 穴位資料`)
    $('#model-status').textContent = `${preset.label} · ${preset.fileName}`
    clearModelLoadingUi()
    return true
  } catch (error) {
    if (isStale()) return false
    toast(`${preset.label}模型載入失敗：${error.message}`, 'error')
    clearModelLoadingUi()
    return false
  } finally {
    if (loadingBody === body && seq === bodyLoadSeq) loadingBody = null
  }
}

async function setActiveBodyModel(bodyId) {
  const body = resolveStudioBodyId(bodyId)
  if (!shouldLoadBodyModel({
    requestedBody: body,
    activeBody,
    meshCount: modelMeshes.length,
    inFlightBody: loadingBody,
  })) {
    syncBodyModelSelect()
    return
  }
  if (modelMeshes.length) {
    documentsByBody[activeBody] = cloneStudioDocument(state) || emptyDocument(activeBody)
  }
  selected = null
  detachOrbitLock({ restorePerspective: false })
  const loaded = await loadBodyModel(body, { keepDocument: false })
  if (!loaded) return
  try {
    autoEnsureCompletedMeridians()
    rebuildAnnotations()
    updateUI()
  } catch (error) {
    toast(`已切換為${BODY_MODELS[body].label}模型，但穴位重繪失敗：${error.message}`, 'error')
    return
  }
  toast(`已切換為${BODY_MODELS[body].label}模型（穴位資料各自獨立；匯入 JSON 套用到目前模型）`)
}

async function loadDefaultModel() {
  await loadBodyModel('male', { keepDocument: true })
}

async function loadModel(file) {
  if (!file?.name.toLowerCase().endsWith('.glb')) return toast('目前僅支援二進位 .glb 模型', 'error')
  const url = URL.createObjectURL(file)
  try {
    setModelLoadingUi(`正在載入 ${file.name}…`)
    const gltf = await loadStudioGltf(url)
    prepareModelMaterials(gltf)
    const inferred = inferBodyModel({ name: file.name, body: activeBody })
    activeBody = inferred
    await applyModel(gltf, file.name)
    syncBodyModelSelect()
    clearModelLoadingUi()
    toast(`已載入 ${file.name}`)
  } catch (error) {
    toast(`模型載入失敗：${error.message}`, 'error')
    clearModelLoadingUi()
  } finally {
    URL.revokeObjectURL(url)
  }
}

function resize() {
  const { clientWidth, clientHeight } = viewport
  const aspect = Math.max(clientWidth, 1) / Math.max(clientHeight, 1)
  perspectiveCamera.aspect = aspect
  perspectiveCamera.updateProjectionMatrix()
  if (orbitLocked) syncOrthographicFrustum(lockedOrthoHalfHeight)
  else {
    orthographicCamera.left = -aspect
    orthographicCamera.right = aspect
    orthographicCamera.top = 1
    orthographicCamera.bottom = -1
    orthographicCamera.updateProjectionMatrix()
  }
  camera.updateProjectionMatrix()
  applyAuthoringPixelRatio(orbitFastView)
  labelRenderer.setSize(clientWidth, clientHeight)
  updateSkinDecalUniforms()
}
new ResizeObserver(resize).observe(viewport)
renderer.setAnimationLoop((time) => {
  controls.update()
  enforceLockedView()
  syncOrbitFastView(time)
  updateMarkerScales({ labels: !orbitFastView })
  if (!orbitFastView) updateLabelVisibility(time)
  renderer.render(scene, camera)
  if (!orbitFastView) labelRenderer.render(scene, camera)
})

$('#meridian-filter').addEventListener('change', () => {
  selectedCatalog = pointsForMeridian($('#meridian-filter').value)[0]
  $('#catalog-search').value = ''
  selected = null
  renderCatalog()
  rebuildAnnotations()
  updateUI()
})
$('#catalog-search').addEventListener('input', renderCatalog)
$('#catalog').addEventListener('click', (event) => {
  const button = event.target.closest('[data-code]')
  if (!button) return
  selectedCatalog = POINT_BY_CODE.get(button.dataset.code)
  renderCatalog()
  syncAppModeUI()
})

$('#mode-view').addEventListener('click', () => setAppMode('view'))
$('#mode-edit').addEventListener('click', () => setAppMode('edit'))
$('#delete-selection').addEventListener('click', () => {
  if (appMode !== 'edit') return toast('檢視模式為唯讀，請切換編輯後再刪除', 'warn')
  if (!selected) return toast('請先選取要刪除的穴位或經脈', 'warn')
  removeSelected()
})
$('#face-front').addEventListener('click', () => {
  faceBodySide('front')
})
$('#face-back').addEventListener('click', () => {
  faceBodySide('back')
})
$('#visible-meridians').addEventListener('change', (event) => {
  const input = event.target.closest('input[type="checkbox"][data-meridian-id]')
  if (!input) return
  const meridianId = input.dataset.meridianId
  if (input.checked) {
    visibleMeridianIds.add(meridianId)
    const result = ensureMeridianRoutes(meridianId, { commitHistory: false })
    if (result.ok && result.created) {
      state = history.commit(state)
      persistState()
    } else if (!result.ok && result.reason && !result.reason.includes('請先完成')) {
      /* incomplete — no route yet */
    }
  } else {
    visibleMeridianIds.delete(meridianId)
  }
  rebuildAnnotations()
  updateUI()
})
$('#visible-meridians-all').addEventListener('click', () => {
  meridiansWithPlacedData().forEach((item) => visibleMeridianIds.add(item.id))
  autoEnsureCompletedMeridians()
  rebuildAnnotations()
  updateUI()
})
$('#visible-meridians-none').addEventListener('click', () => {
  visibleMeridianIds.clear()
  rebuildAnnotations()
  updateUI()
})

// Capture phase: stop OrbitControls from starting a rotate when dragging markers/handles.
renderer.domElement.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return
  if (appMode !== 'edit') return
  if (orbitLocked) {
    controls.enableRotate = false
  }
  if (nearestHandleHit(event) || nearestAcupointMarkerHit(event)) {
    controls.enabled = false
  }
}, true)

renderer.domElement.addEventListener('pointerdown', (event) => {
  pointerDown = { x: event.clientX, y: event.clientY }
  if (event.button !== 0) return
  if (appMode !== 'edit') return

  const startAcupointDrag = (hit) => {
    const point = getPoint(hit.object.userData.id)
    if (!point) return false
    dragging = {
      type: 'acupoint',
      id: point.id,
      routeId: null,
      nodeIndex: null,
    }
    selected = { type: 'acupoint', id: point.id, pairId: point.pairId || null }
    syncControlsEnabled()
    capturePointer(event)
    return true
  }

  const startHandleDrag = (hit) => {
    const data = hit.object.userData
    selected = {
      type: 'meridian',
      id: data.routeId,
      pairId: state.meridians.find((item) => item.id === data.routeId)?.pairId || null,
      fromPointId: data.fromPointId,
      toPointId: data.toPointId,
    }
    const start = handleDragAnchor(data)
    dragging = {
      type: 'route-handle',
      id: null,
      routeId: data.routeId,
      fromPointId: data.fromPointId,
      toPointId: data.toPointId,
      handleIndex: data.handleIndex ?? 0,
      rest: start?.rest || null,
      records: start?.records || null,
      anchor: start?.anchor || null,
      pendingHit: null,
    }
    syncAppModeUI()
    syncControlsEnabled()
    capturePointer(event)
    return true
  }

  const acupointHit = nearestAcupointMarkerHit(event)
  const handleHit = nearestHandleHit(event)
  const routeHit = annotationHit(event, ['meridian'])
  // Black locators sit on the ribbon next to large female acupoint discs.
  // Prefer whichever gizmo is closer on screen so a click on a black dot
  // reshapes the meridian instead of dragging 肩井/淵腋.
  if (handleHit && (!acupointHit || screenDistanceToHit(event, handleHit) <= screenDistanceToHit(event, acupointHit))) {
    startHandleDrag(handleHit)
    return
  }
  // A click on the ribbon selects the span. Only the inner 8 px of an
  // acupoint disc starts a point drag, so large female 肩井/淵腋 markers do
  // not swallow GB21–GB22.
  if (acupointHit && (!routeHit || screenDistanceToHit(event, acupointHit) <= 8)) {
    startAcupointDrag(acupointHit)
    return
  }
})
renderer.domElement.addEventListener('pointermove', (event) => {
  if (!dragging) return
  if (!exceedsDragThreshold(pointerDown, { x: event.clientX, y: event.clientY })) return
  if (dragging.type === 'route-handle') {
    const hit = handleDragHit(event, dragging)
    if (!hit) return
    dragMoved = true
    dragging.pendingHit = hit
    previewHandleDrag(dragging, hit)
    return
  }
  const hit = surfaceHit(event)
  if (!hit) return
  dragMoved = true
  previewAcupointDrag(dragging.id, hit)
})
renderer.domElement.addEventListener('pointerup', onPointerUp)
renderer.domElement.addEventListener('pointercancel', onPointerUp)

function onPointerUp(event) {
  const click = pointerDown
    && Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) <= 4
    && event.button === 0
  pointerDown = null
  if (dragging) {
    const wasHandle = dragging.type === 'route-handle'
    const wasAcupoint = dragging.type === 'acupoint'
    const pendingHit = dragging.pendingHit
    const handleRouteId = dragging.routeId
    const handleFrom = dragging.fromPointId
    const handleTo = dragging.toPointId
    const handleIndex = dragging.handleIndex
    const moved = dragMoved
    const draggedId = dragging.id
    dragging = null
    dragMoved = false
    dragBaseline = null
    if (wasHandle && orbitLocked && !orbitLockSticky) {
      detachOrbitLock({ restorePerspective: true })
    }
    syncControlsEnabled()
    if (moved) {
      if (wasHandle && pendingHit) {
        state = setSegmentHandle(handleRouteId, handleFrom, handleTo, pendingHit, handleIndex)
      }
      if (wasAcupoint) {
        clearPathCaches()
        const point = getPoint(draggedId)
        if (point) {
          const meridian = meridianById(point.meridianId)
          if (meridian) {
            const synced = syncMeridianRoutes(state.meridians, meridian, state.acupoints, {
              allowCreate: linkedMeridianIds.has(meridian.id)
                || state.meridians.some((route) => route.meridianId === meridian.id),
            })
            state = { ...state, meridians: synced }
          }
        }
      }
      state = history.commit(state)
      persistState()
    }
    rebuildAnnotations()
    updateUI()
    if (moved) {
      setStatus(wasHandle
        ? '已依定位點沿皮膚重繪這段經脈（可按「回復上一步」還原）'
        : '穴位位置已更新並同步左右配對')
    }
    return
  }
  syncControlsEnabled()
  if (click) placeAt(event)
}

$('#lock-orbit').addEventListener('click', () => {
  setOrbitLocked(!orbitLocked, { sticky: true })
  syncAppModeUI()
})
$('#redraw-segment')?.addEventListener('click', () => redrawSelectedSegment())
$('#add-locator')?.addEventListener('click', () => addLocatorToSelectedPair())
$('#remove-locator')?.addEventListener('click', () => removeLocatorFromSelectedPair())

function undoLastStep() {
  applyHistory(history.undo(), '已回復上一步')
}

$('#undo-step')?.addEventListener('click', undoLastStep)

$('#objects').addEventListener('click', (event) => {
  const button = event.target.closest('[data-id]')
  if (!button) return
  const point = button.dataset.type === 'acupoint' && getPoint(button.dataset.id)
  if (point) {
    selectedCatalog = POINT_BY_CODE.get(point.code) || pointsForMeridian(point.meridianId)[0]
    if (appMode === 'edit') $('#meridian-filter').value = point.meridianId
  }
  selected = {
    type: button.dataset.type,
    id: button.dataset.id,
    pairId: point?.pairId || null,
  }
  rebuildAnnotations()
  updateUI()
})
$('#style-settings').addEventListener('change', (event) => {
  const form = event.currentTarget
  const name = event.target?.name
  if (name === 'surfaceFinish') {
    surfaceFinish = form.surfaceFinish.value === 'skin' ? 'skin' : 'original'
    applySurfaceFinish()
    setStatus(surfaceFinish === 'skin' ? '已套用皮膚色表面' : '已還原原材質表面')
    return
  }
  if (name === 'ribbonWidth' || name === 'ribbonWidthInput') {
    ribbonWidthMm = clampMillimetres(
      name === 'ribbonWidthInput' ? form.ribbonWidthInput.value : form.ribbonWidth.value,
      MIN_RIBBON_WIDTH_MM,
      MAX_RIBBON_WIDTH_MM,
      ribbonWidthMm,
    )
    syncStyleSettings()
    updateSkinDecalUniforms()
    setStatus(`經脈線寬 ${ribbonWidthMm} mm`)
    return
  }
  if (name === 'markerDiameter' || name === 'markerDiameterInput') {
    markerDiameterMm = clampMillimetres(
      name === 'markerDiameterInput' ? form.markerDiameterInput.value : form.markerDiameter.value,
      MIN_MARKER_DIAMETER_MM,
      MAX_MARKER_DIAMETER_MM,
      markerDiameterMm,
    )
    syncStyleSettings()
    // Dot rims are conformed geometry, so a size change rebuilds the fans.
    rebuildAnnotations()
    setStatus(`穴位直徑 ${markerDiameterMm} mm`)
    return
  }
  if (name === 'skinLift' || name === 'skinLiftInput') {
    skinLiftMm = clampMillimetres(
      name === 'skinLiftInput' ? form.skinLiftInput.value : form.skinLift.value,
      0,
      MAX_SKIN_LIFT_MM,
      skinLiftMm,
    )
    syncStyleSettings()
    updateSkinDecalUniforms()
    setStatus(skinLiftMm > 0 ? `離皮位移 ${skinLiftMm} mm` : '經脈與穴位完全貼皮（位移 0）')
    return
  }
  if (name === 'xrayEdit') {
    xrayEdit = Boolean(form.xrayEdit?.checked)
    updateSkinDecalUniforms()
    setStatus(xrayEdit ? '編輯透視已開啟' : '編輯透視已關閉')
    return
  }
  if (name === 'gridEnabled') {
    gridEnabled = Boolean(form.gridEnabled?.checked)
    applyViewportGrid()
    setStatus(gridEnabled ? `格線間距 ${gridSpacing}px · 旋轉 ${gridRotation}°` : '已隱藏格線')
    return
  }
  if (name === 'gridSpacing' || name === 'gridSpacingInput') {
    gridSpacing = clampGridSpacing(
      name === 'gridSpacingInput' ? form.gridSpacingInput.value : form.gridSpacing.value,
    )
    applyViewportGrid()
    setStatus(`格線間距 ${gridSpacing}px`)
    return
  }
  if (name === 'gridRotation' || name === 'gridRotationInput') {
    gridRotation = clampGridRotation(
      name === 'gridRotationInput' ? form.gridRotationInput.value : form.gridRotation.value,
    )
    applyViewportGrid()
    setStatus(`格線旋轉 ${gridRotation}°`)
    return
  }
  if (name === 'modelZoom' || name === 'modelZoomInput') {
    setZoomFactor(
      name === 'modelZoomInput' ? form.modelZoomInput.value : form.modelZoom.value,
      { announce: true },
    )
    return
  }
  applyStyleSettings(Object.fromEntries(new FormData(form)))
})
$('#style-settings').addEventListener('input', (event) => {
  const name = event.target?.name
  if (name === 'gridSpacing') {
    gridSpacing = clampGridSpacing(event.target.value)
    applyViewportGrid()
    return
  }
  if (name === 'gridRotation') {
    gridRotation = clampGridRotation(event.target.value)
    applyViewportGrid()
    return
  }
  if (name === 'modelZoom') {
    setZoomFactor(event.target.value)
    return
  }
})
$('#undo').addEventListener('click', undoLastStep)
$('#redo').addEventListener('click', () => applyHistory(history.redo(), '已重做'))
$('#validate').addEventListener('click', () => {
  const result = validateDocument(state)
  toast(result.valid ? 'JSON v2 結構有效' : result.errors.join('；'), result.valid ? 'ok' : 'error')
})
$('#export').addEventListener('click', exportJSON)
$('#model-file').addEventListener('change', (event) => loadModel(event.target.files[0]))
$('#json-file').addEventListener('change', (event) => {
  const file = event.target.files[0]
  event.target.value = ''
  if (file) importJSON(file)
})

window.addEventListener('keydown', (event) => {
  const editing = ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    applyHistory(event.shiftKey ? history.redo() : history.undo(), event.shiftKey ? '已重做' : '已回復上一步')
  } else if (!editing && (event.key === 'Delete' || event.key === 'Backspace')) removeSelected()
})

for (const eventName of ['dragenter', 'dragover']) {
  viewport.addEventListener(eventName, (event) => {
    event.preventDefault()
    $('#drop-hint').classList.add('visible')
  })
}
viewport.addEventListener('dragleave', () => $('#drop-hint').classList.remove('visible'))
viewport.addEventListener('drop', (event) => {
  event.preventDefault()
  $('#drop-hint').classList.remove('visible')
  loadModel(event.dataTransfer.files[0])
})

renderCatalog()
// Fresh start: default male model, no auto-loaded acupoint JSON.
state = emptyDocument('male')
documentsByBody.male = structuredClone(state)
documentsByBody.female = emptyDocument('female')
history.replace(state)
linkedMeridianIds.clear()
visibleMeridianIds.clear()
selected = null
syncBodyModelSelect()
rebuildAnnotations()
updateUI()
applyViewportGrid()
syncZoomUI({ force: true })
resize()
let lastZoomForUi = getZoomFactor()
controls.addEventListener('start', () => {
  orbitPointerDown = true
  lastOrbitChangeAt = performance.now()
  syncOrbitFastView()
})
controls.addEventListener('change', () => {
  if (orbitPointerDown || orbitFastView) lastOrbitChangeAt = performance.now()
  const zoom = getZoomFactor()
  if (Math.abs(zoom - lastZoomForUi) < 0.0008) return
  lastZoomForUi = zoom
  syncZoomUI({ flash: true })
  // Strip width and the dot pixel floor live in the shader, so zooming only
  // refreshes uniforms — the on-skin geometry never has to be rebuilt.
  updateSkinDecalUniforms()
})
controls.addEventListener('end', () => {
  orbitPointerDown = false
  lastOrbitChangeAt = performance.now()
  lastZoomForUi = getZoomFactor()
  syncZoomUI({ force: true })
})
$('#body-model-filter').addEventListener('change', (event) => {
  setActiveBodyModel(event.target.value)
})
if (isDevMode(import.meta.env)) {
  window.__studio = {
    dump() {
      const summarize = (pts) => {
        if (!pts.length) return null
        const xs = pts.map((p) => p[0])
        const ys = pts.map((p) => p[1])
        const zs = pts.map((p) => p[2])
        let maxEdge = 0
        for (let i = 1; i < pts.length; i += 1) {
          maxEdge = Math.max(maxEdge, Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]))
        }
        return {
          n: pts.length,
          xMin: Math.min(...xs),
          xMax: Math.max(...xs),
          xSpread: Math.max(...xs) - Math.min(...xs),
          yMin: Math.min(...ys),
          yMax: Math.max(...ys),
          zMin: Math.min(...zs),
          zMax: Math.max(...zs),
          maxEdge,
          mid: pts[Math.floor(pts.length / 2)],
        }
      }
      return {
        body: state.model?.body,
        bodyHeightWorld,
        stature: statureScale(),
        snaps: window.__midlineSnap || [],
        routes: routeVisuals.map(({ line, route }) => {
          const pts = (line.userData.tubePoints || []).map((p) => [p.x, p.y, p.z])
          return {
            id: route.id,
            meridianId: route.meridianId,
            unresolved: line.userData.unresolvedSamples || 0,
            pairKeys: line.userData.pairKeys || [],
            ...summarize(pts),
            pts,
          }
        }),
        acupoints: state.acupoints.map((p) => ({
          code: p.code,
          name: p.name,
          position: p.position,
        })),
      }
    },
    profileX0(y0, y1, fromBack = false) {
      const hits = []
      const step = Math.max(0.4, (y1 - y0) / 24)
      for (let y = y0; y <= y1 + 1e-6; y += step) {
        const origin = fromBack ? new THREE.Vector3(0, y, -80) : new THREE.Vector3(0, y, 80)
        const dir = fromBack ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 0, -1)
        const hit = raySkinHits(origin, dir, 200, dir.clone().negate())[0]
        if (hit) hits.push({ y, p: hit.position.map((v) => Math.round(v * 1000) / 1000), n: hit.normal.map((v) => Math.round(v * 1000) / 1000) })
      }
      return hits
    },
    frame(target, position) {
      if (orbitLocked) setOrbitLocked(false)
      controls.target.set(...target)
      camera.position.set(...position)
      camera.up.set(0, 1, 0)
      camera.lookAt(controls.target)
      controls.update()
      syncZoomUI({ force: true })
    },
  }
}
loadDefaultModel()
