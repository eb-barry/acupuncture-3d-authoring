import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import pointsData from './data/points-data.json' with { type: 'json' }
import { emptyDocument, parseDocument, validateDocument } from './document.js'
import { History } from './history.js'

const $ = (selector) => document.querySelector(selector)
const makeId = () => crypto.randomUUID()
const toArray = ({ x, y, z }) => [x, y, z]

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
    <input id="catalog-search" class="search" type="search" placeholder="搜尋代碼、名稱、拼音…" autocomplete="off">
    <div id="catalog" class="catalog"></div>
    <div class="placement">
      <label>放置側別<select id="point-side"><option value="left">左側 L</option><option value="right">右側 R</option><option value="midline">中線</option></select></label>
      <p>選取穴位後，使用「穴位」工具點擊人體表面。</p>
    </div>
  </aside>
  <section class="stage">
    <nav class="tools" aria-label="編輯工具">
      <button class="tool active" data-tool="navigate">◎ <span>檢視</span></button>
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
    <div id="objects" class="objects"></div>
    <div class="inspector"><div class="panel-heading"><span>屬性</span></div><form id="properties"><p class="empty">選取經脈或穴位以編輯屬性</p></form></div>
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

const controls = new OrbitControls(camera, renderer.domElement)
controls.target.set(0, 1.45, 0)
controls.enableDamping = true
controls.dampingFactor = 0.08
controls.minDistance = 1.2
controls.maxDistance = 10

scene.add(new THREE.HemisphereLight(0xdaf4ed, 0x1a2725, 2.1))
const keyLight = new THREE.DirectionalLight(0xfff1dc, 3.2)
keyLight.position.set(3, 5, 4)
keyLight.castShadow = true
scene.add(keyLight)
const rimLight = new THREE.DirectionalLight(0x74b9b0, 2)
rimLight.position.set(-4, 2, -3)
scene.add(rimLight)
scene.add(new THREE.GridHelper(8, 32, 0x38514d, 0x1d2c2a))

const modelGroup = new THREE.Group()
const annotationGroup = new THREE.Group()
scene.add(modelGroup, annotationGroup)
let modelMeshes = []

function buildMannequin() {
  const material = new THREE.MeshPhysicalMaterial({ color: 0xbfc8bd, roughness: 0.72, clearcoat: 0.12 })
  const add = (geometry, position, scale = [1, 1, 1], rotation = [0, 0, 0]) => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(...position)
    mesh.scale.set(...scale)
    mesh.rotation.set(...rotation)
    mesh.castShadow = true
    mesh.receiveShadow = true
    modelGroup.add(mesh)
    modelMeshes.push(mesh)
  }
  add(new THREE.SphereGeometry(0.25, 32, 20), [0, 2.75, 0], [0.88, 1.08, 0.92])
  add(new THREE.CapsuleGeometry(0.36, 0.95, 10, 24), [0, 1.85, 0], [1.05, 1, 0.66])
  add(new THREE.SphereGeometry(0.39, 28, 20), [0, 1.28, 0], [0.8, 0.72, 0.68])
  add(new THREE.CapsuleGeometry(0.105, 1.15, 8, 18), [-0.53, 1.87, 0], [1, 1, 1], [0, 0, -0.13])
  add(new THREE.CapsuleGeometry(0.105, 1.15, 8, 18), [0.53, 1.87, 0], [1, 1, 1], [0, 0, 0.13])
  add(new THREE.CapsuleGeometry(0.14, 1.3, 8, 18), [-0.2, 0.52, 0], [1, 1, 1], [0, 0, -0.035])
  add(new THREE.CapsuleGeometry(0.14, 1.3, 8, 18), [0.2, 0.52, 0], [1, 1, 1], [0, 0, 0.035])
}

let state = emptyDocument()
const history = new History(state)
let selected = null
let selectedCatalog = pointsData.points.find((point) => point.code === 'LI4') || pointsData.points[0]
let activeTool = 'navigate'
let draftNodes = []
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
let pointerDown = null
const createModelLoader = () => new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)

const sideLabel = (side) => ({ left: '左側', right: '右側', midline: '中線', bilateral: '雙側' })[side] || side
const offsetPosition = (node, amount = 0.012) =>
  new THREE.Vector3(...node.position).addScaledVector(new THREE.Vector3(...node.normal), amount)
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
  toastTimer = setTimeout(() => { element.className = '' }, 3200)
}

function commit(nextState, message) {
  state = history.commit(nextState)
  rebuildAnnotations()
  updateUI()
  setStatus(message)
}

function rebuildAnnotations() {
  annotationGroup.clear()
  state.meridians.forEach((meridian) => {
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(meridian.nodes.map((node) => offsetPosition(node))),
      new THREE.LineBasicMaterial({ color: meridian.color, transparent: true, opacity: selected?.id === meridian.id ? 1 : 0.82 }),
    )
    annotationGroup.add(line)
    meridian.nodes.forEach((node) => {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), new THREE.MeshBasicMaterial({ color: meridian.color }))
      dot.position.copy(offsetPosition(node, 0.014))
      annotationGroup.add(dot)
    })
  })
  state.acupoints.forEach((point) => {
    const isSelected = selected?.type === 'acupoint' && selected.id === point.id
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(isSelected ? 0.045 : 0.035, 18, 12),
      new THREE.MeshStandardMaterial({ color: isSelected ? 0xffffff : 0xdba15d, emissive: isSelected ? 0x5c4425 : 0x29190a }),
    )
    marker.position.copy(offsetPosition(point, 0.035))
    annotationGroup.add(marker)
  })
  drawDraft()
}

function drawDraft() {
  const previous = annotationGroup.getObjectByName('draft')
  if (previous) annotationGroup.remove(previous)
  if (!draftNodes.length) return
  const draft = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(draftNodes.map((node) => offsetPosition(node))),
    new THREE.LineDashedMaterial({ color: 0xefc67b, dashSize: 0.06, gapSize: 0.03 }),
  )
  draft.name = 'draft'
  draft.computeLineDistances()
  annotationGroup.add(draft)
}

function renderCatalog(query = '') {
  const normalized = query.trim().toLowerCase()
  const points = pointsData.points.filter((point) =>
    [point.code, point.name, point.pinyin, point.meridian].some((value) => value.toLowerCase().includes(normalized)))
  $('#catalog-count').textContent = points.length
  $('#catalog').innerHTML = points.map((point) => `
    <button class="catalog-item ${selectedCatalog?.code === point.code ? 'selected' : ''}" data-code="${point.code}">
      <b>${point.code}</b><span><strong>${point.name}</strong><small>${point.pinyin} · ${point.meridian}</small></span>
    </button>`).join('') || '<p class="empty">找不到符合的穴位</p>'
}

function updateUI() {
  $('#undo').disabled = !history.canUndo
  $('#redo').disabled = !history.canRedo
  $('#object-count').textContent = state.meridians.length + state.acupoints.length
  $('#objects').innerHTML = [
    ...state.meridians.map((item) => `<button data-type="meridian" data-id="${item.id}" class="${selected?.id === item.id ? 'selected' : ''}">
      <i style="background:${item.color}"></i><span><b>${escapeHtml(item.name)}</b><small>${item.nodes.length} 個節點 · ${sideLabel(item.side)}</small></span></button>`),
    ...state.acupoints.map((item) => `<button data-type="acupoint" data-id="${item.id}" class="${selected?.id === item.id ? 'selected' : ''}">
      <i class="point-dot"></i><span><b>${escapeHtml(item.code)} · ${escapeHtml(item.name)}</b><small>${sideLabel(item.side)}</small></span></button>`),
  ].join('') || '<p class="empty">尚未建立標註</p>'
  renderProperties()
}

function sideOptions(current, includeBilateral = false) {
  const sides = [['left', '左側 L'], ['right', '右側 R'], ['midline', '中線']]
  if (includeBilateral) sides.push(['bilateral', '雙側'])
  return sides.map(([value, label]) => `<option value="${value}" ${current === value ? 'selected' : ''}>${label}</option>`).join('')
}

function renderProperties() {
  const form = $('#properties')
  const item = selected && state[selected.type === 'meridian' ? 'meridians' : 'acupoints'].find((entry) => entry.id === selected.id)
  if (!item) {
    form.innerHTML = '<p class="empty">選取經脈或穴位以編輯屬性</p>'
    return
  }
  form.innerHTML = selected.type === 'meridian' ? `
    <label>經脈名稱<input name="name" value="${escapeHtml(item.name)}" required></label>
    <label>線條顏色<input name="color" type="color" value="${item.color}"></label>
    <label>側別<select name="side">${sideOptions(item.side, true)}</select></label>
    <button class="save primary" type="submit">儲存變更</button><button class="danger" type="button" data-delete>刪除路徑</button>` : `
    <label>穴位名稱<input name="name" value="${escapeHtml(item.name)}" required></label>
    <label>國際代碼<input name="code" value="${escapeHtml(item.code)}" required></label>
    <label>側別<select name="side">${sideOptions(item.side)}</select></label>
    <button class="save primary" type="submit">儲存變更</button><button class="danger" type="button" data-delete>刪除穴位</button>`
}

function setTool(tool) {
  activeTool = tool
  document.querySelectorAll('.tool').forEach((button) => button.classList.toggle('active', button.dataset.tool === tool))
  viewport.className = tool === 'navigate' ? '' : 'placing'
  $('#finish-path').classList.toggle('hidden', tool !== 'path' || draftNodes.length < 2)
  $('#stage-help').textContent = {
    navigate: '拖曳旋轉 · Shift/右鍵平移 · 滾輪縮放',
    path: '逐點點擊人體表面 · Enter 完成 · Esc 取消',
    point: `點擊人體表面放置 ${selectedCatalog.code} ${selectedCatalog.name}`,
  }[tool]
}

function surfaceHit(event) {
  const rect = renderer.domElement.getBoundingClientRect()
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  raycaster.setFromCamera(pointer, camera)
  const hit = raycaster.intersectObjects(modelMeshes, false)[0]
  if (!hit?.face) return null
  const normal = hit.face.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize()
  return { position: toArray(hit.point), normal: toArray(normal) }
}

function placeAt(event) {
  if (activeTool === 'navigate') return
  const hit = surfaceHit(event)
  if (!hit) return toast('請點擊人體模型表面', 'warn')
  if (activeTool === 'point') {
    const point = { id: makeId(), name: selectedCatalog.name, code: selectedCatalog.code, side: $('#point-side').value, ...hit }
    selected = { type: 'acupoint', id: point.id }
    commit({ ...state, acupoints: [...state.acupoints, point] }, `已放置 ${point.code}`)
  } else {
    draftNodes.push(hit)
    drawDraft()
    $('#finish-path').classList.toggle('hidden', draftNodes.length < 2)
    setStatus(`路徑節點：${draftNodes.length}`)
  }
}

function finishPath() {
  if (draftNodes.length < 2) return toast('經脈路徑至少需要兩個節點', 'warn')
  const count = state.meridians.length + 1
  const meridian = {
    id: makeId(), name: `經脈 ${count}`,
    color: ['#dca35d', '#65b9a9', '#d26c66', '#8ea8d8'][count % 4],
    side: 'left', nodes: draftNodes,
  }
  draftNodes = []
  selected = { type: 'meridian', id: meridian.id }
  commit({ ...state, meridians: [...state.meridians, meridian] }, `已建立 ${meridian.name}`)
  setTool('navigate')
}

function cancelDraft() {
  draftNodes = []
  drawDraft()
  setTool('navigate')
  setStatus('已取消路徑')
}

function removeSelected() {
  if (!selected) return
  const key = selected.type === 'meridian' ? 'meridians' : 'acupoints'
  const next = { ...state, [key]: state[key].filter((item) => item.id !== selected.id) }
  selected = null
  commit(next, '已刪除物件')
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
  link.download = `meridian-map-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(link.href)
  toast('JSON 已匯出')
}

async function importJSON(file) {
  const result = parseDocument(await file.text())
  if (!result.valid) return toast(`匯入失敗：${result.errors[0]}`, 'error')
  state = result.value
  history.replace(state)
  selected = null
  rebuildAnnotations()
  updateUI()
  toast(`已匯入 ${state.meridians.length} 條經脈、${state.acupoints.length} 個穴位`)
}

function applyModel(gltf, name) {
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
      modelMeshes.push(object)
    }
  })
  state = { ...state, model: { name } }
  history.replace(state)
  $('#model-status').textContent = name
  controls.target.set(0, 1.5, 0)
  camera.position.set(3.4, 1.7, 4.6)
  controls.update()
  updateUI()
}

async function loadDefaultModel() {
  try {
    const modelUrl = new URL('../models/human.glb', import.meta.url)
    const gltf = await createModelLoader().loadAsync(modelUrl.href, (event) => {
      if (!event.total) return
      $('#model-status').textContent = `正在載入人體模型 ${Math.round(event.loaded / event.total * 100)}%`
    })
    applyModel(gltf, '人體模型')
    $('#model-status').innerHTML = '<a href="https://sketchfab.com/3d-models/human-glb-1ac3176269f54db0a98e155efb84b900" target="_blank" rel="noreferrer">human_glb by aaravparakh · CC BY 4.0</a>'
    setStatus('人體模型已就緒')
  } catch (error) {
    buildMannequin()
    $('#model-status').textContent = '簡易備援人體'
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
}
new ResizeObserver(resize).observe(viewport)
renderer.setAnimationLoop(() => {
  controls.update()
  renderer.render(scene, camera)
})

$('#catalog-search').addEventListener('input', (event) => renderCatalog(event.target.value))
$('#catalog').addEventListener('click', (event) => {
  const button = event.target.closest('[data-code]')
  if (!button) return
  selectedCatalog = pointsData.points.find((point) => point.code === button.dataset.code)
  renderCatalog($('#catalog-search').value)
  if (activeTool === 'point') setTool('point')
})
document.querySelectorAll('.tool').forEach((button) => button.addEventListener('click', () => {
  if (draftNodes.length && button.dataset.tool !== 'path') cancelDraft()
  setTool(button.dataset.tool)
}))
$('#finish-path').addEventListener('click', finishPath)
renderer.domElement.addEventListener('pointerdown', (event) => { pointerDown = { x: event.clientX, y: event.clientY } })
renderer.domElement.addEventListener('pointerup', (event) => {
  if (pointerDown && Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) <= 4 && event.button === 0) placeAt(event)
})
$('#objects').addEventListener('click', (event) => {
  const button = event.target.closest('[data-id]')
  if (!button) return
  selected = { type: button.dataset.type, id: button.dataset.id }
  rebuildAnnotations()
  updateUI()
})
$('#properties').addEventListener('submit', (event) => {
  event.preventDefault()
  if (!selected) return
  const data = Object.fromEntries(new FormData(event.target))
  const key = selected.type === 'meridian' ? 'meridians' : 'acupoints'
  commit({ ...state, [key]: state[key].map((item) => item.id === selected.id ? { ...item, ...data } : item) }, '屬性已更新')
})
$('#properties').addEventListener('click', (event) => { if (event.target.matches('[data-delete]')) removeSelected() })
$('#undo').addEventListener('click', () => applyHistory(history.undo(), '已復原'))
$('#redo').addEventListener('click', () => applyHistory(history.redo(), '已重做'))
$('#validate').addEventListener('click', () => {
  const result = validateDocument(state)
  toast(result.valid ? 'JSON 結構有效' : result.errors.join('；'), result.valid ? 'ok' : 'error')
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
