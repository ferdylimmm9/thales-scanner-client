/** Minimal WebSocket mock: no real network, full control of open/message/close timing. */
export class MockWebSocket {
  static instances: MockWebSocket[] = []

  url: string
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  closed = false

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
  }

  static reset() {
    MockWebSocket.instances = []
  }

  static latest(): MockWebSocket {
    const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1]
    if (!ws) throw new Error('No MockWebSocket instances created yet')
    return ws
  }

  open() {
    this.onopen?.()
  }

  send(data: string) {
    this.onmessage?.({ data })
  }

  sendJson(payload: unknown) {
    this.send(JSON.stringify(payload))
  }

  close() {
    if (this.closed) return
    this.closed = true
    this.onclose?.()
  }

  /** Simulate the server dropping the connection (bridge crashed, etc). */
  serverClose() {
    this.close()
  }
}
