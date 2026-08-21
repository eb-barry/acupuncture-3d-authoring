import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import { Line2 } from 'three/addons/lines/Line2.js'
import { LineGeometry } from 'three/addons/lines/LineGeometry.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree, getTriangleHitPointInfo } from 'three-mesh-bvh'
import { MERIDIANS, POINTS, POINT_BY_CODE, meridianById, meridianLineColor, pointsForMeridian } from './catalog.js'
import {
  BODY_MODELS,
  emptyDocument,
  exportFileName,
  inferBodyModel,
  parseDocument,
  validateDocument,
} from './document.js'
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
  isShoulderAxillaWrap,
  marchStandoff,
  outwardWrapGuide,
  pickPairAlongPolyline,
  pruneBacktracking,
  shouldFrontWrap,
  slerpUnitVectors,
  surfaceStepLength,
  useConvexChordWrap,
} from './skinPath.js'
import {
  buildCombinedSurfaceGraph,
  collapseOppositeWallSpikes,
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
  HANDLE_SKIN_SNAP_RADIUS,
  HANDLE_STRETCH_MAX_OFF_PATH,
  HANDLE_STRETCH_PROJECT_RADIUS,
  HANDLE_PICK_RADIUS_PX,
  buildRouteNodesFromPlaced,
  clampHandleT,
  closestTOnPolyline,
  defaultHandleTs,
  exceedsDragThreshold,
  isDisorderedPolyline,
  isOcclusionHitBlocking,
  isProbeOnSameLimbSegment,
  isSurfaceFacingCamera,
  keepPairHandles,
  mergeControlsIntoRoute,
  nearestScreenIndex,
  placementProgress,
  pointAtPolylineT,
  polylineArcLength,
  pullPolylineThroughLocators,
  distanceToPolyline,
  removePointIdsFromRouteNodes,
  resolveHandleSlots,
  routeHasDrawableAcupoints,
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
      <label class="button">匯入 JSON<input id="json-file" type="file" accept=".json,application/json" hidden></label>
      <button id="validate">驗證</button><button id="export">匯出</button>
    </div>
    <nav class="tools" aria-label="模式與工具">
      <button id="mode-view" class="tool" type="button" aria-pressed="false" title="唯讀檢視：可旋轉縮放、勾選顯示、匯入匯出">◎ <span>檢視</span></button>
      <button id="mode-edit" class="tool active" type="button" aria-pressed="true" title="編輯：點皮膚加穴、拖曳穴位與經脈曲度">✎ <span>編輯</span></button>
      <button id="face-front" class="tool" type="button" title="自動將身體正面朝向螢幕，方便定位任脈">▣ <span>正面朝向</span></button>
      <button id="face-back" class="tool" type="button" title="自動將身體背面朝向螢幕，方便定位督脈">▦ <span>背面朝向</span></button>
      <button id="lock-orbit" class="tool" type="button" aria-pressed="false" title="鎖定旋轉：可上下左右平移，視角朝向不變，仍可編輯">🔒 <span>鎖定旋轉</span></button>
      <button id="redraw-segment" class="tool finish" type="button" disabled title="依目前黑點，沿皮膚重繪這兩個穴位之間的經脈">⟳ <span>重繪經脈</span></button>
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
      <p>編輯模式：點皮膚定位穴位。點兩個穴位之間的經脈可出現黑點（短段一顆，長段三顆）。拖黑點時經脈會跟著走；也可按「重繪經脈」依目前黑點重畫這一段。任督二脈沒有黑點。拉錯可按「回復上一步」。</p>
    </div>
  </aside>
  <section class="stage">
    <div id="viewport" tabindex="0"><div id="viewport-grid" class="viewport-grid" aria-hidden="true"></div></div>
    <div id="zoom-indicator" class="zoom-indicator" aria-live="polite">1.00×</div>
    <div class="stage-help" id="stage-help">拖曳旋轉 · 滾輪縮放 · 右鍵／Shift 平移</div>
    <div class="axis"><i class="x"></i>X <i class="y"></i>Y <i class="z"></i>Z</div>
    <div id="drop-hint">放開以載入 GLB</div>
  </section>
  <aside class="panel inspector-panel">
    <div class="panel-heading"><span>場景物件</span><b id="object-count">0</b></div>
    <div class="object-filters">
      <label class="scene-meridian-field">人體模型
        <select id="body-model-filter">
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
            <li><i style="background:#ef4444"></i>穴位直徑 · 固定 10px</li>
          </ul>
        </div>
        <label>模型表面<select name="surfaceFinish">
          <option value="skin" selected>皮膚色</option>
          <option value="original">原材質（白瓷）</option>
        </select></label>
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
        <p class="form-help">經脈為平面 3px 線、穴位為平面 10px 圓點。經脈顏色：任督藍、陰經綠、陽經紅。編輯模式可改穴位顏色；檢視模式為唯讀。格線為螢幕輔助線，不寫入 JSON。</p>
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
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 0.88
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
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
const visibleMeridianIds = new Set()
const linkedMeridianIds = new Set()
const storageKeyForBody = (body) => `meridian-studio-document-v2-${inferBodyModel({ body })}`
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
const createModelLoader = () => {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
  const draco = new DRACOLoader()
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/')
  loader.setDRACOLoader(draco)
  return loader
}

const sideLabel = (side) => ({ left: '左側', right: '右側', midline: '中線' })[side] || side
const shortSide = (side) => ({ left: 'L', right: 'R', midline: 'M' })[side] || ''
const escapeHtml = (value) => {
  const div = document.createElement('div')
  div.textContent = value
  return div.innerHTML
}

function setStatus(message) { $('#status').textContent = message }
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
    documentsByBody[body] = structuredClone(state)
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
  const button = $('#redraw-segment')
  if (!button) return
  const enabled = selectedSegmentReady()
    && !isRenDuMeridian(state.meridians.find((item) => item.id === selected.id)?.meridianId)
  button.disabled = !enabled
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

function cameraFacingAnchor(node, amount = 0.003) {
  const resolved = resolvedNode(node)
  const position = new THREE.Vector3(...resolved.position)
  const toCamera = camera.position.clone().sub(position)
  if (toCamera.lengthSq() < 1e-12) return position
  return position.addScaledVector(toCamera.normalize(), amount)
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
  screenPointer(event)
  const hit = raycaster.intersectObjects(modelMeshes, false)[0]
  if (!hit?.face) return null
  const normal = hit.face.normal.clone()
    .applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld))
    .normalize()
  // Orient toward the camera — body-radial flips break medial limbs / 肘窩.
  const toCamera = camera.position.clone().sub(hit.point)
  if (toCamera.lengthSq() > 1e-10 && normal.dot(toCamera) < 0) normal.negate()
  return { position: toArray(hit.point), normal: toArray(normal) }
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
  pool.sort((a, b) => a.distance - b.distance)
  return pool[0]
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
  const accept = (hit) => hit && isProbeOnSameLimbSegment(rest, hit.position, HANDLE_STRETCH_MAX_OFF_PATH)
  const direct = surfaceHit(event)
  if (accept(direct)) return direct
  const planePoint = cameraPlanePoint(event, new THREE.Vector3(...anchor.position))
  if (planePoint) {
    const projected = projectHandleOnSkin(
      planePoint,
      anchor.normal,
      Math.max(HANDLE_STRETCH_PROJECT_RADIUS, HANDLE_SKIN_SNAP_RADIUS * 0.7),
      sideX,
    )
    if (accept(projected)) return projected
  }
  if (direct) {
    const snapped = closestSkinHit(direct.position, {
      maxDistance: HANDLE_SKIN_SNAP_RADIUS,
      sideX,
      guideNormal: direct.normal,
    })
    if (accept(snapped)) return snapped
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
    if (point) return { type: 'acupoint', pointId: mirrorId, position: point.position, normal: point.normal }
  }
  const mirrored = mirroredNode(node)
  return { type: 'control', pointId: null, ...mirrored }
}

function appendSkinPoint(points, point, previousRef) {
  if (previousRef.current && previousRef.current.distanceToSquared(point) <= 1e-8) return
  points.push(point)
  previousRef.current = point
}

/** Cast from a short stand-off along a guide normal onto the nearest skin hit. */
function projectFromOutside(chordPoint, guide, standoff) {
  const normal = new THREE.Vector3(...guide)
  if (normal.lengthSq() < 1e-10) return null
  normal.normalize()
  const origin = chordPoint.clone().addScaledVector(normal, standoff)
  const caster = new THREE.Raycaster(origin, normal.clone().negate(), 0, standoff * 2.2)
  const hit = caster.intersectObjects(modelMeshes, false)[0]
  if (!hit?.face) return null
  const hitNormal = hit.face.normal.clone()
    .applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld))
    .normalize()
  if (hitNormal.dot(normal) < 0) hitNormal.negate()
  return { position: toArray(hit.point), normal: toArray(hitNormal) }
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
  return snapped.points.map((point, index) => (
    new THREE.Vector3(...point).addScaledVector(
      new THREE.Vector3(...(snapped.normals[index] || [0, 1, 0])),
      SKIN_LIFT,
    )
  ))
}

function clearPathCaches() {
  geodesicCache.clear()
  restPathCache.clear()
  shortArcCache = null
}

function rebuildSurfaceGraph() {
  clearPathCaches()
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

function wrapProbeGuides(guide, sideX, frontBias) {
  const lateral = Number.isFinite(sideX) && Math.abs(sideX) > 1e-6 ? Math.sign(sideX) : 1
  const guides = [guide]
  if (frontBias) {
    guides.push([0, 0, 1])
    guides.push(normalizeGuide([guide[0], Math.max(guide[1], 0.15), 1]))
    guides.push(normalizeGuide([lateral * 0.45, 0.2, 1]))
    guides.push(normalizeGuide([lateral * 0.7, 0.35, 0.55]))
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
  if (previous && shouldFrontWrap(from, to)) {
    const prevZ = previous.isVector3 ? previous.z : previous[2]
    if (Number.isFinite(prevZ) && hit.position[2] < prevZ - 0.055) return false
  }
  return true
}

function hitFromWrapProbe(chord, guide, sideX, from, to, previous = null) {
  const frontBias = shouldFrontWrap(from, to)
  const standoffs = frontBias ? [0.1, 0.16, 0.24, 0.34] : [0.14, 0.22]
  for (const nextGuide of wrapProbeGuides(guide, sideX, frontBias)) {
    for (const standoff of standoffs) {
      const pushed = chord.clone().addScaledVector(new THREE.Vector3(...nextGuide), standoff)
      const hit = projectFromOutside(pushed, nextGuide, standoff * 1.8)
        || closestSkinHit(toArray(pushed), {
          maxDistance: 0.28,
          sideX,
          guideNormal: nextGuide,
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
  if (isShoulderAxillaWrap(from, to)) return simplifyLiftedPolyline(points)
  return fillClippedSpans(points, sideX, from, to)
}

function wrapWaypointBetween(a, b, sideX, wrapFrom, wrapTo) {
  const mid = a.clone().lerp(b, 0.5)
  const from = wrapFrom || toArray(a)
  const to = wrapTo || toArray(b)
  const dropY = Math.abs(from[1] - to[1])
  const guide = outwardWrapGuide(toArray(mid), sideX, { dropY })
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
      ? closestSkinHit(toArray(mid), { maxDistance: 0.36, sideX })
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
function skinSegmentPoints(a, b, { allowGeodesic = true } = {}) {
  const start = new THREE.Vector3(...a.position)
  const end = new THREE.Vector3(...b.position)
  let normal = new THREE.Vector3(...a.normal).normalize()
  const endNormal = new THREE.Vector3(...b.normal).normalize()
  const normalDot = normal.dot(endNormal)
  const totalDist = Math.max(start.distanceTo(end), 1e-6)
  const sideX = (a.position[0] + b.position[0]) / 2
  const wrapFirst = isShoulderAxillaWrap(a.position, b.position)
    || (shouldFrontWrap(a.position, b.position) && useConvexChordWrap(normalDot) && chordDivesThroughSkin(a, b))
  if (wrapFirst) {
    const wrapped = snapChordSamplesToSkin(a, b)
    if (wrapped?.length >= 2) return wrapped
  }
  if (allowGeodesic && !isShoulderAxillaWrap(a.position, b.position)) {
    const geodesic = geodesicOnSkin(a, b)
    if (geodesicIsStable(geodesic)) return geodesic
  }
  let pos = start.clone()
  // Convex wrap: the 3D chord is inside the head or shoulder. Snap samples
  // onto the outer skin so the line does not vanish into the mesh.
  if (useConvexChordWrap(normalDot) && chordDivesThroughSkin(a, b)) {
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
    const skipGeodesic = isShoulderAxillaWrap(
      resolvedNode(anchors[index]).position,
      resolvedNode(anchors[index + 1]).position,
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
function pairDrawnSkinPoints(fromResolved, toResolved, records, rest = null, { preview = false } = {}) {
  const restGuide = rest?.length >= 2 ? rest : null
  if (!records.length) {
    return restGuide
      ? vectorsFromArrays(restGuide)
      : skinSegmentPoints(fromResolved, toResolved)
  }
  const restArrays = restGuide ? arraysFromSkin(restGuide) : []
  const movedOffPath = records.some((record) => (
    !restArrays.length || distanceToPolyline(restArrays, record.position) > 0.004
  ))
  if (preview && restArrays.length >= 2) {
    const lifted = records.map((record) => ({
      position: toArray(offsetPosition(record, SKIN_LIFT)),
    }))
    return vectorsFromArrays(pullPolylineThroughLocators(restArrays, lifted, 0.09))
  }
  const restLooksClean = restArrays.length >= 2
    && !isDisorderedPolyline(restArrays, [fromResolved.position, toResolved.position])
  if (!movedOffPath && restLooksClean) return vectorsFromArrays(restGuide)
  const anchors = [
    fromResolved,
    ...records.map((record) => ({
      position: record.position,
      normal: record.normal,
    })),
    toResolved,
  ]
  const joined = joinOnSkin(anchors)
  const joinedArrays = joined ? arraysFromSkin(joined) : []
  if (joinedArrays.length >= 2 && !isDisorderedPolyline(joinedArrays, restArrays.length ? restArrays : [fromResolved.position, toResolved.position])) {
    return joined
  }
  if (restArrays.length >= 2) {
    const lifted = records.map((record) => ({
      position: toArray(offsetPosition(record, SKIN_LIFT)),
    }))
    return vectorsFromArrays(pullPolylineThroughLocators(restArrays, lifted, 0.09))
  }
  return joined || skinSegmentPoints(fromResolved, toResolved)
}

/** Continuous on-skin polyline: 穴→點 or 穴→點一→點二→穴. */
function skinCurvePoints(route, override = null) {
  const nodes = route.nodes
  if (!nodes.length) return []
  const acupointIndexes = nodes
    .map((node, index) => (node.type === 'acupoint' ? index : -1))
    .filter((index) => index >= 0)
  if (!acupointIndexes.length) return []
  if (acupointIndexes.length === 1) return [offsetPosition(resolvedNode(nodes[acupointIndexes[0]]), SKIN_LIFT)]

  const referenceArc = shortSegmentReferenceArc(route.side)
  const points = []
  const previousRef = { current: null }
  for (let pair = 0; pair < acupointIndexes.length - 1; pair += 1) {
    const fromIndex = acupointIndexes[pair]
    const toIndex = acupointIndexes[pair + 1]
    const fromNode = nodes[fromIndex]
    const toNode = nodes[toIndex]
    const a = resolvedNode(fromNode)
    const b = resolvedNode(toNode)
    const isOverride = override
      && fromNode.pointId === override.fromPointId
      && toNode.pointId === override.toPointId
    const handles = keepPairHandles(nodes.slice(fromIndex + 1, toIndex).filter((node) => node.type === 'control'))
    const rest = isOverride && override.rest
      ? override.rest
      : restPathArrays(fromNode, toNode)
    const count = visibleHandleCount(polylineArcLength(rest), referenceArc, handles.length)
    const records = isOverride && override.records
      ? override.records
      : pairHandleRecords(fromNode, toNode, handles, count, rest)
    const segment = pairDrawnSkinPoints(a, b, records, rest, { preview: Boolean(isOverride && override.preview) })
    const start = points.length === 0 ? 0 : 1
    for (let i = start; i < segment.length; i += 1) {
      appendSkinPoint(points, segment[i], previousRef)
    }
  }
  return points.length >= 2
    ? points
    : acupointIndexes.map((index) => offsetPosition(resolvedNode(nodes[index]), SKIN_LIFT))
}

function restPathArrays(fromNode, toNode) {
  const a = resolvedNode(fromNode)
  const b = resolvedNode(toNode)
  const key = geodesicCacheKey(a, b)
  const reverseKey = geodesicCacheKey(b, a)
  const usableCached = (cached) => {
    if (!cached?.length) return false
    if (!isShoulderAxillaWrap(a.position, b.position)) return true
    return !isDisorderedPolyline(cached, [a.position, b.position])
  }
  if (restPathCache.has(key) && usableCached(restPathCache.get(key))) {
    return restPathCache.get(key).map((point) => [...point])
  }
  if (restPathCache.has(reverseKey) && usableCached(restPathCache.get(reverseKey))) {
    return restPathCache.get(reverseKey).map((point) => [...point]).reverse()
  }
  const points = skinSegmentPoints(a, b).map(toArray)
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
  const sideX = pairSideX(fromNode, toNode)
  return closestSkinHit(placed.position, {
    maxDistance: HANDLE_SKIN_SNAP_RADIUS,
    sideX,
    guideNormal: placed.normal,
  }) || projectNearSurface(placed.position, placed.normal) || placed
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
  if (handle?.position) {
    return snapHandleToSkin({ position: handle.position, normal: handle.normal }, fromNode, toNode)
  }
  const t = 0.5
  return restPathAnchor(fromNode, toNode, rest, t)
}

function pairWaypoints(fromNode, toNode, handles, count, rest) {
  const slots = resolveHandleSlots(handles, count, rest)
  const defaults = defaultHandleTs(count)
  return slots.map((handle, index) => {
    if (handle) return segmentHandlePosition(fromNode, toNode, handle, rest)
    return restPathAnchor(fromNode, toNode, rest, defaults[index])
  })
}

function pairHandleRecords(fromNode, toNode, handles, count, rest) {
  const slots = resolveHandleSlots(handles, count, rest)
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

function createMeridianLine(points, color) {
  const positions = []
  points.forEach((point) => {
    positions.push(point.x, point.y, point.z)
  })
  const geometry = new LineGeometry()
  geometry.setPositions(positions)
  const material = new LineMaterial({
    color: new THREE.Color(color).getHex(),
    linewidth: FIXED_LINE_WIDTH,
    worldUnits: false,
    dashed: false,
    transparent: false,
    depthTest: true,
    depthWrite: true,
  })
  material.resolution.set(Math.max(viewport.clientWidth, 1), Math.max(viewport.clientHeight, 1))
  const line = new Line2(geometry, material)
  line.computeLineDistances()
  line.renderOrder = 2
  line.frustumCulled = false
  line.userData.tubePoints = points.map((point) => point.clone())
  line.userData.lineWidth = FIXED_LINE_WIDTH
  return line
}

function replaceRouteLine(routeId, points) {
  if (points?.length < 2) return
  const index = routeVisuals.findIndex((entry) => entry.route.id === routeId)
  if (index < 0) return
  const previous = routeVisuals[index]
  const next = createMeridianLine(points, meridianLineColor(previous.route.meridianId))
  next.userData.type = 'meridian'
  next.userData.id = routeId
  annotationGroup.remove(previous.line)
  previous.line.geometry?.dispose?.()
  previous.line.material?.dispose?.()
  annotationGroup.add(next)
  routeVisuals[index] = { line: next, route: previous.route }
}

function markerFacingLift(point, pixelSize) {
  const distance = camera.position.distanceTo(new THREE.Vector3(...resolvedNode(point).position))
  const markerRadius = pixelSizeToWorld(pixelSize, distance) * 0.5
  let lift = Math.max(0.003, markerRadius * 0.25)
  const hasRoute = state.meridians.some((route) => route.meridianId === point.meridianId)
  if (hasRoute) {
    const lineRadius = Math.max(0.0004, pixelSizeToWorld(FIXED_LINE_WIDTH, distance) * 0.5)
    lift = Math.max(lift, lineRadius + markerRadius * 0.35)
  }
  return lift
}

function updateRouteLineMaterials() {
  const width = Math.max(viewport.clientWidth, 1)
  const height = Math.max(viewport.clientHeight, 1)
  routeVisuals.forEach(({ line }) => {
    if (line?.material?.resolution) line.material.resolution.set(width, height)
  })
}

function createFlatMarkerMaterial(color, { selected = false } = {}) {
  return new THREE.MeshBasicMaterial({
    color,
    depthTest: true,
    depthWrite: true,
    transparent: true,
    opacity: selected ? 1 : 0.92,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  })
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

function acupointPairs(route) {
  const indexes = route.nodes
    .map((node, index) => (node.type === 'acupoint' ? index : -1))
    .filter((index) => index >= 0)
  const pairs = []
  for (let index = 0; index < indexes.length - 1; index += 1) {
    const fromIndex = indexes[index]
    const toIndex = indexes[index + 1]
    pairs.push({
      fromIndex,
      toIndex,
      fromNode: route.nodes[fromIndex],
      toNode: route.nodes[toIndex],
      fromPointId: route.nodes[fromIndex].pointId,
      toPointId: route.nodes[toIndex].pointId,
      handles: keepPairHandles(
        route.nodes.slice(fromIndex + 1, toIndex).filter((node) => node.type === 'control'),
      ),
    })
  }
  return pairs
}

function nearestAcupointPair(route, worldPoint, line = null) {
  const probe = worldPoint?.isVector3 ? worldPoint : new THREE.Vector3(...toArray(worldPoint))
  const samples = line?.userData?.tubePoints
  const pairs = acupointPairs(route)
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
    .forEach((pair) => {
      const rest = restPathArrays(pair.fromNode, pair.toNode)
      const count = visibleHandleCount(polylineArcLength(rest), referenceArc, pair.handles.length)
      pairWaypoints(pair.fromNode, pair.toNode, pair.handles, count, rest)
        .forEach((placed, handleIndex) => {
          const handle = new THREE.Mesh(
            new THREE.SphereGeometry(0.5, 12, 10),
            createFlatMarkerMaterial(0x111111, { selected: true }),
          )
          handle.position.copy(offsetPosition(placed, 0.006))
          handle.scale.setScalar(0.012)
          handle.renderOrder = 12
          handle.material.depthTest = true
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
  handleVisuals.forEach(({ mesh }) => annotationGroup.remove(mesh))
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

function rebuildAnnotations() {
  annotationGroup.clear()
  markerVisuals = []
  routeVisuals = []
  handleVisuals = []
  midpointVisuals = []

  const displayIds = new Set(visibleMeridianIdList())

  // Completed meridians (routes in state) always draw when checked on the right.
  state.meridians
    .filter((route) => displayIds.has(route.meridianId))
    .forEach((route) => {
      const points = skinCurvePoints(route)
      if (points.length < 2) return
      const mesh = createMeridianLine(points, meridianLineColor(route.meridianId))
      mesh.userData.type = 'meridian'
      mesh.userData.id = route.id
      annotationGroup.add(mesh)
      routeVisuals.push({ line: mesh, route })
      if (isRouteSelected(route)) addRouteEditHandles(route)
    })

  // Show acupoints for every checked meridian on the right panel.
  state.acupoints
    .filter((point) => displayIds.has(point.meridianId))
    .forEach((point) => {
      const isSelected = selected?.type === 'acupoint'
        && (selected.id === point.id || (point.pairId && selected.pairId === point.pairId))
      const pixelSize = FIXED_MARKER_SIZE
      const anchor = cameraFacingAnchor(point, markerFacingLift(point, pixelSize))
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 20, 16),
        createFlatMarkerMaterial(point.color, { selected: isSelected }),
      )
      marker.position.copy(anchor)
      marker.renderOrder = 8
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

function updateMarkerScales() {
  updateRouteLineMaterials()
  markerVisuals.forEach(({ mesh, label, point }) => {
    const pixelSize = FIXED_MARKER_SIZE
    const anchor = cameraFacingAnchor(point, markerFacingLift(point, pixelSize))
    mesh.position.copy(anchor)
    if (label) label.position.copy(anchor)
    const distance = camera.position.distanceTo(mesh.position)
    mesh.scale.setScalar(pixelSizeToWorld(pixelSize, distance))
    if (label?.element) {
      label.element.style.setProperty('--marker-size', `${pixelSize}px`)
      applyLabelPlacement(label.element, point)
    }
  })
  const handleSize = (position, pixels = 14) =>
    pixelSizeToWorld(pixels, camera.position.distanceTo(position))
  handleVisuals.forEach(({ mesh }) => {
    mesh.scale.setScalar(handleSize(mesh.position, 10))
  })
  midpointVisuals.forEach(({ mesh }) => {
    mesh.scale.setScalar(handleSize(mesh.position, 12))
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

function updateLabelVisibility(time) {
  if (time - lastLabelCheck < 50) return
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
          <i class="point-dot" style="background:${primary.color}"></i>
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
  if (selected?.type === 'acupoint') {
    const point = state.acupoints.find((entry) => entry.id === selected.id)
    if (point) markerColor = point.color
  }
  form.markerColor.innerHTML = colorOptions(markerColor)
  if (form.surfaceFinish) form.surfaceFinish.value = surfaceFinish
  if (form.gridEnabled) form.gridEnabled.checked = gridEnabled
  if (form.gridSpacing) form.gridSpacing.value = gridSpacing
  if (form.gridSpacingInput) form.gridSpacingInput.value = gridSpacing
  if (form.gridRotation) form.gridRotation.value = gridRotation
  if (form.gridRotationInput) form.gridRotationInput.value = gridRotation
  form.querySelectorAll('.grid-spacing-field, .grid-rotation-field').forEach((field) => {
    field.dataset.disabled = gridEnabled ? 'false' : 'true'
  })
  form.querySelectorAll('.doc-style-field').forEach((field) => {
    field.dataset.disabled = appMode === 'edit' ? 'false' : 'true'
  })
  if (form.markerColor) form.markerColor.disabled = appMode !== 'edit'
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
      return matches ? { ...item, color: markerColor, size: FIXED_MARKER_SIZE } : item
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
    ? '可拖黑點改走向 · 放開或按「重繪經脈」後沿皮膚重畫這一段'
    : '點兩穴之間的經脈出現黑點（短段一顆，長段三顆），再拖到皮膚上的新位置'
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

function normalizeFixedStyles(documentState) {
  return {
    ...documentState,
    settings: {
      ...documentState.settings,
      markerSize: FIXED_MARKER_SIZE,
      lineWidth: FIXED_LINE_WIDTH,
    },
    meridians: (documentState.meridians || []).map((route) => ({
      ...route,
      width: FIXED_LINE_WIDTH,
      color: meridianLineColor(route.meridianId),
    })),
    acupoints: (documentState.acupoints || []).map((point) => ({
      ...point,
      size: FIXED_MARKER_SIZE,
    })),
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
    color: state.settings.markerColor,
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
    const firstSide = $('#point-side').value
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
  if (fromIndex < 0 || toIndex <= fromIndex) return nodes
  return [...nodes.slice(0, fromIndex + 1), ...controls, ...nodes.slice(toIndex)]
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
      return { ...item, nodes: replacePairHandles(item.nodes, fromPointId, toPointId, controls) }
    }
    if (pairRoute && item.id === pairRoute.id && mirrorFrom && mirrorTo) {
      return { ...item, nodes: replacePairHandles(item.nodes, mirrorFrom, mirrorTo, mirrored) }
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
  const index = Math.min(Math.max(0, handleIndex), records.length - 1)
  if (!isProbeOnSameLimbSegment(rest, hit.position, HANDLE_STRETCH_MAX_OFF_PATH)) return state
  const tooClose = records.some((record, cursor) => {
    if (cursor === index) return false
    const gap = Math.hypot(
      hit.position[0] - record.position[0],
      hit.position[1] - record.position[1],
      hit.position[2] - record.position[2],
    )
    return gap < 0.01
  })
  if (tooClose) return state
  records[index] = {
    type: 'control',
    pointId: null,
    position: [...hit.position],
    normal: [...hit.normal],
    style: 'along',
  }
  return writePairHandles(routeId, fromPointId, toPointId, records)
}

function previewHandleDrag(drag, hit) {
  const pairId = state.meridians.find((item) => item.id === drag.routeId)?.pairId || null
  handleVisuals.forEach(({ mesh }) => {
    const data = mesh.userData
    if (data.handleIndex !== drag.handleIndex) return
    const same = data.routeId === drag.routeId
    const mirrored = Boolean(pairId)
      && data.routeId !== drag.routeId
      && state.meridians.find((item) => item.id === data.routeId)?.pairId === pairId
    if (!same && !mirrored) return
    const node = same
      ? hit
      : {
        position: [-hit.position[0], hit.position[1], hit.position[2]],
        normal: [-hit.normal[0], hit.normal[1], hit.normal[2]],
      }
    mesh.position.copy(offsetPosition(node, 0.006))
  })
  if (!drag.records?.length || drag.handleIndex == null) return
  const route = state.meridians.find((item) => item.id === drag.routeId)
  if (!route) return
  const pair = acupointPairs(route).find((item) =>
    item.fromPointId === drag.fromPointId && item.toPointId === drag.toPointId)
  if (!pair) return
  const records = drag.records.map((record, index) => (
    index === drag.handleIndex
      ? { ...record, position: [...hit.position], normal: [...hit.normal] }
      : record
  ))
  replaceRouteLine(route.id, skinCurvePoints(route, {
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
      replaceRouteLine(mirror.id, skinCurvePoints(mirror, {
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

function placeAt(event) {
  const markerHit = annotationHit(event, ['acupoint'])
  if (markerHit) {
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

  const routeHit = annotationHit(event, ['meridian'])
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
    if (route) replaceRouteLine(route.id, skinCurvePoints(route))
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
  const body = inferBodyModel(result.value.model)
  const preset = BODY_MODELS[body]
  state = normalizeFixedStyles({
    ...result.value,
    model: {
      ...result.value.model,
      body,
      name: result.value.model?.name || preset.fileName,
    },
  })
  activeBody = body
  documentsByBody[body] = structuredClone(state)
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
  await loadBodyModel(body, { keepDocument: true })
  rebuildAnnotations()
  updateUI()
  toast(`已匯入 ${preset.label}穴位：${state.meridians.length} 條路線、${state.acupoints.length} 個定位點`)
}

function applyModel(gltf, name, hash = null) {
  const root = gltf.scene
  const box = new THREE.Box3().setFromObject(root)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  if (!Number.isFinite(size.y) || size.y === 0) throw new Error('模型尺寸無效')

  modelGroup.clear()
  modelMeshes = []
  surfaceGraph = null
  clearPathCaches()
  modelGroup.add(root)

  // Recenter at origin and sit on y=0 (same framing approach as the turntable viewer).
  root.position.x += -center.x
  root.position.z += -center.z
  root.position.y += -box.min.y
  root.updateMatrixWorld(true)

  const framedBox = new THREE.Box3().setFromObject(root)
  const framedSize = framedBox.getSize(new THREE.Vector3())
  const maxDim = Math.max(framedSize.x, framedSize.y, framedSize.z, 0.001)

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
      if (!object.geometry.boundsTree) {
        object.geometry.computeBoundsTree()
      }
    }
    modelMeshes.push(object)
  })
  rebuildSurfaceGraph()

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
  state = {
    ...state,
    model: {
      name: name || BODY_MODELS[body].fileName,
      hash,
      body,
    },
  }
  documentsByBody[body] = structuredClone(state)
  history.replace(state)
  $('#model-status').textContent = `${BODY_MODELS[body].label} · ${state.model.name}`
  refreshBodyFrontAxis()
  updateUI()
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
      object.material = createSkinMaterial()
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
  const body = BODY_MODELS[bodyId] ? bodyId : 'male'
  const preset = BODY_MODELS[body]
  try {
    $('#model-status').textContent = `正在載入${preset.label}模型…`
    const modelUrl = new URL(`../models/${preset.fileName}`, import.meta.url)
    modelUrl.searchParams.set('v', 'body-1')
    const gltf = await createModelLoader().loadAsync(modelUrl.href, (event) => {
      if (event.total) {
        $('#model-status').textContent = `正在載入${preset.label}模型 ${Math.round(event.loaded / event.total * 100)}%`
      }
    })
    prepareModelMaterials(gltf)
    activeBody = body
    if (!keepDocument) {
      state = structuredClone(documentsByBody[body] || emptyDocument(body))
      history.replace(state)
      linkedMeridianIds.clear()
      state.meridians.forEach((route) => linkedMeridianIds.add(route.meridianId))
      state = { ...state, meridians: normalizeMeridianColors(state.meridians) }
      syncVisibleMeridiansFromDocument({ selectAll: true })
    }
    applyModel(gltf, preset.fileName)
    syncBodyModelSelect()
    setStatus(`${preset.label}模型已就緒 · 請匯入對應 JSON 穴位資料`)
    return true
  } catch (error) {
    toast(`${preset.label}模型載入失敗：${error.message}`, 'error')
    return false
  }
}

async function setActiveBodyModel(bodyId) {
  const body = BODY_MODELS[bodyId] ? bodyId : 'male'
  if (body === activeBody) return
  documentsByBody[activeBody] = structuredClone(state)
  selected = null
  detachOrbitLock({ restorePerspective: false })
  await loadBodyModel(body, { keepDocument: false })
  autoEnsureCompletedMeridians()
  rebuildAnnotations()
  updateUI()
  toast(`已切換為${BODY_MODELS[body].label}模型（穴位資料各自獨立）`)
}

async function loadDefaultModel() {
  await loadBodyModel('male', { keepDocument: true })
}

async function loadModel(file) {
  if (!file?.name.toLowerCase().endsWith('.glb')) return toast('目前僅支援二進位 .glb 模型', 'error')
  const url = URL.createObjectURL(file)
  try {
    const gltf = await createModelLoader().loadAsync(url)
    prepareModelMaterials(gltf)
    const inferred = inferBodyModel({ name: file.name, body: activeBody })
    activeBody = inferred
    applyModel(gltf, file.name)
    syncBodyModelSelect()
    toast(`已載入 ${file.name}`)
  } catch (error) {
    toast(`模型載入失敗：${error.message}`, 'error')
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
  renderer.setSize(clientWidth, clientHeight, false)
  labelRenderer.setSize(clientWidth, clientHeight)
  routeVisuals.forEach(({ line }) => {
    if (line.material?.resolution) line.material.resolution.set(clientWidth, clientHeight)
  })
}
new ResizeObserver(resize).observe(viewport)
renderer.setAnimationLoop((time) => {
  controls.update()
  enforceLockedView()
  updateMarkerScales()
  updateLabelVisibility(time)
  renderer.render(scene, camera)
  labelRenderer.render(scene, camera)
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
  if (nearestHandleHit(event) || annotationHit(event, ['acupoint'])) {
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
    return true
  }

  const acupointHit = annotationHit(event, ['acupoint'])
  if (acupointHit) {
    startAcupointDrag(acupointHit)
    return
  }

  const handleHit = nearestHandleHit(event)
  if (handleHit) {
    const data = handleHit.object.userData
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
  replaceWithoutHistory(updatePairedPoint(dragging.id, hit))
})
renderer.domElement.addEventListener('pointerup', onPointerUp)
renderer.domElement.addEventListener('pointercancel', onPointerCancel)
window.addEventListener('pointercancel', onPointerCancel)

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

function onPointerCancel() {
  pointerDown = null
  dragging = null
  dragMoved = false
  dragBaseline = null
  syncControlsEnabled()
}

$('#lock-orbit').addEventListener('click', () => {
  setOrbitLocked(!orbitLocked, { sticky: true })
  syncAppModeUI()
})
$('#redraw-segment')?.addEventListener('click', () => redrawSelectedSegment())

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
$('#json-file').addEventListener('change', (event) => importJSON(event.target.files[0]))

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
let lastTubeZoomFactor = getZoomFactor()
let lastZoomForUi = getZoomFactor()
controls.addEventListener('change', () => {
  const zoom = getZoomFactor()
  if (Math.abs(zoom - lastZoomForUi) < 0.0008) return
  lastZoomForUi = zoom
  syncZoomUI({ flash: true })
  // Keep meridian thickness matched while zooming so tubes do not engulf points.
  updateRouteLineMaterials()
})
controls.addEventListener('end', () => {
  const zoom = getZoomFactor()
  if (Math.abs(zoom - lastTubeZoomFactor) / Math.max(zoom, 0.01) > 0.05) {
    lastTubeZoomFactor = zoom
    rebuildAnnotations()
  }
  lastZoomForUi = zoom
  syncZoomUI({ force: true })
})
$('#body-model-filter').addEventListener('change', (event) => {
  setActiveBodyModel(event.target.value)
})
loadDefaultModel()
