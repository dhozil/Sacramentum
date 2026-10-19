'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

/**
 * Sacramentum — The Escrow Armillary
 *
 * An original procedural three.js instrument for the escrow tribunal. A brass
 * vault of sealed GEN turns at the centre; five stations orbit it — market,
 * escrow, delivery, tribunal, settlement — and a glowing token walks the ring
 * from deal to deal. Tilted armillary rings sweep around the vault; a balance
 * at Settlement tips with the verdict. Drag to orbit, hover or click a station.
 *
 * No external models or textures: every surface is generated at runtime.
 *
 * API is compatible with the previous scene: default export, `height`, `embed`,
 * `onStation`, `onReady`, plus `window.__machine`.
 */

export type StationId = 'market' | 'escrow' | 'delivery' | 'tribunal' | 'settlement'
export type MachineMode = 'assembled' | 'cutaway' | 'stations' | 'order'
export type MachineCamera = 'overview' | 'side' | 'top' | 'station' | 'flight'

export type MachineApi = {
  setMode: (mode: MachineMode) => void
  setCamera: (camera: MachineCamera) => void
  focusStation: (id: StationId) => void
  play: () => void
  pause: () => void
}

export type SacramentumTribunal3DProps = {
  /** Height of the scene box, e.g. 720 or '100vh'. Default '100vh'. */
  height?: number | string
  className?: string
  /** Clean hero mode: hides the corner chrome and shifts the instrument right. */
  embed?: boolean
  /** A station was clicked. */
  onStation?: (id: StationId) => void
  /** The first real frame has been drawn. */
  onReady?: () => void
}

declare global {
  interface Window {
    __machine?: MachineApi
  }
}

const STATION_IDS: StationId[] = ['market', 'escrow', 'delivery', 'tribunal', 'settlement']

const STATION_LABEL: Record<StationId, string> = {
  market: 'Market',
  escrow: 'Escrow',
  delivery: 'Delivery',
  tribunal: 'Tribunal',
  settlement: 'Settlement',
}

export default function SacramentumTribunal3D({
  height = '100vh',
  className,
  embed = false,
  onStation,
  onReady,
}: SacramentumTribunal3DProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const handlers = useRef({ onStation, onReady })

  useEffect(() => {
    handlers.current = { onStation, onReady }
  }, [onStation, onReady])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    let dispose: (() => void) | undefined
    let cancelled = false
    document.fonts.ready.then(() => {
      if (cancelled || !rootRef.current) return
      dispose = initScene(root, embed, {
        onStation: (id) => handlers.current.onStation?.(id),
        onReady: () => handlers.current.onReady?.(),
      })
    })
    return () => {
      cancelled = true
      dispose?.()
    }
  }, [embed])

  return (
    <div
      ref={rootRef}
      className={className}
      style={{ position: 'relative', width: '100%', height, overflow: 'hidden' }}
    />
  )
}

// --------------------------------------------------------------------------- //
// Scene construction
// --------------------------------------------------------------------------- //

interface SceneOpts {
  onStation: (id: StationId) => void
  onReady: () => void
}

interface Station {
  id: StationId
  angle: number
  position: THREE.Vector3
  anchor: THREE.Vector3
  glow: THREE.MeshBasicMaterial
  hit: THREE.Mesh
  label?: HTMLDivElement
}

const STATION_R = 2.5
const BASE_R = 3.4
const LABEL_Y = 1.55

function initScene(root: HTMLDivElement, embedded: boolean, opts: SceneOpts): () => void {
  const style = document.createElement('style')
  style.textContent = CSS
  root.appendChild(style)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x090c10)
  scene.fog = new THREE.FogExp2(0x090c10, 0.035)

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100)

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.06
  renderer.domElement.className = 'ea3d-canvas'
  root.appendChild(renderer.domElement)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.07
  controls.enablePan = false
  // A wheel over the hero must scroll the page, not dolly the camera. Leaving
  // zoom on made an ordinary scroll silently shrink/blow up the instrument and
  // swallow the page scroll, so the frame is fixed and only drag orbits it.
  controls.enableZoom = false
  controls.minDistance = 6.5
  controls.maxDistance = 16
  controls.minPolarAngle = 0.35
  controls.maxPolarAngle = Math.PI * 0.49
  controls.autoRotateSpeed = 0.45
  controls.autoRotate = true

  // ------------------------------------------------------------- materials
  const M = {
    brass: new THREE.MeshStandardMaterial({ color: 0xc9a25b, metalness: 0.95, roughness: 0.3 }),
    brassDim: new THREE.MeshStandardMaterial({ color: 0x8a713f, metalness: 0.9, roughness: 0.45 }),
    brassGlow: new THREE.MeshStandardMaterial({
      color: 0xe6c683,
      emissive: 0xc9a25b,
      emissiveIntensity: 0.55,
      metalness: 0.6,
      roughness: 0.28,
    }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1b242c, metalness: 0.62, roughness: 0.52 }),
    darker: new THREE.MeshStandardMaterial({ color: 0x0d1319, metalness: 0.5, roughness: 0.7 }),
    ivory: new THREE.MeshStandardMaterial({ color: 0xe8e0cf, metalness: 0.2, roughness: 0.6 }),
    verdigris: new THREE.MeshStandardMaterial({
      color: 0x2f6f66,
      emissive: 0x46a192,
      emissiveIntensity: 0.4,
      metalness: 0.5,
      roughness: 0.4,
    }),
    seal: new THREE.MeshStandardMaterial({
      color: 0x8e3527,
      emissive: 0xb0432f,
      emissiveIntensity: 0.35,
      metalness: 0.4,
      roughness: 0.5,
    }),
    glass: new THREE.MeshStandardMaterial({
      color: 0x9db4c0,
      metalness: 0.1,
      roughness: 0.08,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
    }),
    core: new THREE.MeshStandardMaterial({
      color: 0xffe7b4,
      emissive: 0xe6c683,
      emissiveIntensity: 1.1,
      metalness: 0.2,
      roughness: 0.3,
    }),
    hit: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  }

  // ----------------------------------------------------------------- lights
  scene.add(new THREE.HemisphereLight(0x9fb4c2, 0x080b0e, 0.55))

  const key = new THREE.DirectionalLight(0xffe9c6, 1.5)
  key.position.set(6, 9, 5)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  key.shadow.camera.near = 1
  key.shadow.camera.far = 30
  key.shadow.camera.left = -6
  key.shadow.camera.right = 6
  key.shadow.camera.top = 6
  key.shadow.camera.bottom = -6
  key.shadow.bias = -0.0015
  scene.add(key)

  const rim = new THREE.DirectionalLight(0x46a192, 0.5)
  rim.position.set(-6, 3, -5)
  scene.add(rim)

  const coreLight = new THREE.PointLight(0xffdca0, 6, 9, 2)
  coreLight.position.set(0, 1.0, 0)
  scene.add(coreLight)

  // ------------------------------------------------------------------ group
  const machine = new THREE.Group()
  scene.add(machine)

  const add = (
    parent: THREE.Object3D,
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    x = 0,
    y = 0,
    z = 0,
  ) => {
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(x, y, z)
    mesh.castShadow = true
    mesh.receiveShadow = true
    parent.add(mesh)
    return mesh
  }

  // ------------------------------------------------------------------ base
  const base = add(machine, new THREE.CylinderGeometry(BASE_R, BASE_R + 0.28, 0.34, 96), M.darker, 0, -0.17, 0)
  base.receiveShadow = true

  for (const r of [1.35, 2.05, 2.75, BASE_R]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.012, 6, 150), M.brassDim)
    ring.rotation.x = Math.PI / 2
    ring.position.y = 0.005
    machine.add(ring)
  }
  const tickGeo = new THREE.BoxGeometry(0.018, 0.01, 0.15)
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2
    const tick = new THREE.Mesh(tickGeo, i % 5 === 0 ? M.brass : M.brassDim)
    tick.position.set(Math.cos(a) * (BASE_R - 0.12), 0.01, Math.sin(a) * (BASE_R - 0.12))
    tick.rotation.y = -a
    machine.add(tick)
  }

  // ------------------------------------------------------------------ vault
  const vault = new THREE.Group()
  machine.add(vault)
  const vaultBody = add(vault, new THREE.CylinderGeometry(0.92, 1.05, 1.36, 6), M.dark, 0, 0.68, 0)
  vaultBody.receiveShadow = true
  add(vault, new THREE.CylinderGeometry(1.02, 1.02, 0.44, 6, 1, true), M.glass, 0, 0.98, 0)

  const core = add(vault, new THREE.IcosahedronGeometry(0.3, 2), M.core, 0, 0.95, 0)
  add(vault, new THREE.CylinderGeometry(0.66, 0.92, 0.2, 6), M.brass, 0, 1.46, 0)
  add(vault, new THREE.CylinderGeometry(0.04, 0.04, 0.34, 12), M.brass, 0, 1.72, 0)
  const emblem = add(vault, new THREE.TorusGeometry(0.28, 0.045, 12, 44), M.brassGlow, 0, 1.98, 0)
  emblem.rotation.x = Math.PI / 2

  // -------------------------------------------------------------- armillary
  const armillary = new THREE.Group()
  armillary.position.y = 1.0
  machine.add(armillary)
  const ringSpecs: Array<{ r: number; tilt: number; spin: number; mat: THREE.Material }> = [
    { r: 1.32, tilt: 0.42, spin: 0.14, mat: M.brassGlow },
    { r: 1.62, tilt: -0.72, spin: -0.1, mat: M.verdigris },
    { r: 1.94, tilt: 0.24, spin: 0.07, mat: M.brassDim },
  ]
  const armillaryRings = ringSpecs.map((spec) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(spec.r, 0.02, 8, 160), spec.mat)
    ring.rotation.x = Math.PI / 2 + spec.tilt
    ring.rotation.z = spec.tilt * 0.5
    armillary.add(ring)
    return { mesh: ring, spin: spec.spin }
  })
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2
    const stud = add(armillary, new THREE.SphereGeometry(0.045, 12, 12), M.brass, Math.cos(a) * 2.12, 0, Math.sin(a) * 2.12)
    stud.castShadow = false
  }

  // --------------------------------------------------------------- stations
  const stations: Station[] = []
  let scaleBeam: THREE.Mesh | null = null
  let scaleLeft: THREE.Mesh | null = null
  let scaleRight: THREE.Mesh | null = null

  STATION_IDS.forEach((id, index) => {
    const angle = -Math.PI / 2 + (index / STATION_IDS.length) * Math.PI * 2
    const group = new THREE.Group()
    group.position.set(Math.cos(angle) * STATION_R, 0, Math.sin(angle) * STATION_R)
    group.rotation.y = Math.PI / 2 - angle
    machine.add(group)

    // pedestal + glow ring (shared)
    add(group, new THREE.CylinderGeometry(0.5, 0.6, 0.14, 28), M.darker, 0, 0.07, 0)
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xc9a25b,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
    })
    const glow = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.028, 10, 60), glowMat)
    glow.rotation.x = -Math.PI / 2
    glow.position.y = 0.02
    group.add(glow)

    buildStation(id, group, M)

    const hit = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.8, 1.3), M.hit)
    hit.position.y = 0.95
    hit.userData.stationId = id
    group.add(hit)

    const anchor = new THREE.Vector3(Math.cos(angle) * STATION_R, LABEL_Y, Math.sin(angle) * STATION_R)
    stations.push({ id, angle, position: group.position.clone(), anchor, glow: glowMat, hit })

    if (id === 'settlement') {
      group.traverse((o) => {
        if (o.userData.part === 'beam') scaleBeam = o as THREE.Mesh
        if (o.userData.part === 'pan-left') scaleLeft = o as THREE.Mesh
        if (o.userData.part === 'pan-right') scaleRight = o as THREE.Mesh
      })
    }
  })

  // ------------------------------------------------------------------ token
  const token = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 1), M.brassGlow)
  const tokenGlow = new THREE.PointLight(0xe6c683, 3, 4, 2)
  token.add(tokenGlow)
  machine.add(token)

  const path = stations.map((s) => s.position.clone().setY(0.8))
  const tokenAt = (u: number) => {
    const n = path.length
    const i = Math.floor(u) % n
    const f = u - Math.floor(u)
    const p = path[i].clone().lerp(path[(i + 1) % n], f)
    p.y += Math.sin(f * Math.PI) * 0.4
    return p
  }

  // ------------------------------------------------------------------ motes
  const moteCount = 140
  const motePos = new Float32Array(moteCount * 3)
  for (let i = 0; i < moteCount; i++) {
    const a = Math.random() * Math.PI * 2
    const r = Math.sqrt(Math.random()) * BASE_R * 0.95
    motePos[i * 3] = Math.cos(a) * r
    motePos[i * 3 + 1] = 0.3 + Math.random() * 3.2
    motePos[i * 3 + 2] = Math.sin(a) * r
  }
  const moteGeo = new THREE.BufferGeometry()
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3))
  const motes = new THREE.Points(
    moteGeo,
    new THREE.PointsMaterial({
      color: 0xc9a25b,
      size: 0.03,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    }),
  )
  machine.add(motes)

  // ----------------------------------------------------------------- labels
  const labelsLayer = document.createElement('div')
  labelsLayer.className = 'ea3d-labels'
  root.appendChild(labelsLayer)
  for (const station of stations) {
    const el = document.createElement('div')
    el.className = 'ea3d-label'
    el.innerHTML = `<span class="ea3d-dot"></span>${STATION_LABEL[station.id]}`
    labelsLayer.appendChild(el)
    station.label = el
  }

  // ----------------------------------------------------------- control chrome
  const controlsEl = document.createElement('div')
  controlsEl.className = 'ea3d-controls'
  controlsEl.innerHTML = `
    <button type="button" class="ea3d-btn" data-act="zoom-in" aria-label="Zoom in" title="Zoom in (or hold Ctrl and scroll)">
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M8 3.6v8.8M3.6 8h8.8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
    </button>
    <button type="button" class="ea3d-btn" data-act="zoom-out" aria-label="Zoom out" title="Zoom out (or hold Ctrl and scroll)">
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3.6 8h8.8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
    </button>
    <button type="button" class="ea3d-btn" data-act="rotate" aria-label="Toggle rotation" title="Pause or resume rotation">
      <svg class="ea3d-ico-pause" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="4" y="3.5" width="2.6" height="9" rx="0.6"/><rect x="9.4" y="3.5" width="2.6" height="9" rx="0.6"/></svg>
      <svg class="ea3d-ico-play" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M5 3.6v8.8l7-4.4z"/></svg>
    </button>
    <button type="button" class="ea3d-btn" data-act="reset" aria-label="Reset view" title="Reset view">
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M12.6 6.4A4.8 4.8 0 1 0 12.8 8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M12.9 3.3v3.2H9.7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
  `
  root.appendChild(controlsEl)
  const zoomInBtn = controlsEl.querySelector<HTMLButtonElement>('[data-act="zoom-in"]')
  const zoomOutBtn = controlsEl.querySelector<HTMLButtonElement>('[data-act="zoom-out"]')
  const rotateBtn = controlsEl.querySelector<HTMLButtonElement>('[data-act="rotate"]')
  const resetBtn = controlsEl.querySelector<HTMLButtonElement>('[data-act="reset"]')

  function syncControls() {
    const rotating = controls.autoRotate || (viewGoal.active && viewGoal.resumeAuto)
    controlsEl.classList.toggle('is-paused', !rotating)
  }

  // -------------------------------------------------------------- interaction
  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  const hits = stations.map((s) => s.hit)
  let hoverId: StationId | null = null
  let activeId: StationId | null = null
  let downAt = { x: 0, y: 0, t: 0 }

  const toNdc = (event: PointerEvent) => {
    const rect = renderer.domElement.getBoundingClientRect()
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
  }

  const pick = (): StationId | null => {
    raycaster.setFromCamera(pointer, camera)
    const found = raycaster.intersectObjects(hits, false)[0]
    return (found?.object.userData.stationId as StationId | undefined) ?? null
  }

  const onMove = (event: PointerEvent) => {
    toNdc(event)
    const id = pick()
    if (id !== hoverId) {
      hoverId = id
      renderer.domElement.style.cursor = id ? 'pointer' : 'grab'
    }
  }

  const onDown = (event: PointerEvent) => {
    downAt = { x: event.clientX, y: event.clientY, t: performance.now() }
  }

  const onUp = (event: PointerEvent) => {
    const moved = Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y)
    const quick = performance.now() - downAt.t < 600
    if (moved > 8 || !quick) return
    toNdc(event)
    const id = pick()
    if (id) {
      if (id === activeId) {
        activeId = null
        resetView()
      } else {
        activeId = id
        opts.onStation(id)
        focusStation(id)
      }
    } else if (activeId || !controls.autoRotate) {
      activeId = null
      controls.autoRotate = true
    }
    syncControls()
  }

  const onLeave = () => {
    hoverId = null
    renderer.domElement.style.cursor = 'grab'
  }

  renderer.domElement.addEventListener('pointermove', onMove)
  renderer.domElement.addEventListener('pointerdown', onDown)
  renderer.domElement.addEventListener('pointerup', onUp)
  renderer.domElement.addEventListener('pointerleave', onLeave)

  // ---------------------------------------------------------------- camera
  const viewGoal = { pos: new THREE.Vector3(), look: new THREE.Vector3(), active: false, resumeAuto: false }

  function setView(pos: THREE.Vector3, look: THREE.Vector3, resumeAuto = false) {
    viewGoal.pos.copy(pos)
    viewGoal.look.copy(look)
    viewGoal.active = true
    viewGoal.resumeAuto = resumeAuto
    controls.autoRotate = false
  }

  function focusStation(id: StationId) {
    const station = stations.find((s) => s.id === id)
    if (!station) return
    const world = station.position.clone().add(machine.position)
    const outward = new THREE.Vector3(Math.cos(station.angle), 0, Math.sin(station.angle))
    const pos = world.clone().add(outward.multiplyScalar(4.3)).setY(2.4)
    setView(pos, world.clone().setY(0.85))
  }

  const DOLLY_STEP = 1.16
  /** Move the camera toward or away from the target, clamped to the zoom range. */
  function dolly(scale: number) {
    const offset = camera.position.clone().sub(controls.target)
    const next = THREE.MathUtils.clamp(offset.length() * scale, controls.minDistance, controls.maxDistance)
    offset.setLength(next)
    camera.position.copy(controls.target).add(offset)
    viewGoal.active = false
    controls.update()
  }

  // Wheel zoom is opt-in: while a modifier is held the wheel dollies the camera
  // (and preventDefaults, so the page holds still); otherwise the event is left
  // alone and the page scrolls as the user expects.
  const ZOOM_KEYS = new Set(['Control', 'Meta', 'Shift'])
  const onZoomKeyDown = (event: KeyboardEvent) => {
    if (ZOOM_KEYS.has(event.key)) controls.enableZoom = true
  }
  const onZoomKeyUp = (event: KeyboardEvent) => {
    if (ZOOM_KEYS.has(event.key)) controls.enableZoom = false
  }
  const onZoomBlur = () => {
    controls.enableZoom = false
  }
  window.addEventListener('keydown', onZoomKeyDown)
  window.addEventListener('keyup', onZoomKeyUp)
  window.addEventListener('blur', onZoomBlur)

  controls.addEventListener('start', () => {
    viewGoal.active = false
  })

  const shiftX = 0

  // On wide embeds the instrument is nudged off centre with a camera lens
  // shift, so the hero copy on the left stays clear of it.
  const LENS_SHIFT = 0.17
  const LENS_LIFT = 0.08

  function layout() {
    const width = root.clientWidth || 1
    const height = root.clientHeight || 1
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    if (embedded && width / height > 1.15) {
      camera.setViewOffset(width, height, -LENS_SHIFT * width, LENS_LIFT * height, width, height)
    } else {
      camera.clearViewOffset()
    }
    camera.updateProjectionMatrix()
  }

  layout()

  machine.position.x = shiftX
  controls.target.set(shiftX, 0.95, 0)
  camera.position.set(shiftX + 4.9, 4.4, 7.4)
  camera.lookAt(shiftX, 0.95, 0)

  const resizeObserver = new ResizeObserver(() => layout())
  resizeObserver.observe(root)

  // ------------------------------------------------------------------- loop
  const clock = new THREE.Clock()
  let raf = 0
  let ready = false

  const animate = () => {
    raf = requestAnimationFrame(animate)
    const dt = clock.getDelta()
    const t = clock.elapsedTime

    armillaryRings.forEach((ring) => {
      ring.mesh.rotation.z += dt * ring.spin
    })
    core.rotation.y += dt * 0.6
    core.rotation.x += dt * 0.25
    const pulse = 0.85 + Math.sin(t * 2.1) * 0.28
    M.core.emissiveIntensity = pulse
    coreLight.intensity = 4.5 + pulse * 2.4
    core.scale.setScalar(1 + Math.sin(t * 2.1) * 0.05)

    token.position.copy(tokenAt((t * 0.11) % path.length))
    token.rotation.y += dt * 1.4

    if (scaleBeam && scaleLeft && scaleRight) {
      const tilt = Math.sin(t * 0.9) * 0.11
      scaleBeam.rotation.z = tilt
      scaleLeft.position.y = 0.72 - tilt * 0.55
      scaleRight.position.y = 0.72 + tilt * 0.55
    }

    motes.rotation.y += dt * 0.02

    // hover / active glow, lerped
    for (const station of stations) {
      const isActive = station.id === activeId
      const isHover = station.id === hoverId
      const target = isActive ? 0.9 : isHover ? 0.5 : 0.14
      station.glow.opacity += (target - station.glow.opacity) * 0.14
      station.glow.color.setHex(isActive ? 0x46a192 : isHover ? 0xe6c683 : 0xc9a25b)
    }

    if (viewGoal.active) {
      camera.position.lerp(viewGoal.pos, 0.06)
      controls.target.lerp(viewGoal.look, 0.08)
      if (camera.position.distanceTo(viewGoal.pos) < 0.04) {
        viewGoal.active = false
        controls.autoRotate = viewGoal.resumeAuto
      }
    }

    controls.update()
    syncControls()
    renderer.render(scene, camera)
    updateLabels()

    if (!ready) {
      ready = true
      opts.onReady()
    }
  }

  const size = new THREE.Vector2()
  const projected = new THREE.Vector3()
  function updateLabels() {
    renderer.getSize(size)
    for (const station of stations) {
      if (!station.label) continue
      projected.copy(station.anchor).add(machine.position).project(camera)
      const x = (projected.x * 0.5 + 0.5) * size.x
      const y = (-projected.y * 0.5 + 0.5) * size.y
      const visible = projected.z < 1
      station.label.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`
      station.label.style.opacity = visible ? '1' : '0'
      station.label.classList.toggle('is-active', station.id === activeId)
      station.label.classList.toggle('is-hover', station.id === hoverId)
    }
  }

  // --------------------------------------------------------------------- api
  const resetView = () => {
    setView(new THREE.Vector3(shiftX + 4.9, 4.4, 7.4), new THREE.Vector3(shiftX, 0.95, 0), true)
  }

  const api: MachineApi = {
    setMode: (mode) => {
      if (mode === 'stations') setView(new THREE.Vector3(shiftX, 6.6, 6.6), new THREE.Vector3(shiftX, 0.4, 0))
      else if (mode === 'order') setView(new THREE.Vector3(shiftX + 7, 1.6, 0.2), new THREE.Vector3(shiftX, 0.9, 0))
      else if (mode === 'cutaway') setView(new THREE.Vector3(shiftX + 3.4, 2.4, 6.4), new THREE.Vector3(shiftX, 0.9, 0))
      else resetView()
    },
    setCamera: (preset) => {
      if (preset === 'top') setView(new THREE.Vector3(shiftX, 9.5, 0.01), new THREE.Vector3(shiftX, 0, 0))
      else if (preset === 'side') setView(new THREE.Vector3(shiftX + 9, 1.6, 0), new THREE.Vector3(shiftX, 0.9, 0))
      else if (preset === 'flight') {
        resetView()
      } else if (preset === 'station' && activeId) focusStation(activeId)
      else resetView()
    },
    focusStation,
    play: () => {
      controls.autoRotate = true
    },
    pause: () => {
      controls.autoRotate = false
    },
  }
  window.__machine = api

  zoomInBtn?.addEventListener('click', () => dolly(1 / DOLLY_STEP))
  zoomOutBtn?.addEventListener('click', () => dolly(DOLLY_STEP))
  rotateBtn?.addEventListener('click', () => {
    controls.autoRotate = !controls.autoRotate
    if (controls.autoRotate) viewGoal.active = false
    syncControls()
  })
  resetBtn?.addEventListener('click', () => {
    activeId = null
    resetView()
    syncControls()
  })

  animate()

  // ------------------------------------------------------------------ dispose
  return () => {
    cancelAnimationFrame(raf)
    resizeObserver.disconnect()
    renderer.domElement.removeEventListener('pointermove', onMove)
    renderer.domElement.removeEventListener('pointerdown', onDown)
    renderer.domElement.removeEventListener('pointerup', onUp)
    renderer.domElement.removeEventListener('pointerleave', onLeave)
    window.removeEventListener('keydown', onZoomKeyDown)
    window.removeEventListener('keyup', onZoomKeyUp)
    window.removeEventListener('blur', onZoomBlur)
    controls.dispose()
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (mesh.geometry) mesh.geometry.dispose()
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(material)) material.forEach((m) => m.dispose())
      else material?.dispose()
    })
    renderer.dispose()
    if (window.__machine === api) delete window.__machine
    root.replaceChildren()
  }
}

// --------------------------------------------------------------------------- //
// Station geometry
// --------------------------------------------------------------------------- //

function buildStation(id: StationId, group: THREE.Group, M: Record<string, THREE.Material>) {
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(x, y, z)
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
    return mesh
  }

  if (id === 'market') {
    for (let i = 0; i < 3; i++) {
      const ledger = add(new THREE.BoxGeometry(0.8, 0.05, 0.56), i === 2 ? M.brass : M.dark, 0, 0.3 + i * 0.075, 0)
      ledger.rotation.y = (i - 1) * 0.13
    }
    add(new THREE.BoxGeometry(0.62, 0.02, 0.4), M.core, 0, 0.45, 0.02)
    return
  }

  if (id === 'escrow') {
    // a sealed strongbox of held GEN — deliberately no dial, spokes or wheel
    const y0 = 0.14
    add(new THREE.BoxGeometry(0.78, 0.5, 0.56), M.dark, 0, y0 + 0.25, 0)
    add(new THREE.BoxGeometry(0.84, 0.1, 0.62), M.brass, 0, y0 + 0.55, 0)
    add(new THREE.BoxGeometry(0.66, 0.03, 0.46), M.brassDim, 0, y0 + 0.61, 0)
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        add(new THREE.BoxGeometry(0.06, 0.5, 0.06), M.brassDim, sx * 0.36, y0 + 0.25, sz * 0.28)
      }
    }
    // a heavy padlock hanging on the outward face
    add(new THREE.BoxGeometry(0.18, 0.16, 0.1), M.brass, 0, y0 + 0.22, 0.33)
    add(new THREE.TorusGeometry(0.085, 0.022, 10, 26, Math.PI), M.brassGlow, 0, y0 + 0.3, 0.33)
    const keyhole = add(new THREE.CylinderGeometry(0.028, 0.028, 0.02, 16), M.dark, 0, y0 + 0.22, 0.385)
    keyhole.rotation.x = Math.PI / 2
    // a wax seal stamped on the lid
    const wax = add(new THREE.CylinderGeometry(0.07, 0.075, 0.025, 26), M.seal, 0.24, y0 + 0.55, 0.31)
    wax.rotation.x = Math.PI / 2
    return
  }

  if (id === 'delivery') {
    // a strapped, labelled shipping crate — not a wrapped gift
    const y0 = 0.14
    add(new THREE.BoxGeometry(0.6, 0.46, 0.6), M.ivory, 0, y0 + 0.23, 0)
    add(new THREE.BoxGeometry(0.62, 0.025, 0.62), M.dark, 0, y0 + 0.47, 0)
    add(new THREE.BoxGeometry(0.1, 0.02, 0.62), M.brassDim, 0, y0 + 0.48, 0)
    add(new THREE.BoxGeometry(0.1, 0.46, 0.02), M.brassDim, 0, y0 + 0.23, 0.31)
    add(new THREE.BoxGeometry(0.1, 0.46, 0.02), M.brassDim, 0, y0 + 0.23, -0.31)
    // manifest label with a barcode
    add(new THREE.BoxGeometry(0.3, 0.2, 0.015), M.brass, -0.15, y0 + 0.26, 0.315)
    for (let i = 0; i < 6; i++) {
      add(new THREE.BoxGeometry(0.012, 0.1, 0.02), M.dark, -0.24 + i * 0.03, y0 + 0.26, 0.33)
    }
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        add(new THREE.BoxGeometry(0.09, 0.09, 0.09), M.brassDim, sx * 0.27, y0 + 0.045, sz * 0.27)
      }
    }
    return
  }

  if (id === 'tribunal') {
    add(new THREE.CylinderGeometry(0.4, 0.52, 0.82, 8), M.dark, 0, 0.42, 0)
    add(new THREE.CylinderGeometry(0.5, 0.5, 0.07, 8), M.brass, 0, 0.85, 0)
    const handle = add(new THREE.CylinderGeometry(0.028, 0.028, 0.44, 12), M.brass, 0.06, 0.95, 0.02)
    handle.rotation.z = Math.PI / 2
    add(new THREE.CylinderGeometry(0.075, 0.075, 0.2, 16), M.brassGlow, -0.14, 0.95, 0.02)
    const lights = [M.verdigris, M.brassGlow, M.seal]
    lights.forEach((mat, i) => add(new THREE.SphereGeometry(0.05, 14, 14), mat, (i - 1) * 0.18, 1.14, -0.18))
    return
  }

  // settlement — a balance that tips with the verdict
  add(new THREE.CylinderGeometry(0.045, 0.05, 0.9, 16), M.brass, 0, 0.45, 0)
  const beam = add(new THREE.BoxGeometry(1.02, 0.045, 0.05), M.brassGlow, 0, 0.92, 0)
  beam.userData.part = 'beam'
  const leftPan = add(new THREE.CylinderGeometry(0.2, 0.16, 0.035, 24), M.brass, -0.46, 0.72, 0)
  leftPan.userData.part = 'pan-left'
  const rightPan = add(new THREE.CylinderGeometry(0.2, 0.16, 0.035, 24), M.brass, 0.46, 0.72, 0)
  rightPan.userData.part = 'pan-right'
  add(new THREE.CylinderGeometry(0.008, 0.008, 0.2, 8), M.brassDim, -0.46, 0.82, 0)
  add(new THREE.CylinderGeometry(0.008, 0.008, 0.2, 8), M.brassDim, 0.46, 0.82, 0)
}

// --------------------------------------------------------------------------- //
// Scoped styles
// --------------------------------------------------------------------------- //

const CSS = `
.ea3d-canvas { display: block; width: 100%; height: 100%; touch-action: none; outline: none; }
.ea3d-labels { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.ea3d-label {
  position: absolute; left: 0; top: 0; white-space: nowrap;
  transform: translate(-50%, -100%);
  font: 500 10px/1 var(--font-plex-mono, ui-monospace, monospace);
  letter-spacing: 0.16em; text-transform: uppercase;
  color: #8b96a1;
  padding: 4px 8px;
  border: 1px solid rgba(43, 55, 66, 0.75);
  background: rgba(9, 12, 16, 0.62);
  border-radius: 3px;
  transition: color 0.18s ease, border-color 0.18s ease, opacity 0.18s ease;
}
.ea3d-label .ea3d-dot {
  display: inline-block; width: 5px; height: 5px; border-radius: 50%;
  background: #c9a25b; margin-right: 7px; vertical-align: middle;
  transition: background 0.18s ease;
}
.ea3d-label.is-hover { color: #ece4d3; border-color: rgba(230, 198, 131, 0.7); }
.ea3d-label.is-hover .ea3d-dot { background: #e6c683; }
.ea3d-label.is-active { color: #ece4d3; border-color: rgba(70, 161, 146, 0.75); }
.ea3d-label.is-active .ea3d-dot { background: #46a192; }
.ea3d-controls {
  position: absolute; right: 16px; bottom: 16px; z-index: 3;
  display: flex; gap: 8px;
}
.ea3d-btn {
  width: 34px; height: 34px; display: grid; place-items: center; padding: 0;
  border: 1px solid rgba(43, 55, 66, 0.9);
  background: rgba(10, 13, 16, 0.66);
  color: #cdd6de; border-radius: 5px; cursor: pointer;
  -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px);
  transition: color 0.18s ease, border-color 0.18s ease, background 0.18s ease;
}
.ea3d-btn:hover { color: #ece4d3; border-color: rgba(201, 162, 91, 0.7); background: rgba(10, 13, 16, 0.82); }
.ea3d-btn:focus-visible { outline: 2px solid rgba(201, 162, 91, 0.8); outline-offset: 2px; }
.ea3d-btn svg { fill: currentColor; }
.ea3d-btn .ea3d-ico-play { display: none; }
.ea3d-controls.is-paused .ea3d-ico-pause { display: none; }
.ea3d-controls.is-paused .ea3d-ico-play { display: block; }
`
