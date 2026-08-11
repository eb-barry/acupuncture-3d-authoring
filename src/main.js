import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import { Line2 } from 'three/addons/lines/Line2.js'
import { LineGeometry } from 'three/addons/lines/LineGeometry.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh'
import { MERIDIANS, POINTS, POINT_BY_CODE, meridianById, pointsForMeridian } from './catalog.js'
import { emptyDocument, parseDocument, validateDocument } from './document.js'
import { History } from './history.js'
import { isSurfaceFacingCamera, nextExpectedPoint, placementProgress } from './workflow.js'

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
  <div class="file-actions">
    <label class="button primary">載入 GLB<input id="model-file" type="file" accept=".glb,model/gltf-binary" hidden></label>
    <label class="button">匯入 JSON<input id="json-file" type="file" accept=".json,application/json" hidden></label>
    <button id="validate">驗證</button><button id="export">匯出</button>
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
      <p>完成此經脈所有穴位定位後，才會開放經脈繪製。</p>
    </div>
  </aside>
  <section class="stage">
    <nav class="tools" aria-label="編輯工具">
      <button class="tool active" data-tool="navigate">◎ <span>檢視／調整</span></button>
      <button class="tool" data-tool="path">⌁ <span>經脈</span></button>
      <button class="tool" data-tool="point">＋ <span>穴位</span></button>
      <button id="finish-path" class="finish hidden">完成路徑</button>
    </nav>
    <div id="viewport" tabindex="0"></div>
    <div class="stage-help" id="stage-help">拖曳旋轉 · Shift/右鍵平移 · 滾輪縮放</div>
    <div class="axis"><i class="x"></i>X <i class="y"></i>Y <i class="z"></i>Z</div>
    <div id="drop-hint">放開以載入 GLB</div>
  </section>
  <aside class="panel inspector-panel">
    <div class="panel-heading"><span>場景物件</span><b id="object-count">0</b></div>
    <div class="object-filters">
      <input id="object-search" class="search" type="search" placeholder="搜尋物件名稱…">
      <select id="object-type"><option value="all">全部</option><option value="acupoint">穴位</option><option value="meridian">經脈</option></select>
    </div>
    <div id="objects" class="objects"></div>
    <section class="style-panel">
      <div class="panel-heading"><span>樣式設定</span></div>
      <form id="style-settings" class="style-settings">
        <label>穴位顏色<select name="markerColor"></select></label>
        <label>穴位直徑 <output id="marker-size-out">12px</output><input name="markerSize" type="range" min="5" max="30" value="12"></label>
        <label>經脈顏色<select name="lineColor"></select></label>
        <label>經脈線寬 <output id="line-width-out">4px</output><input name="lineWidth" type="range" min="1" max="10" value="4"></label>
        <p class="form-help">選取穴位或經脈後調整，會同步套用至左右配對；未選取時作為新定位預設值。</p>
      </form>
    </section>
    <div class="inspector"><div class="panel-heading"><span>屬性</span></div><form id="properties"><p class="empty">選取經脈或穴位以編輯或刪除</p></form></div>
  </aside>
</main>
<footer><span id="model-status">正在載入人體模型…</span><span id="status">就緒</span><span>WebGL · 本機資料</span></footer>
<div id="toast" role="status"></div>`

const viewport = $('#viewport')
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x101817)
scene.fog = new THREE.Fog(0x101817, 5, 11)
const camera = new THREE.PerspectiveCamera(34, 1, 0.01, 50)
camera.position.set(3.4, 1.7, 4.6)

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.shadowMap.enabled = true
viewport.append(renderer.domElement)

const labelRenderer = new CSS2DRenderer()
labelRenderer.domElement.className = 'label-layer'
viewport.append(labelRenderer.domElement)

const controls = new OrbitControls(camera, renderer.domElement)
// Dev/QA hook for scripted camera framing (e.g. foot landmark checks).
window.__acuStudio = { camera, controls, scene, renderer }
controls.target.set(0, 1.45, 0)
controls.enableDamping = true
controls.dampingFactor = 0.08
controls.minDistance = 1.2
controls.maxDistance = 10

scene.add(new THREE.HemisphereLight(0xf1faf6, 0x24332f, 2.8))
const keyLight = new THREE.DirectionalLight(0xffead2, 3.2)
keyLight.position.set(3, 5, 4)
keyLight.castShadow = true
scene.add(keyLight)
const fillLight = new THREE.DirectionalLight(0xcde5ff, 2.0)
fillLight.position.set(-3, 2, 4)
scene.add(fillLight)
const rimLight = new THREE.DirectionalLight(0x74b9b0, 1.6)
rimLight.position.set(-4, 2, -3)
scene.add(rimLight)
scene.add(new THREE.GridHelper(8, 32, 0x38514d, 0x1d2c2a))

const modelGroup = new THREE.Group()
const annotationGroup = new THREE.Group()
scene.add(modelGroup, annotationGroup)

let modelMeshes = []
let markerVisuals = []
let routeVisuals = []
let handleVisuals = []
let state = emptyDocument()
const history = new History(state)
let selected = null
let selectedCatalog = pointsForMeridian('LU')[0]
let activeTool = 'navigate'
let draftNodes = []
let draftSide = null
let pointerDown = null
let dragging = null
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
const createModelLoader = () => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)

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

function commit(nextState, message) {
  state = history.commit(nextState)
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
  const radial = new THREE.Vector3(hit.point.x, 0, hit.point.z)
  if (radial.lengthSq() > 0.000001 && normal.dot(radial) < 0) normal.negate()
  return { position: toArray(hit.point), normal: toArray(normal) }
}

function annotationHit(event, types) {
  screenPointer(event)
  const objects = [
    ...markerVisuals.map((entry) => entry.mesh),
    ...handleVisuals.map((entry) => entry.mesh),
    ...routeVisuals.map((entry) => entry.line),
  ]
  return raycaster.intersectObjects(objects, false)
    .find((hit) => types.includes(hit.object.userData.type))
}

function projectNearSurface(position, normal) {
  const target = new THREE.Vector3(...position)
  const direction = new THREE.Vector3(...normal).normalize()
  const candidates = []
  for (const sign of [1, -1]) {
    const caster = new THREE.Raycaster(
      target.clone().addScaledVector(direction, 0.25 * sign),
      direction.clone().multiplyScalar(-sign),
      0,
      0.5,
    )
    const hit = caster.intersectObjects(modelMeshes, false)[0]
    if (hit?.face) {
      const hitNormal = hit.face.normal.clone()
        .applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld))
        .normalize()
      const radial = new THREE.Vector3(hit.point.x, 0, hit.point.z)
      if (radial.lengthSq() > 0.000001 && hitNormal.dot(radial) < 0) hitNormal.negate()
      candidates.push({
        distance: hit.point.distanceTo(target),
        position: toArray(hit.point),
        normal: toArray(hitNormal),
      })
    }
  }
  candidates.sort((a, b) => a.distance - b.distance)
  return candidates.length
    ? { position: candidates[0].position, normal: candidates[0].normal }
    : { position, normal }
}

function mirroredNode(node) {
  const resolved = resolvedNode(node)
  const mirroredPosition = [-resolved.position[0], resolved.position[1], resolved.position[2]]
  const mirroredNormal = [-resolved.normal[0], resolved.normal[1], resolved.normal[2]]
  return projectNearSurface(mirroredPosition, mirroredNormal)
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

function skinCurvePoints(route) {
  const nodes = route.nodes.map(resolvedNode)
  const positions = nodes.map((node) => new THREE.Vector3(...node.position))
  if (positions.length < 2) return positions
  const curve = new THREE.CatmullRomCurve3(positions, false, 'centripetal', 0.4)
  const samples = curve.getPoints(Math.max(24, (positions.length - 1) * 24))
  return samples.map((sample, index) => {
    const t = index / Math.max(samples.length - 1, 1)
    const nodeIndex = Math.min(nodes.length - 1, Math.round(t * (nodes.length - 1)))
    const projected = projectNearSurface(toArray(sample), nodes[nodeIndex].normal)
    return offsetPosition(projected, 0.012)
  })
}

function rebuildAnnotations() {
  annotationGroup.clear()
  markerVisuals = []
  routeVisuals = []
  handleVisuals = []

  state.meridians.forEach((route) => {
    const points = skinCurvePoints(route)
    const geometry = new LineGeometry()
    geometry.setPositions(points.flatMap(toArray))
    const material = new LineMaterial({
      color: route.color,
      linewidth: route.width,
      transparent: true,
      opacity: selected?.type === 'meridian' && selected.id === route.id ? 1 : 0.86,
      depthTest: true,
      resolution: new THREE.Vector2(viewport.clientWidth, viewport.clientHeight),
    })
    const line = new Line2(geometry, material)
    line.computeLineDistances()
    line.renderOrder = 3
    line.userData = { type: 'meridian', id: route.id }
    annotationGroup.add(line)
    routeVisuals.push({ line, route })

    if (selected?.type === 'meridian' && selected.id === route.id) {
      route.nodes.forEach((node, nodeIndex) => {
        if (node.type !== 'control') return
        const handle = new THREE.Mesh(
          new THREE.SphereGeometry(0.5, 14, 10),
          new THREE.MeshBasicMaterial({ color: 0xffd28c, depthTest: false }),
        )
        handle.position.copy(offsetPosition(node, 0.016))
        handle.scale.setScalar(0.025)
        handle.renderOrder = 5
        handle.userData = { type: 'route-handle', routeId: route.id, nodeIndex }
        annotationGroup.add(handle)
        handleVisuals.push({ mesh: handle, routeId: route.id, nodeIndex })
      })
    }
  })

  state.acupoints.forEach((point) => {
    const isSelected = selected?.type === 'acupoint'
      && (selected.id === point.id || (point.pairId && selected.pairId === point.pairId))
    const pixelSize = Math.max(5, Math.min(30, Number(point.size) || state.settings.markerSize))
    // Invisible picking sphere in world space; visible marker is CSS2D (always on top).
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 12, 10),
      new THREE.MeshBasicMaterial({
        color: point.color,
        depthTest: false,
        depthWrite: false,
        transparent: true,
        opacity: 0.001,
      }),
    )
    marker.position.copy(offsetPosition(point, 0.03))
    marker.renderOrder = 20
    marker.userData = { type: 'acupoint', id: point.id }
    annotationGroup.add(marker)

    const label = document.createElement('span')
    label.className = `point-marker ${isSelected ? 'selected' : ''}`
    label.style.setProperty('--marker-color', point.color)
    label.style.setProperty('--marker-size', `${pixelSize}px`)
    label.innerHTML = `<i class="marker-dot" aria-hidden="true"></i><b class="point-name">${escapeHtml(point.name)}</b>`
    const labelObject = new CSS2DObject(label)
    labelObject.position.copy(marker.position)
    annotationGroup.add(labelObject)
    markerVisuals.push({ mesh: marker, label: labelObject, point })
  })
  drawDraft()
}

function drawDraft() {
  const previous = annotationGroup.getObjectByName('draft')
  if (previous) annotationGroup.remove(previous)
  if (draftNodes.length < 2) return
  const positions = skinCurvePoints({ nodes: draftNodes })
  const geometry = new LineGeometry()
  geometry.setPositions(positions.flatMap(toArray))
  const material = new LineMaterial({
    color: state.settings.lineColor,
    linewidth: state.settings.lineWidth,
    dashed: true,
    dashSize: 0.04,
    gapSize: 0.025,
    resolution: new THREE.Vector2(viewport.clientWidth, viewport.clientHeight),
  })
  const draft = new Line2(geometry, material)
  draft.name = 'draft'
  draft.userData = { type: 'draft-meridian' }
  draft.computeLineDistances()
  annotationGroup.add(draft)
  routeVisuals.push({ line: draft, route: null, isDraft: true })
}

function updateMarkerScales() {
  const viewportHeight = Math.max(viewport.clientHeight, 1)
  const fov = THREE.MathUtils.degToRad(camera.fov)
  markerVisuals.forEach(({ mesh, label, point }) => {
    const distance = camera.position.distanceTo(mesh.position)
    const pixelSize = Math.max(5, Math.min(30, Number(point.size) || state.settings.markerSize))
    const diameter = 2 * distance * Math.tan(fov / 2) * Math.max(pixelSize, 14) / viewportHeight
    // Keep an easy-to-hit picking sphere around the visible CSS marker.
    mesh.scale.setScalar(Math.max(diameter, 0.03))
    if (label?.element) {
      label.element.style.setProperty('--marker-size', `${pixelSize}px`)
      label.element.style.setProperty('--marker-color', point.color)
    }
  })
}

let lastLabelCheck = 0
function updateLabelVisibility(time) {
  if (time - lastLabelCheck < 80) return
  lastLabelCheck = time
  markerVisuals.forEach(({ mesh, label, point }) => {
    const direction = mesh.position.clone().sub(camera.position)
    const distance = direction.length()
    const facesCamera = isSurfaceFacingCamera(point.position, point.normal, toArray(camera.position))
    const caster = new THREE.Raycaster(camera.position, direction.normalize(), 0, distance)
    caster.firstHitOnly = true
    const obstruction = caster.intersectObjects(modelMeshes, false)[0]
    const visible = facesCamera && (!obstruction || obstruction.distance >= distance - 0.025)
    label.element.style.display = visible ? '' : 'none'
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
    return `<button class="catalog-item ${selectedCatalog?.code === point.code ? 'selected' : ''}" data-code="${point.code}">
      <b>${point.code}</b><span><strong>${point.name}</strong><small>${point.meridianName}${placed ? ' · 已定位' : ''}</small></span>
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
    <small>${progress.complete ? '已完成，可開始繪製經脈' : `尚缺 ${progress.total - progress.placed} 個穴位`}</small>`
  const pathButton = document.querySelector('[data-tool="path"]')
  pathButton.disabled = !progress.complete
  pathButton.title = progress.complete ? '開始或編輯經脈' : '完成所有穴位定位後開放'
}

function updateSideControl() {
  const meridian = meridianById($('#meridian-filter').value)
  $('#side-control').classList.toggle('hidden', !meridian?.bilateral)
}

function renderObjects() {
  const query = $('#object-search').value.trim().toLowerCase()
  const type = $('#object-type').value
  const routes = type === 'acupoint' ? [] : state.meridians
    .filter((item) => !query || `${item.name} ${item.meridianId} ${sideLabel(item.side)}`.toLowerCase().includes(query))
    .map((item) => `<button data-type="meridian" data-id="${item.id}" class="${selected?.id === item.id ? 'selected' : ''}">
      <i style="background:${item.color}"></i><span><b>${escapeHtml(item.name)}</b><small>${item.nodes.length} 個錨點 · ${sideLabel(item.side)}</small></span></button>`)
  const points = type === 'meridian' ? [] : state.acupoints
    .filter((item) => !query || `${item.code} ${item.name} ${item.meridianName} ${sideLabel(item.side)}`.toLowerCase().includes(query))
    .map((item) => `<button data-type="acupoint" data-id="${item.id}" class="${selected?.id === item.id ? 'selected' : ''}">
      <i class="point-dot" style="background:${item.color}"></i><span><b>${escapeHtml(item.code)} · ${escapeHtml(item.name)}</b><small>${sideLabel(item.side)} · ${item.size}px</small></span></button>`)
  $('#objects').innerHTML = [...routes, ...points].join('') || '<p class="empty">沒有符合的場景物件</p>'
}

function updateUI() {
  $('#undo').disabled = !history.canUndo
  $('#redo').disabled = !history.canRedo
  $('#object-count').textContent = state.meridians.length + state.acupoints.length
  renderObjects()
  renderProperties()
  renderCatalog()
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
  $('#marker-size-out').textContent = `${markerSize}px`
  $('#line-width-out').textContent = `${lineWidth}px`
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

function renderProperties() {
  syncStyleSettings()
  const form = $('#properties')
  const key = selected?.type === 'meridian' ? 'meridians' : 'acupoints'
  const item = selected && state[key].find((entry) => entry.id === selected.id)
  if (!item) {
    form.innerHTML = '<p class="empty">選取經脈或穴位後，可在上方調整顏色與尺寸，或在此刪除</p>'
    return
  }
  form.innerHTML = selected.type === 'meridian' ? `
    <div class="readonly-field"><span>經脈</span><b>${escapeHtml(item.name)}</b></div>
    <div class="readonly-field"><span>側別</span><b>${sideLabel(item.side)}</b></div>
    <div class="readonly-field"><span>錨點</span><b>${item.nodes.length}</b></div>
    <button class="danger" type="button" data-delete>刪除路線</button>
    <p class="form-help">顏色與線寬請使用上方「樣式設定」。選取路線後可拖曳金色控制點。</p>` : `
    <div class="readonly-field"><span>穴位</span><b>${escapeHtml(item.code)} · ${escapeHtml(item.name)}</b></div>
    <div class="readonly-field"><span>經脈</span><b>${escapeHtml(item.meridianName)}</b></div>
    <div class="readonly-field"><span>側別</span><b>${item.pairId ? `${sideLabel(item.side)} · 左右鎖定配對` : '中線'}</b></div>
    <button class="danger" type="button" data-delete>刪除穴位</button>
    <p class="form-help">顏色與直徑請使用上方「樣式設定」。使用檢視／調整工具拖曳定位點。</p>`
}

function setTool(tool) {
  if (tool === 'path' && !meridianProgress().complete) {
    const progress = meridianProgress()
    toast(`請先完成此經脈所有穴位定位（${progress.placed}/${progress.total}）`, 'warn')
    return
  }
  activeTool = tool
  document.querySelectorAll('.tool').forEach((button) =>
    button.classList.toggle('active', button.dataset.tool === tool))
  viewport.className = tool === 'navigate' ? '' : 'placing'
  const required = pointsForMeridian($('#meridian-filter').value).length
  const usedPoints = draftNodes.filter((node) => node.type === 'acupoint').length
  $('#finish-path').classList.toggle('hidden', tool !== 'path' || usedPoints !== required)
  $('#stage-help').textContent = {
    navigate: '拖曳旋轉 · 拖曳穴位或金色控制點調整位置',
    path: '依國際代碼順序點擊穴位；點擊草稿線段加入曲度控制點',
    point: selectedCatalog
      ? `點擊人體表面定位 ${selectedCatalog.code} ${selectedCatalog.name}`
      : '請先選擇穴位',
  }[tool]
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
    const midlineHit = projectNearSurface([0, hit.position[1], hit.position[2]], [0, hit.normal[1], hit.normal[2]])
    points = [makePoint(selectedCatalog, 'midline', null, midlineHit)]
    selected = { type: 'acupoint', id: points[0].id, pairId: null }
  }
  commit({ ...state, acupoints: [...state.acupoints, ...points] },
    meridian.bilateral ? `已建立 ${selectedCatalog.code} 左右配對` : `已定位 ${selectedCatalog.code}`)
}

function routeNodeFromMarker(hit) {
  const point = hit && getPoint(hit.object.userData.id)
  if (!point) return null
  const activeMeridian = $('#meridian-filter').value
  if (!draftNodes.length && state.meridians.some((route) => route.meridianId === activeMeridian)) {
    toast('此經脈已有固定路線；請點擊既有線段編輯，或先刪除後重畫', 'warn')
    return false
  }
  if (point.meridianId !== activeMeridian) {
    toast(`路線屬於 ${meridianById(activeMeridian).name}，不能加入 ${point.code}`, 'warn')
    return false
  }
  if (draftSide && point.side !== draftSide) {
    toast(`目前正在繪製${sideLabel(draftSide)}路線`, 'warn')
    return false
  }
  const expected = nextExpectedPoint(pointsForMeridian(activeMeridian), draftNodes)
  if (!expected) {
    toast('此經脈所有穴位已加入，請調整曲線或按完成', 'warn')
    return false
  }
  if (point.code !== expected.code) {
    toast(`請依序點擊 ${expected.code} ${expected.name}`, 'warn')
    return false
  }
  draftSide ||= point.side
  return { type: 'acupoint', pointId: point.id, position: point.position, normal: point.normal }
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

function insertRouteControl(routeId, hit) {
  const route = state.meridians.find((item) => item.id === routeId)
  if (!route || route.meridianId !== $('#meridian-filter').value) {
    return toast('請先在左側選擇該路線所屬經脈', 'warn')
  }
  const index = nearestNodeSegment(route, hit.position)
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
  selected = { type: 'meridian', id: route.id }
  commit({ ...state, meridians: nextRoutes }, '已在線段加入曲度控制點')
}

function insertDraftControl(hit) {
  if (draftNodes.length < 2) return
  const index = nearestNodeSegment({ nodes: draftNodes }, hit.position)
  draftNodes.splice(index + 1, 0, { type: 'control', pointId: null, ...hit })
  rebuildAnnotations()
  setStatus('已在草稿線段加入曲度控制點')
}

function placeAt(event) {
  if (activeTool === 'navigate') {
    const markerHit = annotationHit(event, ['acupoint'])
    if (markerHit) {
      const point = getPoint(markerHit.object.userData.id)
      selected = { type: 'acupoint', id: point.id, pairId: point.pairId || null }
      rebuildAnnotations()
      updateUI()
      return
    }
    const routeHit = annotationHit(event, ['meridian'])
    if (routeHit) {
      selected = { type: 'meridian', id: routeHit.object.userData.id }
      rebuildAnnotations()
      updateUI()
    }
    return
  }
  const hit = surfaceHit(event)
  if (!hit) return toast('請點擊人體模型表面', 'warn')
  if (activeTool === 'point') return placeAcupoint(hit)

  const draftHit = annotationHit(event, ['draft-meridian'])
  if (draftHit) return insertDraftControl(hit)
  const existingRouteHit = annotationHit(event, ['meridian'])
  if (existingRouteHit) return insertRouteControl(existingRouteHit.object.userData.id, hit)
  const markerHit = annotationHit(event, ['acupoint'])
  const markerNode = routeNodeFromMarker(markerHit)
  if (markerNode === false) return
  if (markerNode) draftNodes.push(markerNode)
  else return toast('請點擊下一個穴位；需要曲度時請點擊已繪製的線段', 'warn')
  drawDraft()
  const required = pointsForMeridian($('#meridian-filter').value).length
  const used = draftNodes.filter((node) => node.type === 'acupoint').length
  $('#finish-path').classList.toggle('hidden', used !== required)
  setStatus(`經脈穴位：${used}/${required}`)
}

function finishPath() {
  const required = pointsForMeridian($('#meridian-filter').value).length
  const used = draftNodes.filter((node) => node.type === 'acupoint').length
  if (used !== required) return toast(`必須包含此經脈全部穴位（${used}/${required}）`, 'warn')
  const meridian = meridianById($('#meridian-filter').value)
  const pairId = meridian.bilateral ? makeId() : null
  const side = meridian.bilateral ? (draftSide || $('#point-side').value) : 'midline'
  const route = {
    id: makeId(),
    pairId,
    meridianId: meridian.id,
    name: meridian.name,
    color: state.settings.lineColor,
    width: state.settings.lineWidth,
    side,
    nodes: draftNodes,
  }
  const routes = [route]
  if (meridian.bilateral) {
    routes.push({
      ...route,
      id: makeId(),
      side: side === 'left' ? 'right' : 'left',
      nodes: route.nodes.map(makeMirroredRouteNode),
    })
  }
  draftNodes = []
  draftSide = null
  selected = { type: 'meridian', id: route.id }
  commit({ ...state, meridians: [...state.meridians, ...routes] },
    meridian.bilateral ? `已建立 ${meridian.name} 左右路線` : `已建立 ${meridian.name} 路線`)
  setTool('navigate')
}

function cancelDraft() {
  draftNodes = []
  draftSide = null
  drawDraft()
  setTool('navigate')
  setStatus('已取消路徑')
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
  if (selected.type === 'acupoint') {
    const point = getPoint(selected.id)
    const removedIds = new Set(state.acupoints
      .filter((item) => item.id === point?.id || (point?.pairId && item.pairId === point.pairId))
      .map((item) => item.id))
    const nextRoutes = state.meridians.map((route) => ({
      ...route,
      nodes: route.nodes.map((node) => removedIds.has(node.pointId)
        ? { ...node, type: 'control', pointId: null }
        : node),
    }))
    selected = null
    return commit({
      ...state,
      acupoints: state.acupoints.filter((item) => !removedIds.has(item.id)),
      meridians: nextRoutes,
    }, '已刪除鎖定穴位配對')
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
  rebuildAnnotations()
  updateUI()
  setStatus(message)
}

function exportJSON() {
  const result = validateDocument(state)
  if (!result.valid) return toast(`無法匯出：${result.errors[0]}`, 'error')
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }))
  link.download = `meridian-map-v2-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(link.href)
  toast('JSON v2 已匯出，包含穴位配對與完整路線')
}

async function importJSON(file) {
  const result = parseDocument(await file.text())
  if (!result.valid) return toast(`匯入失敗：${result.errors[0]}`, 'error')
  state = result.value
  history.replace(state)
  selected = null
  rebuildAnnotations()
  updateUI()
  toast(`已匯入 ${state.meridians.length} 條路線、${state.acupoints.length} 個定位點`)
}

function applyModel(gltf, name, hash = null) {
  const box = new THREE.Box3().setFromObject(gltf.scene)
  const size = box.getSize(new THREE.Vector3())
  if (!Number.isFinite(size.y) || size.y === 0) throw new Error('模型尺寸無效')
  modelGroup.clear()
  modelMeshes = []
  modelGroup.add(gltf.scene)
  gltf.scene.scale.multiplyScalar(3 / size.y)
  gltf.scene.updateMatrixWorld(true)
  const normalizedBox = new THREE.Box3().setFromObject(gltf.scene)
  const center = normalizedBox.getCenter(new THREE.Vector3())
  gltf.scene.position.x -= center.x
  gltf.scene.position.y -= normalizedBox.min.y
  gltf.scene.position.z -= center.z
  gltf.scene.updateMatrixWorld(true)
  gltf.scene.traverse((object) => {
    if (object.isMesh) {
      object.castShadow = true
      object.receiveShadow = true
      object.geometry.computeBoundsTree()
      modelMeshes.push(object)
    }
  })
  state = { ...state, model: { name, hash } }
  history.replace(state)
  $('#model-status').textContent = name
  controls.target.set(0, 1.5, 0)
  camera.position.set(3.4, 1.7, 4.6)
  controls.update()
  updateUI()
}

function styleBundledHuman(gltf) {
  const skin = () => new THREE.MeshStandardMaterial({
    color: 0xc58f73,
    emissive: 0x1a100c,
    emissiveIntensity: 0.2,
    metalness: 0,
    roughness: 0.88,
    flatShading: false,
    side: THREE.FrontSide,
  })
  const nail = () => new THREE.MeshStandardMaterial({
    color: 0xffc8bc,
    emissive: 0x5a241c,
    emissiveIntensity: 0.22,
    metalness: 0.15,
    roughness: 0.32,
    flatShading: false,
    side: THREE.DoubleSide,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  })
  gltf.scene.traverse((object) => {
    if (!object.isMesh) return
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    const names = materials.map((material) => (material?.name || '').toLowerCase())
    const objectName = `${object.name || ''} ${object.parent?.name || ''}`.toLowerCase()
    const isToeNail = objectName.includes('toenail')
      || names.some((name) => name.includes('toenail'))
    const isNail = !isToeNail && (
      objectName.includes('nail')
      || names.some((name) => name.includes('fingernail') || name.includes('nail'))
    )
    if (isToeNail || isNail) {
      object.material = nail()
      object.renderOrder = 5
      // Toenails sit on a flatter dorsal pad. Keep them smaller than fingernails so
      // adjacent toes stay separable (toe tips are much closer than fingertips).
      object.scale.multiplyScalar(isToeNail ? 1.45 : 2.6)
      object.frustumCulled = false
    } else {
      object.material = skin()
    }
  })
}

async function loadDefaultModel() {
  try {
    const modelUrl = new URL('../models/human.glb', import.meta.url)
    modelUrl.searchParams.set('v', 'toenails-4')
    const gltf = await createModelLoader().loadAsync(modelUrl.href, (event) => {
      if (event.total) $('#model-status').textContent = `正在載入人體模型 ${Math.round(event.loaded / event.total * 100)}%`
    })
    styleBundledHuman(gltf)
    applyModel(gltf, '人體模型', 'f6460d2d38d09499facbcd1f5bee817050f43eeb4e1b8376873b2899d9d511e2')
    $('#model-status').innerHTML = '<a href="https://sketchfab.com/3d-models/human-glb-1ac3176269f54db0a98e155efb84b900" target="_blank" rel="noreferrer">human_glb by aaravparakh · CC BY 4.0</a>'
    setStatus('平滑人體模型已就緒')
  } catch (error) {
    toast(`預設人體載入失敗：${error.message}`, 'error')
  }
}

async function loadModel(file) {
  if (!file?.name.toLowerCase().endsWith('.glb')) return toast('目前僅支援二進位 .glb 模型', 'error')
  const url = URL.createObjectURL(file)
  try {
    applyModel(await createModelLoader().loadAsync(url), file.name)
    toast(`已載入 ${file.name}`)
  } catch (error) {
    toast(`模型載入失敗：${error.message}`, 'error')
  } finally {
    URL.revokeObjectURL(url)
  }
}

function resize() {
  const { clientWidth, clientHeight } = viewport
  camera.aspect = clientWidth / clientHeight
  camera.updateProjectionMatrix()
  renderer.setSize(clientWidth, clientHeight, false)
  labelRenderer.setSize(clientWidth, clientHeight)
  routeVisuals.forEach(({ line }) => line.material.resolution.set(clientWidth, clientHeight))
}
new ResizeObserver(resize).observe(viewport)
renderer.setAnimationLoop((time) => {
  controls.update()
  updateMarkerScales()
  updateLabelVisibility(time)
  renderer.render(scene, camera)
  labelRenderer.render(scene, camera)
})

$('#meridian-filter').addEventListener('change', () => {
  if (activeTool === 'path') cancelDraft()
  selectedCatalog = pointsForMeridian($('#meridian-filter').value)[0]
  $('#catalog-search').value = ''
  renderCatalog()
  if (activeTool === 'point') setTool('point')
})
$('#catalog-search').addEventListener('input', renderCatalog)
$('#catalog').addEventListener('click', (event) => {
  const button = event.target.closest('[data-code]')
  if (!button) return
  selectedCatalog = POINT_BY_CODE.get(button.dataset.code)
  renderCatalog()
  if (activeTool === 'point') setTool('point')
})

document.querySelectorAll('.tool').forEach((button) => button.addEventListener('click', () => {
  if (draftNodes.length && button.dataset.tool !== 'path') cancelDraft()
  setTool(button.dataset.tool)
}))
$('#finish-path').addEventListener('click', finishPath)

renderer.domElement.addEventListener('pointerdown', (event) => {
  pointerDown = { x: event.clientX, y: event.clientY }
  if (activeTool !== 'navigate' || event.button !== 0) return
  const hit = annotationHit(event, ['acupoint', 'route-handle'])
  if (!hit) return
  dragging = {
    type: hit.object.userData.type,
    id: hit.object.userData.id,
    routeId: hit.object.userData.routeId,
    nodeIndex: hit.object.userData.nodeIndex,
  }
  controls.enabled = false
})
renderer.domElement.addEventListener('pointermove', (event) => {
  if (!dragging) return
  const hit = surfaceHit(event)
  if (!hit) return
  const next = dragging.type === 'acupoint'
    ? updatePairedPoint(dragging.id, hit)
    : updateRouteHandle(dragging.routeId, dragging.nodeIndex, hit)
  replaceWithoutHistory(next)
})
renderer.domElement.addEventListener('pointerup', (event) => {
  if (dragging) {
    dragging = null
    controls.enabled = true
    state = history.commit(state)
    rebuildAnnotations()
    updateUI()
    setStatus('位置已更新並同步左右配對')
    return
  }
  if (pointerDown && Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) <= 4 && event.button === 0) placeAt(event)
})

$('#objects').addEventListener('click', (event) => {
  const button = event.target.closest('[data-id]')
  if (!button) return
  const point = button.dataset.type === 'acupoint' && getPoint(button.dataset.id)
  selected = { type: button.dataset.type, id: button.dataset.id, pairId: point?.pairId || null }
  rebuildAnnotations()
  updateUI()
})
$('#object-search').addEventListener('input', renderObjects)
$('#object-type').addEventListener('change', renderObjects)
$('#style-settings').addEventListener('change', (event) => {
  const form = event.currentTarget
  applyStyleSettings(Object.fromEntries(new FormData(form)))
})
$('#style-settings').addEventListener('input', (event) => {
  if (event.target.type !== 'range') return
  const output = event.target.closest('label')?.querySelector('output')
  if (output) output.textContent = `${event.target.value}px`
  if (event.target.name === 'markerSize' || event.target.name === 'lineWidth') {
    // Live-preview size while dragging; commit on change.
    const form = event.currentTarget
    const data = Object.fromEntries(new FormData(form))
    if (selected?.type === 'acupoint' && event.target.name === 'markerSize') {
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
$('#properties').addEventListener('submit', (event) => event.preventDefault())
$('#properties').addEventListener('click', (event) => {
  if (event.target.matches('[data-delete]')) removeSelected()
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
  } else if (!editing && event.key === 'Enter' && activeTool === 'path') finishPath()
  else if (!editing && event.key === 'Escape' && draftNodes.length) cancelDraft()
  else if (!editing && (event.key === 'Delete' || event.key === 'Backspace')) removeSelected()
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
rebuildAnnotations()
updateUI()
resize()
loadDefaultModel()
