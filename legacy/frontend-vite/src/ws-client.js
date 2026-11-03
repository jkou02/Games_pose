const DEFAULT_URL = 'ws://127.0.0.1:8765'

export function createPoseSocket({
  url = DEFAULT_URL,
  onPose,
  onStatus,
  reconnectDelay = 1000,
} = {}) {
  let socket = null
  let closedByUser = false
  let attempt = 0

  const setStatus = (state, detail = '') => onStatus?.({ state, detail, url })

  function connect() {
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
    }

    socket.onerror = () => setStatus('error')
    socket.onclose = () => {
      if (closedByUser) return
      setStatus('disconnected')
      attempt = Math.min(attempt + 1, 10)
      setTimeout(connect, reconnectDelay * attempt)
    }
  }

  connect()

  return {
    close() {
      closedByUser = true
      socket?.close()
    },
  }
}
