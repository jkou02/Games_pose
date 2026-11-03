import { createScene } from './scene.js'

const canvas = document.querySelector('#viewport')
const fpsEl = document.querySelector('#fps')

const app = createScene(canvas)

let frames = 0
let windowStart = performance.now()

app.start(() => {
  frames += 1
  const now = performance.now()
  if (now - windowStart >= 500) {
    fpsEl.textContent = `${Math.round((frames * 1000) / (now - windowStart))} FPS`
    frames = 0
    windowStart = now
  }
})
