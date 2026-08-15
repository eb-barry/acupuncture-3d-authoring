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
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh'
import { MERIDIANS, POINTS, POINT_BY_CODE, meridianById, pointsForMeridian } from './catalog.js'
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
  marchStandoff,
  pruneBacktracking,
  slerpUnitVectors,
  surfaceStepLength,
} from './skinPath.js'
import {
  buildRouteNodesFromPlaced,
  isOcclusionHitBlocking,
  isSurfaceFacingCamera,
  mergeControlsIntoRoute,
  placementProgress,
  removePointIdsFromRouteNodes,
  routeHasDrawableAcupoints,
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
    <nav class="tools" aria-label="編輯工具">
      <button class="tool active" data-tool="navigate">◎ <span>檢視／調整</span></button>
      <button id="show-meridian" class="tool" type="button" aria-pressed="false" title="切換經脈僅檢視顯示（依右側場景物件所選經脈）">⌁ <span>顯示經脈</span></button>
      <button class="tool" data-tool="point">＋ <span>穴位</span></button>
      <button id="face-front" class="tool" type="button" title="自動將身體正面朝向螢幕，方便定位任脈">▣ <span>正面朝向</span></button>
      <button id="face-back" class="tool" type="button" title="自動將身體背面朝向螢幕，方便定位督脈">▦ <span>背面朝向</span></button>
      <button id="lock-orbit" class="tool" type="button" aria-pressed="false" title="鎖定模型旋轉，方便拉動經脈曲度">🔒 <span>鎖定旋轉</span></button>
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
      <p>完成此經脈所有穴位定位後，開啟「顯示經脈」可依國際代碼自動連線並進入僅檢視模式。</p>
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
      <label class="scene-meridian-field">選擇經脈
        <select id="scene-meridian-filter">${MERIDIANS.map((item) => `<option value="${item.id}">${item.name} · ${item.id}</option>`).join('')}</select>
      </label>
    </div>
    <div id="objects" class="objects"></div>
    <section class="style-panel">
      <div class="panel-heading"><span>樣式設定</span></div>
      <form id="style-settings" class="style-settings">
        <label>穴位顏色<select name="markerColor"></select></label>
        <label>穴位直徑 <output id="marker-size-out">12px</output><input name="markerSize" type="range" min="5" max="30" value="12"></label>
        <label>經脈顏色<select name="lineColor"></select></label>
        <label>經脈線寬 <output id="line-width-out">4px</output><input name="lineWidth" type="range" min="1" max="10" value="4"></label>
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
        <p class="form-help">選取穴位或經脈後調整，會同步套用至左右配對；未選取時作為新定位預設值。表面材質僅影響目前載入的人體模型顯示。格線為螢幕固定輔助線，不隨模型縮放或旋轉改變，也不會寫入匯出 JSON。格線旋轉預設 0°，可調 ±90°。模型放大以載入後的預設視距為 1×，與滾輪縮放同步。</p>
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
let activeTool = 'navigate'
let pointerDown = null
let dragging = null
let dragMoved = false
let orbitLocked = false
const lockedViewOffset = new THREE.Vector3()
const lockedViewUp = new THREE.Vector3(0, 1, 0)
let hasLockedView = false
let lockedPerspectiveDistance = 0
let lockedOrthoHalfHeight = 1
let lockedZoomFactor = 1
let meridianViewMode = false
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
  // While rotation is locked, one-finger touch must not orbit the camera.
  controls.touches = orbitLocked
    ? { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN }
    : { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }
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
  clearLockedView()
  setActiveCamera(perspectiveCamera)
  const lockButton = $('#lock-orbit')
  if (lockButton) {
    lockButton.classList.remove('active')
    lockButton.setAttribute('aria-pressed', 'false')
  }
  syncControlsEnabled()
}

function setOrbitLocked(locked) {
  if (meridianViewMode && locked) {
    toast('顯示經脈為僅檢視模式，請先關閉後再調整曲度', 'warn')
    return
  }
  const nextLocked = Boolean(locked)
  if (nextLocked === orbitLocked) {
    syncControlsEnabled()
    return
  }
  if (nextLocked) {
    orbitLocked = true
    const button = $('#lock-orbit')
    if (button) {
      button.classList.add('active')
      button.setAttribute('aria-pressed', 'true')
    }
    // Perspective pan makes off-center anatomy look turned; switch to ortho so
    // left/right translation keeps the exact same facing.
    fitOrthographicToPerspective()
    setActiveCamera(orthographicCamera)
    captureLockedView()
    syncControlsEnabled()
    rebuildAnnotations()
    syncZoomUI({ force: true })
    setStatus('模型旋轉已鎖定 · 視角固定（平移不改朝向）· 已顯示曲度中點')
    return
  }

  detachOrbitLock({ restorePerspective: true })
  rebuildAnnotations()
  syncZoomUI({ force: true })
  setStatus('模型旋轉已解除鎖定 · 已隱藏曲度中點')
}

function sceneMeridianId() {
  return $('#scene-meridian-filter')?.value || $('#meridian-filter')?.value || selectedCatalog?.meridianId
}

function activeDisplayMeridianId() {
  return meridianViewMode
    ? sceneMeridianId()
    : ($('#meridian-filter')?.value || selectedCatalog?.meridianId)
}

function syncSceneMeridianFilter(meridianId) {
  const select = $('#scene-meridian-filter')
  if (select && meridianId && select.value !== meridianId) select.value = meridianId
}

function updateShowMeridianButton() {
  const button = $('#show-meridian')
  if (!button) return
  const meridianId = sceneMeridianId()
  const required = pointsForMeridian(meridianId)
  const placed = state.acupoints.filter((point) => point.meridianId === meridianId)
  const progress = placementProgress(required, placed)
  const hasRoutes = state.meridians.some((route) => route.meridianId === meridianId)
  button.classList.toggle('active', meridianViewMode)
  button.setAttribute('aria-pressed', meridianViewMode ? 'true' : 'false')
  button.disabled = !meridianViewMode && !hasRoutes && !progress.complete
  button.title = meridianViewMode
    ? '關閉經脈僅檢視顯示'
    : (progress.complete || hasRoutes
      ? '開啟經脈僅檢視顯示（依右側所選經脈）'
      : '完成所有穴位定位後開放')
}

function updateDeleteButton() {
  const button = $('#delete-selection')
  if (!button) return
  const canDelete = Boolean(selected) && !meridianViewMode
  button.disabled = !canDelete
  if (!selected) {
    button.title = '先選取穴位或經脈路線後再刪除'
    return
  }
  if (meridianViewMode) {
    button.title = '顯示經脈為僅檢視模式，請先關閉後再刪除'
    return
  }
  button.title = selected.type === 'acupoint'
    ? '刪除選取的穴位（左右配對會一併移除）'
    : '刪除選取的經脈路線'
}

function buildMeridianRoutesFromPlaced(meridian, placedPoints, {
  previousRoutes = [],
  color = state.settings.lineColor,
  width = state.settings.lineWidth,
} = {}) {
  const required = pointsForMeridian(meridian.id)
  const pairId = meridian.bilateral
    ? (previousRoutes.find((route) => route.pairId)?.pairId || makeId())
    : null
  const sides = meridian.bilateral ? ['left', 'right'] : ['midline']
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
      color: previous?.color || color,
      width: previous?.width || width,
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
      return previous && JSON.stringify(previous.nodes) === JSON.stringify(route.nodes)
    })
  if (unchanged) return meridians
  return [
    ...meridians.filter((route) => route.meridianId !== meridian.id),
    ...nextForMeridian,
  ]
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

/** Lift toward the camera only — keeps screen position on the click/crosshair. */
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

function projectNearSurface(position, normal) {
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
  candidates.sort((a, b) => (
    Math.abs(b.alignment - a.alignment) > 0.12
      ? b.alignment - a.alignment
      : a.distance - b.distance
  ))
  return { position: candidates[0].position, normal: candidates[0].normal }
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

/**
 * March along the mesh from A to B as a single polyline.
 * Opposite-normal segments (太淵→魚際→少商) orbit the limb instead of
 * cutting through / spawning multiple floating chords.
 */
function skinSegmentPoints(a, b) {
  const start = new THREE.Vector3(...a.position)
  const end = new THREE.Vector3(...b.position)
  let pos = start.clone()
  let normal = new THREE.Vector3(...a.normal).normalize()
  const endNormal = new THREE.Vector3(...b.normal).normalize()
  const totalDist = Math.max(pos.distanceTo(end), 1e-6)
  const normalDot = normal.dot(endNormal)
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
  return pruned.map((point) => new THREE.Vector3(...point))
}

/** Continuous on-skin polyline through every route node, endpoint-exact. */
function skinCurvePoints(route) {
  const nodes = route.nodes.map(resolvedNode)
  if (nodes.length === 0) return []
  if (nodes.length === 1) return [offsetPosition(nodes[0], SKIN_LIFT)]

  const points = []
  const previousRef = { current: null }
  for (let index = 0; index < nodes.length - 1; index += 1) {
    const segment = skinSegmentPoints(nodes[index], nodes[index + 1])
    const start = index === 0 ? 0 : 1
    for (let i = start; i < segment.length; i += 1) {
      appendSkinPoint(points, segment[i], previousRef)
    }
  }
  return points.length >= 2 ? points : nodes.map((node) => offsetPosition(node, SKIN_LIFT))
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

function createMeridianTube(points, color, lineWidth) {
  const curve = createPolylineCurve(points)
  const tubularSegments = Math.max(48, (points.length - 1) * 3)
  const anchor = points[Math.floor(points.length / 2)] || controls.target
  const radius = pixelSizeToWorld(lineWidth, camera.position.distanceTo(anchor)) * 0.5
  const geometry = new THREE.TubeGeometry(curve, tubularSegments, radius, 10, false)
  const material = new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.22,
    metalness: 0.42,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
    reflectivity: 0.65,
    envMapIntensity: 1.25,
    depthTest: true,
    depthWrite: true,
    transparent: false,
    opacity: 1,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.renderOrder = 2
  mesh.frustumCulled = false
  return mesh
}

function createGlossySphereMaterial(color, { emissive = 0x000000, emissiveIntensity = 0 } = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.2,
    metalness: 0.28,
    clearcoat: 1,
    clearcoatRoughness: 0.18,
    reflectivity: 0.55,
    envMapIntensity: 1.1,
    emissive,
    emissiveIntensity,
    depthTest: true,
    depthWrite: true,
  })
}

function isRouteSelected(route) {
  return selected?.type === 'meridian'
    && (selected.id === route.id || (route.pairId && selected.pairId === route.pairId))
}

function addRouteEditHandles(route) {
  // View mode never shows adjustment handles. Curve edits are opt-in via orbit lock.
  if (meridianViewMode || !orbitLocked) return

  route.nodes.forEach((node, nodeIndex) => {
    if (node.type !== 'control') return
    const handle = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 16, 12),
      createGlossySphereMaterial(0xffd28c, { emissive: 0x4a3008, emissiveIntensity: 0.15 }),
    )
    handle.position.copy(offsetPosition(node, 0.014))
    handle.scale.setScalar(0.012)
    handle.renderOrder = 6
    handle.userData = { type: 'route-handle', routeId: route.id, nodeIndex }
    annotationGroup.add(handle)
    handleVisuals.push({ mesh: handle, routeId: route.id, nodeIndex })
  })

  // Midpoints between consecutive acupoints — click/drag to bend the segment.
  for (let index = 0; index < route.nodes.length - 1; index += 1) {
    const a = route.nodes[index]
    const b = route.nodes[index + 1]
    if (a.type !== 'acupoint' || b.type !== 'acupoint') continue
    const ra = resolvedNode(a)
    const rb = resolvedNode(b)
    const midPos = [
      (ra.position[0] + rb.position[0]) * 0.5,
      (ra.position[1] + rb.position[1]) * 0.5,
      (ra.position[2] + rb.position[2]) * 0.5,
    ]
    const midNormal = slerpUnitVectors(ra.normal, rb.normal, 0.5)
    const projected = projectNearSurfaceOrFallback(midPos, midNormal, {
      position: midPos,
      normal: midNormal,
    })
    const handle = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 14, 10),
      createGlossySphereMaterial(0x7dd3fc, { emissive: 0x0c4a6e, emissiveIntensity: 0.2 }),
    )
    handle.position.copy(offsetPosition(projected, 0.016))
    handle.scale.setScalar(0.01)
    handle.renderOrder = 5
    handle.userData = {
      type: 'route-midpoint',
      routeId: route.id,
      afterIndex: index,
      position: projected.position,
      normal: projected.normal,
    }
    annotationGroup.add(handle)
    midpointVisuals.push({ mesh: handle, routeId: route.id, afterIndex: index })
  }
}

function rebuildAnnotations() {
  annotationGroup.clear()
  markerVisuals = []
  routeVisuals = []
  handleVisuals = []
  midpointVisuals = []

  const activeMeridianId = activeDisplayMeridianId()

  // 「顯示經脈」ON: tubes for the right-panel meridian, never edit handles.
  // OFF: hide tubes unless orbit is locked for curve editing.
  if (meridianViewMode || orbitLocked) {
    state.meridians
      .filter((route) => route.meridianId === activeMeridianId)
      .forEach((route) => {
        const points = skinCurvePoints(route)
        if (points.length < 2) return
        const mesh = createMeridianTube(points, route.color, route.width)
        mesh.userData = { type: 'meridian', id: route.id }
        annotationGroup.add(mesh)
        routeVisuals.push({ line: mesh, route })
        if (!meridianViewMode && isRouteSelected(route)) addRouteEditHandles(route)
      })
  }

  // Show acupoints for the active meridian (right panel in view mode, left while editing).
  state.acupoints
    .filter((point) => point.meridianId === activeMeridianId)
    .forEach((point) => {
      const isSelected = selected?.type === 'acupoint'
        && (selected.id === point.id || (point.pairId && selected.pairId === point.pairId))
      const pixelSize = Math.max(5, Math.min(30, Number(point.size) || state.settings.markerSize))
      // Camera-facing lift only: normal-offset made neck points (e.g. 天突) drift off the crosshair.
      const anchor = cameraFacingAnchor(point, 0.003)
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 20, 16),
        createGlossySphereMaterial(point.color, {
          emissive: new THREE.Color(point.color).multiplyScalar(0.15),
          emissiveIntensity: isSelected ? 0.35 : 0.18,
        }),
      )
      marker.position.copy(anchor)
      marker.renderOrder = 8
      marker.userData = { type: 'acupoint', id: point.id }
      annotationGroup.add(marker)

      const label = document.createElement('span')
      label.className = `point-marker ${isSelected ? 'selected' : ''}`
      label.style.setProperty('--marker-size', `${pixelSize}px`)
      label.innerHTML = `<b class="point-name">${escapeHtml(point.name)}</b>`
      const labelObject = new CSS2DObject(label)
      labelObject.position.copy(anchor)
      annotationGroup.add(labelObject)
      markerVisuals.push({ mesh: marker, label: labelObject, point })
    })
  updateMarkerScales()
}

function updateMarkerScales() {
  markerVisuals.forEach(({ mesh, label, point }) => {
    const anchor = cameraFacingAnchor(point, 0.003)
    mesh.position.copy(anchor)
    if (label) label.position.copy(anchor)
    const distance = camera.position.distanceTo(mesh.position)
    const pixelSize = Math.max(5, Math.min(30, Number(point.size) || state.settings.markerSize))
    mesh.scale.setScalar(pixelSizeToWorld(pixelSize, distance))
    if (label?.element) {
      label.element.style.setProperty('--marker-size', `${pixelSize}px`)
    }
  })
  const handleSize = (position, pixels = 14) =>
    pixelSizeToWorld(pixels, camera.position.distanceTo(position))
  handleVisuals.forEach(({ mesh }) => {
    mesh.scale.setScalar(handleSize(mesh.position, 15))
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
    <small>${progress.complete ? '已完成，可開啟「顯示經脈」自動連線並檢視' : `尚缺 ${progress.total - progress.placed} 個穴位`}</small>`
  updateShowMeridianButton()
}

function updateSideControl() {
  const meridian = meridianById($('#meridian-filter').value)
  $('#side-control').classList.toggle('hidden', !meridian?.bilateral)
}

function renderObjects() {
  const meridianId = sceneMeridianId()
  const meridian = meridianById(meridianId)
  const required = pointsForMeridian(meridianId)
  const placed = state.acupoints.filter((point) => point.meridianId === meridianId)
  const placedByCode = new Map()
  placed.forEach((point) => {
    const list = placedByCode.get(point.code) || []
    list.push(point)
    placedByCode.set(point.code, list)
  })
  const rows = required
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
  const routeCount = state.meridians.filter((route) => route.meridianId === meridianId).length
  $('#objects').innerHTML = rows.join('') || `<p class="empty">${escapeHtml(meridian?.name || '此經脈')}尚未定位任何穴位</p>`
  $('#object-count').textContent = `${rows.length}${routeCount ? ` · ${routeCount}線` : ''}`
}

function updateUI() {
  $('#undo').disabled = !history.canUndo
  $('#redo').disabled = !history.canRedo
  const meridianDone = new Set(state.meridians.map((item) => item.meridianId)).size
  const heading = document.querySelector('.inspector-panel .panel-heading span')
  if (heading) heading.textContent = `場景物件（${meridianDone}/${MERIDIANS.length} 經脈）`
  renderObjects()
  syncStyleSettings()
  renderCatalog()
  updateShowMeridianButton()
  updateDeleteButton()
  document.body.classList.toggle('meridian-view-mode', meridianViewMode)
}

function syncStyleSettings() {
  const form = $('#style-settings')
  if (!form) return
  let markerColor = state.settings.markerColor
  let markerSize = state.settings.markerSize
  let lineColor = state.settings.lineColor
  let lineWidth = state.settings.lineWidth
  if (selected?.type === 'acupoint') {
    const point = state.acupoints.find((entry) => entry.id === selected.id)
    if (point) {
      markerColor = point.color
      markerSize = point.size
    }
  } else if (selected?.type === 'meridian') {
    const route = state.meridians.find((entry) => entry.id === selected.id)
    if (route) {
      lineColor = route.color
      lineWidth = route.width
    }
  }
  form.markerColor.innerHTML = colorOptions(markerColor)
  form.lineColor.innerHTML = colorOptions(lineColor)
  form.markerSize.value = markerSize
  form.lineWidth.value = lineWidth
  if (form.surfaceFinish) form.surfaceFinish.value = surfaceFinish
  if (form.gridEnabled) form.gridEnabled.checked = gridEnabled
  if (form.gridSpacing) form.gridSpacing.value = gridSpacing
  if (form.gridSpacingInput) form.gridSpacingInput.value = gridSpacing
  if (form.gridRotation) form.gridRotation.value = gridRotation
  if (form.gridRotationInput) form.gridRotationInput.value = gridRotation
  $('#marker-size-out').textContent = `${markerSize}px`
  $('#line-width-out').textContent = `${lineWidth}px`
  form.querySelectorAll('.grid-spacing-field, .grid-rotation-field').forEach((field) => {
    field.dataset.disabled = gridEnabled ? 'false' : 'true'
  })
  syncZoomUI()
}

function applyStyleSettings(data) {
  const markerColor = data.markerColor
  const markerSize = Number(data.markerSize)
  const lineColor = data.lineColor
  const lineWidth = Number(data.lineWidth)
  const settings = { ...state.settings, markerColor, markerSize, lineColor, lineWidth }
  if (selected?.type === 'acupoint') {
    const current = state.acupoints.find((item) => item.id === selected.id)
    if (!current) return
    const acupoints = state.acupoints.map((item) => {
      const matches = item.id === current.id || (current.pairId && item.pairId === current.pairId)
      return matches ? { ...item, color: markerColor, size: markerSize } : item
    })
    commit({ ...state, settings, acupoints }, '穴位樣式已套用至左右配對')
    return
  }
  if (selected?.type === 'meridian') {
    const current = state.meridians.find((item) => item.id === selected.id)
    if (!current) return
    const meridians = state.meridians.map((item) => {
      const matches = item.id === current.id
        || (current.pairId && item.pairId === current.pairId)
        || (!current.pairId && item.meridianId === current.meridianId && item.name === current.name)
      return matches ? { ...item, color: lineColor, width: lineWidth } : item
    })
    commit({ ...state, settings, meridians }, '經脈樣式已套用')
    return
  }
  commit({ ...state, settings }, '已更新新定位樣式預設值')
}

function setTool(tool) {
  if (tool === 'path') {
    setMeridianViewMode(true)
    tool = 'navigate'
  }
  if (meridianViewMode && tool === 'point') {
    toast('顯示經脈為僅檢視模式，請先關閉後再定位穴位', 'warn')
    tool = 'navigate'
  }
  activeTool = tool
  document.querySelectorAll('.tool[data-tool]').forEach((button) =>
    button.classList.toggle('active', button.dataset.tool === tool))
  if ($('#lock-orbit')) $('#lock-orbit').classList.toggle('active', orbitLocked)
  if ($('#show-meridian')) $('#show-meridian').classList.toggle('active', meridianViewMode)
  viewport.className = tool === 'navigate' ? '' : 'placing'
  const midlineId = selectedCatalog && !meridianById(selectedCatalog.meridianId)?.bilateral
    ? selectedCatalog.meridianId
    : null
  const midlineHint = midlineId === 'GV'
    ? ' · 督脈建議先按「背面朝向」'
    : midlineId
      ? ' · 任脈建議先按「正面朝向」'
      : ''
  $('#stage-help').textContent = meridianViewMode
    ? `僅檢視 · ${meridianById(sceneMeridianId())?.name || ''}穴位與經脈線（無調整點）`
    : {
      navigate: orbitLocked
        ? '旋轉已鎖定 · 正交視角 · 左右平移不改變朝向 · 可拉動曲度控制點'
        : '拖曳旋轉 · 「正面／背面朝向」對準視角 · 選取後按「刪除」移除 · 「顯示經脈」僅檢視',
      point: selectedCatalog
        ? `點擊人體表面定位 ${selectedCatalog.code} ${selectedCatalog.name}${midlineHint}`
        : '請先選擇穴位',
    }[tool]
}

function ensureMeridianRoutes(meridianId) {
  const meridian = meridianById(meridianId)
  if (!meridian) return { ok: false, reason: '找不到經脈' }
  const required = pointsForMeridian(meridianId)
  const placed = state.acupoints.filter((point) => point.meridianId === meridianId)
  const existing = state.meridians.filter((route) => route.meridianId === meridianId)
  if (existing.length) {
    const synced = syncMeridianRoutes(state.meridians, meridian, placed)
    if (synced !== state.meridians) {
      state = history.commit({ ...state, meridians: synced })
      persistState()
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
  state = history.commit({ ...state, meridians: [...state.meridians, ...routes] })
  persistState()
  return { ok: true, meridian, created: true, routes }
}

function setMeridianViewMode(enabled) {
  if (enabled) {
    const meridianId = sceneMeridianId()
    const result = ensureMeridianRoutes(meridianId)
    if (!result.ok) {
      toast(result.reason, 'warn')
      return
    }
    if (orbitLocked) detachOrbitLock({ restorePerspective: true })
    meridianViewMode = true
    selected = null
    activeTool = 'navigate'
    rebuildAnnotations()
    updateUI()
    setTool('navigate')
    toast(`僅檢視：${result.meridian.name}${result.created ? '（已自動連線）' : ''}`)
    setStatus(`顯示經脈：${result.meridian.name}（僅檢視）`)
    return
  }

  meridianViewMode = false
  rebuildAnnotations()
  updateUI()
  setTool(activeTool === 'point' ? 'point' : 'navigate')
  setStatus('已關閉經脈僅檢視，可繼續編輯穴位')
}

function toggleMeridianViewMode() {
  setMeridianViewMode(!meridianViewMode)
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
    size: state.settings.markerSize,
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
  syncSceneMeridianFilter(meridian.id)
  const nextAcupoints = [...state.acupoints, ...points]
  const nextMeridians = syncMeridianRoutes(state.meridians, meridian, nextAcupoints, {
    allowCreate: linkedMeridianIds.has(meridian.id) || meridianViewMode,
  })
  const relinked = nextMeridians !== state.meridians
  commit({ ...state, acupoints: nextAcupoints, meridians: nextMeridians },
    meridian.bilateral ? `已建立 ${selectedCatalog.code} 左右配對` : `已定位 ${selectedCatalog.code}`)
  const progress = meridianProgress(meridian.id)
  if (progress.complete) {
    toast(`${meridian.name} 穴位已齊，可開啟「顯示經脈」檢視連線`)
  } else if (relinked) {
    toast(`${selectedCatalog.code} 已接回經脈線段`)
  }
}

function nearestNodeSegment(route, point) {
  let best = { index: 0, distance: Infinity }
  for (let index = 0; index < route.nodes.length - 1; index += 1) {
    const start = new THREE.Vector3(...resolvedNode(route.nodes[index]).position)
    const end = new THREE.Vector3(...resolvedNode(route.nodes[index + 1]).position)
    const line = new THREE.Line3(start, end)
    const closest = line.closestPointToPoint(new THREE.Vector3(...point), true, new THREE.Vector3())
    const distance = closest.distanceTo(new THREE.Vector3(...point))
    if (distance < best.distance) best = { index, distance }
  }
  return best.index
}

function insertRouteControl(routeId, hit, afterIndex = null) {
  const route = state.meridians.find((item) => item.id === routeId)
  if (!route) return toast('找不到經脈路線', 'warn')
  const index = afterIndex == null ? nearestNodeSegment(route, hit.position) : afterIndex
  const node = { type: 'control', pointId: null, ...hit }
  const pairRoute = route.pairId && state.meridians.find((item) => item.pairId === route.pairId && item.id !== route.id)
  const nextRoutes = state.meridians.map((item) => {
    if (item.id === route.id) {
      const nodes = [...item.nodes]
      nodes.splice(index + 1, 0, node)
      return { ...item, nodes }
    }
    if (pairRoute && item.id === pairRoute.id) {
      const nodes = [...item.nodes]
      nodes.splice(index + 1, 0, makeMirroredRouteNode(node))
      return { ...item, nodes }
    }
    return item
  })
  selected = { type: 'meridian', id: route.id, pairId: route.pairId || null }
  commit({ ...state, meridians: nextRoutes }, '已在線段加入曲度控制點')
  return index + 1
}

function placeAt(event) {
  if (meridianViewMode) {
    const markerHit = annotationHit(event, ['acupoint'])
    if (markerHit) {
      const point = getPoint(markerHit.object.userData.id)
      selected = { type: 'acupoint', id: point.id, pairId: point.pairId || null }
      rebuildAnnotations()
      updateUI()
    }
    return
  }
  if (activeTool === 'navigate') {
    const markerHit = annotationHit(event, ['acupoint'])
    if (markerHit) {
      const point = getPoint(markerHit.object.userData.id)
      selected = { type: 'acupoint', id: point.id, pairId: point.pairId || null }
      rebuildAnnotations()
      updateUI()
      return
    }
    const midpointHit = annotationHit(event, ['route-midpoint'])
    if (midpointHit) {
      const data = midpointHit.object.userData
      insertRouteControl(data.routeId, {
        position: data.position,
        normal: data.normal,
      }, data.afterIndex)
      setOrbitLocked(true)
      return
    }
    const routeHit = annotationHit(event, ['meridian'])
    if (routeHit) {
      selected = {
        type: 'meridian',
        id: routeHit.object.userData.id,
        pairId: state.meridians.find((item) => item.id === routeHit.object.userData.id)?.pairId || null,
      }
      rebuildAnnotations()
      updateUI()
    }
    return
  }
  if (activeTool !== 'point') return
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

function updateRouteHandle(routeId, nodeIndex, hit) {
  const route = state.meridians.find((item) => item.id === routeId)
  const mirrored = mirroredNode(hit)
  return {
    ...state,
    meridians: state.meridians.map((item) => {
      if (item.id === routeId) {
        const nodes = [...item.nodes]
        nodes[nodeIndex] = { type: 'control', pointId: null, ...hit }
        return { ...item, nodes }
      }
      if (route?.pairId && item.pairId === route.pairId) {
        const nodes = [...item.nodes]
        nodes[nodeIndex] = { type: 'control', pointId: null, ...mirrored }
        return { ...item, nodes }
      }
      return item
    }),
  }
}

function removeSelected() {
  if (!selected) return
  if (meridianViewMode) {
    toast('顯示經脈為僅檢視模式，請先關閉後再刪除', 'warn')
    return
  }
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
  state = nextState
  selected = null
  meridianViewMode = false
  state.meridians.forEach((route) => linkedMeridianIds.add(route.meridianId))
  persistState()
  rebuildAnnotations()
  updateUI()
  setStatus(message)
}

function exportJSON() {
  const body = inferBodyModel(state.model)
  const preset = BODY_MODELS[body]
  const payload = {
    ...state,
    model: {
      ...state.model,
      body,
      name: state.model?.name || preset.fileName,
    },
  }
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
  state = {
    ...result.value,
    model: {
      ...result.value.model,
      body,
      name: result.value.model?.name || preset.fileName,
    },
  }
  activeBody = body
  documentsByBody[body] = structuredClone(state)
  history.replace(state)
  selected = null
  meridianViewMode = false
  linkedMeridianIds.clear()
  state.meridians.forEach((route) => linkedMeridianIds.add(route.meridianId))
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
  meridianViewMode = false
  selected = null
  detachOrbitLock({ restorePerspective: false })
  await loadBodyModel(body, { keepDocument: false })
  rebuildAnnotations()
  updateUI()
  setTool('navigate')
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
  if (!meridianViewMode) syncSceneMeridianFilter($('#meridian-filter').value)
  renderCatalog()
  rebuildAnnotations()
  updateUI()
  if (activeTool === 'point') setTool('point')
  else setTool('navigate')
})
$('#catalog-search').addEventListener('input', renderCatalog)
$('#catalog').addEventListener('click', (event) => {
  const button = event.target.closest('[data-code]')
  if (!button) return
  selectedCatalog = POINT_BY_CODE.get(button.dataset.code)
  renderCatalog()
  if (activeTool === 'point') setTool('point')
})

document.querySelectorAll('.tool[data-tool]').forEach((button) => button.addEventListener('click', () => {
  setTool(button.dataset.tool)
}))
$('#show-meridian').addEventListener('click', () => {
  toggleMeridianViewMode()
})
$('#delete-selection').addEventListener('click', () => {
  if (!selected) return toast('請先選取要刪除的穴位或經脈', 'warn')
  removeSelected()
})
$('#face-front').addEventListener('click', () => {
  faceBodySide('front')
})
$('#face-back').addEventListener('click', () => {
  faceBodySide('back')
})

// Capture phase: stop OrbitControls from starting a rotate when editing handles,
// and keep rotation inert while the lock is on.
renderer.domElement.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return
  if (orbitLocked) {
    controls.enableRotate = false
  }
  if (meridianViewMode || activeTool !== 'navigate') return
  const hit = annotationHit(event, ['route-midpoint', 'acupoint', 'route-handle'])
  if (!hit) return
  controls.enabled = false
}, true)

renderer.domElement.addEventListener('pointerdown', (event) => {
  pointerDown = { x: event.clientX, y: event.clientY }
  if (meridianViewMode || activeTool !== 'navigate' || event.button !== 0) return

  const midpointHit = annotationHit(event, ['route-midpoint'])
  if (midpointHit) {
    const data = midpointHit.object.userData
    const nodeIndex = insertRouteControl(data.routeId, {
      position: data.position,
      normal: data.normal,
    }, data.afterIndex)
    if (nodeIndex == null) return
    dragging = {
      type: 'route-handle',
      id: null,
      routeId: data.routeId,
      nodeIndex,
    }
    setOrbitLocked(true)
    syncControlsEnabled()
    return
  }

  const hit = annotationHit(event, ['acupoint', 'route-handle'])
  if (!hit) return
  dragging = {
    type: hit.object.userData.type,
    id: hit.object.userData.id,
    routeId: hit.object.userData.routeId,
    nodeIndex: hit.object.userData.nodeIndex,
  }
  if (dragging.type === 'route-handle') setOrbitLocked(true)
  syncControlsEnabled()
})
renderer.domElement.addEventListener('pointermove', (event) => {
  if (!dragging) return
  const hit = surfaceHit(event)
  if (!hit) return
  dragMoved = true
  const next = dragging.type === 'acupoint'
    ? updatePairedPoint(dragging.id, hit)
    : updateRouteHandle(dragging.routeId, dragging.nodeIndex, hit)
  replaceWithoutHistory(next)
})
renderer.domElement.addEventListener('pointerup', (event) => {
  if (dragging) {
    const wasHandle = dragging.type === 'route-handle'
    const moved = dragMoved
    dragging = null
    dragMoved = false
    syncControlsEnabled()
    if (moved) {
      state = history.commit(state)
      persistState()
    }
    rebuildAnnotations()
    updateUI()
    setStatus(wasHandle ? '曲度已更新（模型旋轉保持鎖定，可再調下一段）' : '位置已更新並同步左右配對')
    return
  }
  if (pointerDown && Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) <= 4 && event.button === 0) placeAt(event)
})

$('#lock-orbit').addEventListener('click', () => {
  setOrbitLocked(!orbitLocked)
  if (activeTool === 'navigate') setTool('navigate')
})

$('#scene-meridian-filter').addEventListener('change', () => {
  selected = null
  if (meridianViewMode) {
    const result = ensureMeridianRoutes(sceneMeridianId())
    if (!result.ok) {
      toast(result.reason, 'warn')
    }
  } else {
    $('#meridian-filter').value = sceneMeridianId()
    selectedCatalog = pointsForMeridian(sceneMeridianId())[0]
    renderCatalog()
  }
  rebuildAnnotations()
  updateUI()
  setTool(meridianViewMode ? 'navigate' : activeTool)
})
$('#objects').addEventListener('click', (event) => {
  const button = event.target.closest('[data-id]')
  if (!button) return
  const point = button.dataset.type === 'acupoint' && getPoint(button.dataset.id)
  if (point) {
    selectedCatalog = POINT_BY_CODE.get(point.code) || pointsForMeridian(point.meridianId)[0]
    if (!meridianViewMode) $('#meridian-filter').value = point.meridianId
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
  if (event.target.type !== 'range') return
  const output = event.target.closest('label')?.querySelector('output')
  if (output) output.textContent = `${event.target.value}px`
  if (name === 'markerSize' || name === 'lineWidth') {
    // Live-preview size while dragging; commit on change.
    const form = event.currentTarget
    const data = Object.fromEntries(new FormData(form))
    if (selected?.type === 'acupoint' && name === 'markerSize') {
      const current = state.acupoints.find((item) => item.id === selected.id)
      if (!current) return
      const size = Number(data.markerSize)
      state = {
        ...state,
        settings: { ...state.settings, markerSize: size },
        acupoints: state.acupoints.map((item) =>
          item.id === current.id || (current.pairId && item.pairId === current.pairId)
            ? { ...item, size }
            : item),
      }
      rebuildAnnotations()
      updateMarkerScales()
    }
  }
})
$('#undo').addEventListener('click', () => applyHistory(history.undo(), '已復原'))
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
    applyHistory(event.shiftKey ? history.redo() : history.undo(), event.shiftKey ? '已重做' : '已復原')
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
meridianViewMode = false
selected = null
syncBodyModelSelect()
rebuildAnnotations()
updateUI()
applyViewportGrid()
syncZoomUI({ force: true })
resize()
let lastTubeZoom = camera.position.distanceTo(controls.target)
let lastZoomForUi = getZoomFactor()
controls.addEventListener('change', () => {
  const zoom = getZoomFactor()
  if (Math.abs(zoom - lastZoomForUi) < 0.0008) return
  lastZoomForUi = zoom
  syncZoomUI({ flash: true })
})
controls.addEventListener('end', () => {
  const distance = camera.position.distanceTo(controls.target)
  if (Math.abs(distance - lastTubeZoom) / Math.max(distance, 0.01) > 0.1) {
    lastTubeZoom = distance
    rebuildAnnotations()
  }
  lastZoomForUi = getZoomFactor()
  syncZoomUI({ force: true })
})
$('#body-model-filter').addEventListener('change', (event) => {
  setActiveBodyModel(event.target.value)
})
loadDefaultModel()
