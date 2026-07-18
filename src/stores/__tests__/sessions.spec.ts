import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/api/client'
import type { DeviceSession, PairingSession } from '@/api/client'

import { useSessionsStore } from '../sessions'
import type { DeviceSessionsClient } from '../sessions'

const firstId = '10000000-0000-4000-8000-000000000001'
const secondId = '20000000-0000-4000-8000-000000000002'

function deviceSession(id: string, current = false): DeviceSession {
  return {
    id,
    device_name: current ? 'This browser' : 'Pixel 9 Pro',
    current,
    created_at: '2026-07-15T12:00:00Z',
    last_seen_at: current ? '2026-07-16T12:00:00Z' : '2026-07-16T10:00:00Z',
    expires_at: '2026-07-17T00:00:00Z',
    refresh_expires_at: '2026-08-15T12:00:00Z',
  }
}

function createClient(createdPairing = pairingSession()): DeviceSessionsClient {
  return {
    listDeviceSessions: vi.fn(async () => ({
      items: [deviceSession(firstId), deviceSession(secondId, true)],
    })),
    createPairingSession: vi.fn(async () => createdPairing),
    revokeDeviceSession: vi.fn(async () => undefined),
  }
}

function pairingSession(): PairingSession {
  const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString()
  return {
    id: '30000000-0000-4000-8000-000000000003',
    expires_at: expiresAt,
    payload: `voiceasset://pair?expires_at=${encodeURIComponent(expiresAt)}&secret=[REDACTED]`,
  }
}

describe('device sessions store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('loads active sessions in server activity order', async () => {
    const store = useSessionsStore()
    const client = createClient()

    await expect(store.load(client)).resolves.toBe(true)

    expect(store.items.map((session) => session.id)).toEqual([firstId, secondId])
    expect(store.error).toBeNull()
  })

  it('removes a revoked session and returns whether it was current', async () => {
    const store = useSessionsStore()
    const client = createClient()
    await store.load(client)

    await expect(store.revoke(secondId, client)).resolves.toMatchObject({ current: true })

    expect(client.revokeDeviceSession).toHaveBeenCalledWith(secondId)
    expect(store.items.map((session) => session.id)).toEqual([firstId])
  })

  it('surfaces structured errors and keeps the inventory intact', async () => {
    const store = useSessionsStore()
    const client = createClient()
    await store.load(client)
    vi.mocked(client.revokeDeviceSession).mockRejectedValue(
      new ApiError('Resource was not found.', {
        status: 404,
        code: 'not_found',
        requestId: 'request-123',
      }),
    )

    await expect(store.revoke(firstId, client)).resolves.toBeNull()

    expect(store.items).toHaveLength(2)
    expect(store.error).toBe('Resource was not found. Request ID: request-123.')
  })

  it('keeps a pairing payload only in memory until explicit clearing', async () => {
    const store = useSessionsStore()
    const created = pairingSession()
    const client = createClient(created)
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem')

    await expect(store.createPairing(client)).resolves.toBe(true)

    expect(store.pairingSession).toEqual(created)
    expect(storageWrite).not.toHaveBeenCalled()

    store.clearPairingSession()
    expect(store.pairingSession).toBeNull()
    storageWrite.mockRestore()
  })

  it('clears the one-time payload on inventory refresh and reset', async () => {
    const store = useSessionsStore()
    const client = createClient()

    await store.createPairing(client)
    await store.load(client)
    expect(store.pairingSession).toBeNull()

    await store.createPairing(client)
    store.reset()
    expect(store.pairingSession).toBeNull()
  })

  it('clears the one-time payload when its five-minute expiry arrives', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-18T04:00:00Z'))
    const store = useSessionsStore()
    const client = createClient()

    await store.createPairing(client)
    expect(store.pairingSession).not.toBeNull()

    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(store.pairingSession).toBeNull()
  })
})
