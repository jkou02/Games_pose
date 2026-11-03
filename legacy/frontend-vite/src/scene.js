import * as THREE from 'three'

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.shadowMap.enabled = true
  renderer.toneMapping = THREE.ACESFilmicToneMapping

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x101319)
  scene.fog = new THREE.Fog(0x101319, 5, 14)

  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    100,
  )
  camera.position.set(0, 1.5, 3.8)
  camera.lookAt(0, 0.9, 0)

  scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x1a1f2b, 2.2))

  const key = new THREE.DirectionalLight(0xffffff, 2.5)
  key.position.set(2.5, 4, 2.5)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  key.shadow.camera.near = 0.5
  key.shadow.camera.far = 12
  scene.add(key)

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(14, 64),
    new THREE.MeshStandardMaterial({ color: 0x232a3a, roughness: 0.95 }),
  )
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)

  const grid = new THREE.GridHelper(12, 24, 0x4a5875, 0x2c3547)
  grid.position.y = 0.002
  scene.add(grid)

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  })

  return {
    renderer,
    scene,
    camera,
    start(update) {
      renderer.setAnimationLoop(() => {
        update?.()
        renderer.render(scene, camera)
      })
    },
  }
}
