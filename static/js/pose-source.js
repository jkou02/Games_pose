const WATCHDOG_MS = 600

/**
 * Cliente del backend MoCap.
 *
 * Reconecta con backoff exponencial y avisa `detected: false` si deja de recibir
 * frames, para que el avatar vuelva a reposo (AGENTS.md §7) en lugar de
 * congelarse en la última pose.
 */
export function createPoseSource({
  url,
  onPose,
  onStatus,
  reconnectDelay = 1000,
} = {}) {
  let socket = null
  let closed = false
  let attempt = 0
  let watchdog = null

  const setStatus = (state, detail = '') => onStatus?.({ state, detail, url })
  const sinSenal = () => onPose?.({ detected: false, confidence: 0 })

  function connect() {
    if (closed) return
    setStatus('connecting')
    socket = new WebSocket(url)

    socket.onopen = () => {
      attempt = 0
      setStatus('connected')
    }

    socket.onmessage = (event) => {
      try {
        onPose?.(JSON.parse(event.data))
      } catch (error) {
        console.warn('Payload inválido del backend', error)
      }
      clearTimeout(watchdog)
      watchdog = setTimeout(sinSenal, WATCHDOG_MS)
    }

    socket.onerror = () => {
      setStatus('error')
      clearTimeout(watchdog)
      sinSenal()
    }

    socket.onclose = () => {
      clearTimeout(watchdog)
      sinSenal()
      if (closed) return
      attempt = Math.min(attempt + 1, 8)
      setStatus('disconnected')
      setTimeout(connect, Math.min(reconnectDelay * 2 ** (attempt - 1), 8000))
    }
  }

  connect()

  return {
    close() {
      closed = true
      clearTimeout(watchdog)
      socket?.close()
    },
  }
}
