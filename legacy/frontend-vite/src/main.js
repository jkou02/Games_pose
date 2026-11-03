import { createScene } from './scene.js'
import { loadAvatar } from './avatar.js'
import { createPoseSocket } from './ws-client.js'

const canvas = document.querySelector('#viewport')
const statusEl = document.querySelector('#status')
const trackingEl = document.querySelector('#tracking')
const fpsEl = document.querySelector('#fps')

const app = createScene(canvas)
const avatar = await loadAvatar(app.scene)
if (avatar.isPlaceholder) {
  console.info('Avatar placeholder activo: agregá frontend/public/models/avatar.glb')
}

let latestPose = null
let receivedFrames = 0
let windowStart = performance.now()

createPoseSocket({
  onPose: (payload) => {
    latestPose = payload
    receivedFrames += 1
    trackingEl.textContent = payload.detected
      ? `detectado ${payload.confidence.toFixed(2)}`
      : 'sin detección'
  },
  onStatus: ({ state }) => {
    statusEl.dataset.state = state
    const labels = {
      connecting: '○ conectando',
      connected: '● conectado',
      disconnected: '○ desconectado',
      error: '× error',
    }
    statusEl.textContent = labels[state] ?? state
  },
})

app.start(() => {
  const now = performance.now()
  if (now - windowStart >= 500) {
    fpsEl.textContent = `${Math.round((receivedFrames * 1000) / (now - windowStart))} FPS`
    receivedFrames = 0
    windowStart = now
  }
  void latestPose
})
