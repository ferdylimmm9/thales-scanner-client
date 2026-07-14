'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ZodError } from 'zod'

import {
  scannerMessageSchema,
  SCANNER_PHASE,
  type DocumentScanResult,
  type ScannerPhase,
} from './types'

const DEFAULT_BRIDGE_URL = 'ws://localhost:8765'

/** Reconnect backoff: 1s, 2s, 4s, ... capped at 15s. */
const BACKOFF_BASE_MS = 1000
const BACKOFF_MAX_MS = 15000

export type ScannerConnection = 'connecting' | 'connected' | 'disconnected' | 'error'

/** A frame arrived but didn't match the contract — see `useDocumentScanner`'s `onProtocolError`. */
export interface ScannerProtocolError {
  /** The raw parsed JSON that failed validation (or `undefined` if JSON.parse itself failed). */
  raw: unknown
  /** The Zod validation failure, when `raw` parsed but didn't match the schema. */
  zodError?: ZodError
}

export interface UseDocumentScannerResult {
  /** WebSocket link to the bridge. `disconnected` is a normal state (no scanner PC). */
  connection: ScannerConnection
  /** Last reader phase reported by the bridge. */
  phase: ScannerPhase
  /** Most recent successful scan; consume it then call `clearScan()`. */
  lastScan: DocumentScanResult | null
  error: string | null
  clearScan: () => void
  /** Manual retry — resets backoff and reconnects immediately. */
  reconnect: () => void
}

export interface UseDocumentScannerOptions {
  /** Bridge WebSocket URL. Defaults to ws://localhost:8765. */
  url?: string
  /** Only hold a socket open while true (e.g. while the capture dialog is open). */
  enabled?: boolean
  /**
   * Called whenever a frame arrives that doesn't match the contract — either
   * malformed JSON or a shape Zod rejects. `error` still gets a human-readable
   * string either way; this callback gives you the structured detail (which
   * field failed, the raw frame) for logging/reporting instead of guessing
   * from the generic message. See this package's TROUBLESHOOTING.md.
   */
  onProtocolError?: (issue: ScannerProtocolError) => void
}

/**
 * Connects to a thales-scanner-bridge instance (see
 * https://github.com/ferdylimmm9/thales-scanner-bridge) and surfaces reader
 * state + scan results to React.
 *
 * The bridge auto-triggers on document placement, so the client sends no
 * commands; this hook only listens, validates each frame with Zod, and
 * reconnects with backoff.
 */
export function useDocumentScanner(options: UseDocumentScannerOptions = {}): UseDocumentScannerResult {
  const { url = DEFAULT_BRIDGE_URL, enabled = true, onProtocolError } = options

  const [connection, setConnection] = useState<ScannerConnection>('disconnected')
  const [phase, setPhase] = useState<ScannerPhase>('idle')
  const [lastScan, setLastScan] = useState<DocumentScanResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const attemptRef = useRef(0)
  const onProtocolErrorRef = useRef(onProtocolError)
  onProtocolErrorRef.current = onProtocolError
  // Bumping this state re-runs the connection effect (used by manual reconnect).
  const [connectNonce, setConnectNonce] = useState(0)

  const clearScan = useCallback(() => setLastScan(null), [])

  const reconnect = useCallback(() => {
    attemptRef.current = 0
    setConnectNonce(n => n + 1)
  }, [])

  useEffect(() => {
    if (!enabled) {
      setConnection('disconnected')
      setPhase('idle')
      return undefined
    }

    let disposed = false

    const connect = () => {
      if (disposed) return

      setConnection('connecting')
      setError(null)

      let ws: WebSocket
      try {
        ws = new WebSocket(url)
      } catch {
        // Malformed URL — retrying won't help.
        setConnection('error')
        setError(`Invalid scanner bridge URL: ${url}`)
        return
      }
      wsRef.current = ws

      ws.onopen = () => {
        if (disposed) return
        attemptRef.current = 0
        setConnection('connected')
      }

      ws.onmessage = event => {
        if (disposed || typeof event.data !== 'string') return

        let raw: unknown
        try {
          raw = JSON.parse(event.data)
        } catch {
          setError('Scanner bridge sent a malformed frame.')
          onProtocolErrorRef.current?.({ raw: undefined })
          return
        }

        const parsed = scannerMessageSchema.safeParse(raw)
        if (!parsed.success) {
          setError('Scanner bridge sent a frame that does not match the contract.')
          onProtocolErrorRef.current?.({ raw, zodError: parsed.error })
          return
        }

        const message = parsed.data
        switch (message.type) {
          case 'status':
            setPhase(message.status)

            // The bridge follows a failed read with `waiting_for_document` almost
            // instantly — only clear the error when a NEW read starts, so the
            // failure message survives long enough for the operator to see it.
            if (message.status === SCANNER_PHASE.READING) setError(null)
            break
          case 'result':
            setLastScan(message.data)
            setError(null)
            break
          case 'error':
            setError(message.message)
            break
        }
      }

      ws.onclose = () => {
        if (disposed) return
        wsRef.current = null
        setConnection('disconnected')
        setPhase('idle')

        // Quiet, capped backoff — "bridge not running" is a normal state on dev machines.
        const delay = Math.min(BACKOFF_BASE_MS * 2 ** attemptRef.current, BACKOFF_MAX_MS)
        attemptRef.current += 1
        retryTimerRef.current = setTimeout(connect, delay)
      }

      // onclose always follows onerror; reconnection is handled there.
      ws.onerror = () => {}
    }

    connect()

    return () => {
      disposed = true
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
      retryTimerRef.current = null
      const ws = wsRef.current
      wsRef.current = null
      if (ws) {
        ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null
        ws.close()
      }
    }
  }, [url, enabled, connectNonce])

  return { connection, phase, lastScan, error, clearScan, reconnect }
}
