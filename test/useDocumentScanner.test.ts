import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useDocumentScanner } from '../src/useDocumentScanner'
import { MockWebSocket } from './mockWebSocket'

// Fake timers block @testing-library's waitFor (it polls via setTimeout), so
// this suite avoids waitFor entirely: the mock's callbacks run synchronously
// inside act(), which flushes React state before the next assertion — no
// polling needed except where we deliberately advance the fake clock.
beforeEach(() => {
  MockWebSocket.reset()
  vi.stubGlobal('WebSocket', MockWebSocket)
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('useDocumentScanner', () => {
  it('connects and reports connected on open', () => {
    const { result } = renderHook(() => useDocumentScanner())
    expect(result.current.connection).toBe('connecting')

    act(() => MockWebSocket.latest().open())
    expect(result.current.connection).toBe('connected')
  })

  it('parses a status frame', () => {
    const { result } = renderHook(() => useDocumentScanner())
    act(() => MockWebSocket.latest().open())

    act(() => MockWebSocket.latest().sendJson({ type: 'status', status: 'reading' }))
    expect(result.current.phase).toBe('reading')
  })

  it('parses a result frame and clears it on demand', () => {
    const { result } = renderHook(() => useDocumentScanner())
    act(() => MockWebSocket.latest().open())

    const scan = {
      mrz: {
        firstName: 'MARIA',
        middleName: null,
        lastName: 'SANTOS',
        documentNumber: 'P1234567',
        documentType: 'passport',
        dateOfBirth: '1990-05-14',
        gender: 'F',
        nationality: 'PHL',
        issuingCountry: 'PHL',
        expiryDate: '2030-05-14',
      },
      images: { front: null, back: null, portrait: null },
      chip: null,
      capturedAt: '2026-07-14T00:00:00.000Z',
    }
    act(() => MockWebSocket.latest().sendJson({ type: 'result', data: scan }))
    expect(result.current.lastScan?.mrz.lastName).toBe('SANTOS')

    act(() => result.current.clearScan())
    expect(result.current.lastScan).toBeNull()
  })

  it('surfaces an error frame message', () => {
    const { result } = renderHook(() => useDocumentScanner())
    act(() => MockWebSocket.latest().open())

    act(() =>
      MockWebSocket.latest().sendJson({
        type: 'error',
        code: 'ERROR_FEATURE_NOT_SUPPORTED',
        message: 'Feature not supported - "UV"',
      })
    )
    expect(result.current.error).toBe('Feature not supported - "UV"')
  })

  it('calls onProtocolError with the ZodError on a contract mismatch', () => {
    const onProtocolError = vi.fn()
    const { result } = renderHook(() => useDocumentScanner({ onProtocolError }))
    act(() => MockWebSocket.latest().open())

    act(() => MockWebSocket.latest().sendJson({ type: 'status', status: 'not_a_real_phase' }))

    expect(result.current.error).toMatch(/does not match the contract/)
    expect(onProtocolError).toHaveBeenCalledTimes(1)
    const issue = onProtocolError.mock.calls[0][0]
    expect(issue.zodError).toBeDefined()
    expect(issue.raw).toEqual({ type: 'status', status: 'not_a_real_phase' })
  })

  it('calls onProtocolError on malformed JSON without a zodError', () => {
    const onProtocolError = vi.fn()
    const { result } = renderHook(() => useDocumentScanner({ onProtocolError }))
    act(() => MockWebSocket.latest().open())

    act(() => MockWebSocket.latest().send('not json{{'))

    expect(result.current.error).toMatch(/malformed frame/)
    expect(onProtocolError).toHaveBeenCalledWith({ raw: undefined })
  })

  it('reconnects with capped exponential backoff after the bridge drops', async () => {
    const { result } = renderHook(() => useDocumentScanner())
    act(() => MockWebSocket.latest().open())
    expect(result.current.connection).toBe('connected')

    act(() => MockWebSocket.latest().serverClose())
    expect(result.current.connection).toBe('disconnected')
    expect(MockWebSocket.instances).toHaveLength(1)

    // First retry after 1s.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(MockWebSocket.instances).toHaveLength(2)
  })

  it('does not connect while disabled, and connects once enabled', () => {
    const { result, rerender } = renderHook(({ enabled }) => useDocumentScanner({ enabled }), {
      initialProps: { enabled: false },
    })
    expect(result.current.connection).toBe('disconnected')
    expect(MockWebSocket.instances).toHaveLength(0)

    rerender({ enabled: true })
    expect(MockWebSocket.instances).toHaveLength(1)
  })

  it('reconnect() resets backoff and forces an immediate retry', () => {
    const { result } = renderHook(() => useDocumentScanner())
    act(() => MockWebSocket.latest().open())
    act(() => MockWebSocket.latest().serverClose())
    expect(result.current.connection).toBe('disconnected')

    act(() => result.current.reconnect())
    expect(MockWebSocket.instances).toHaveLength(2)
  })
})
