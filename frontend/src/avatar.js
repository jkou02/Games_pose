import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const PLACEHOLDER_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x9aa7bd,
  roughness: 0.55,
  metalness: 0.15,
})

function addPart(group, width, height, depth, x, y, z) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    PLACEHOLDER_MATERIAL,
  )
  mesh.position.set(x, y, z)
  mesh.castShadow = true
  group.add(mesh)
  return mesh
}

export function buildPlaceholderAvatar() {
  const group = new THREE.Group()
  group.name = 'PlaceholderAvatar'
  addPart(group, 0.42, 0.58, 0.24, 0, 1.2, 0) // torso
  addPart(group, 0.22, 0.24, 0.22, 0, 1.62, 0) // cabeza
  addPart(group, 0.13, 0.62, 0.13, -0.3, 1.2, 0) // brazo izquierdo
  addPart(group, 0.13, 0.62, 0.13, 0.3, 1.2, 0) // brazo derecho
  addPart(group, 0.16, 0.9, 0.18, -0.11, 0.45, 0) // pierna izquierda
  addPart(group, 0.16, 0.9, 0.18, 0.11, 0.45, 0) // pierna derecha
  return group
}

export function collectBones(root) {
  const bones = new Map()
  root.traverse((object) => {
    if (object.isBone) bones.set(object.name, object)
  })
  return bones
}

async function avatarExists(url) {
  try {
    const response = await fetch(url, { method: 'HEAD' })
    const type = response.headers.get('content-type') ?? ''
    return response.ok && !type.includes('text/html')
  } catch {
    return false
  }
}

export async function loadAvatar(scene, url = '/models/avatar.glb') {
  if (!(await avatarExists(url))) {
    console.info(`No hay avatar en ${url}; se usa maniquí de prueba.`)
    const root = buildPlaceholderAvatar()
    scene.add(root)
    return { root, bones: new Map(), isPlaceholder: true }
  }

  try {
    const gltf = await new GLTFLoader().loadAsync(url)
    const root = gltf.scene
    root.name = 'Avatar'
    root.traverse((object) => {
      if (object.isMesh) {
        object.castShadow = true
        object.frustumCulled = false
      }
    })
    scene.add(root)
    return { root, bones: collectBones(root), isPlaceholder: false }
  } catch (error) {
    console.warn(`No se pudo interpretar ${url}; se usa maniquí de prueba.`, error)
    const root = buildPlaceholderAvatar()
    scene.add(root)
    return { root, bones: new Map(), isPlaceholder: true }
  }
}
