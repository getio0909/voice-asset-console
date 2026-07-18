import { computed, readonly, ref } from 'vue'
import { defineStore } from 'pinia'

import { ApiError, apiClient } from '@/api/client'
import type { DeviceSession, DeviceSessionList, PairingSession } from '@/api/client'

const MAX_PAIRING_TTL_MS = 6 * 60_000

export interface DeviceSessionsClient {
  listDeviceSessions(): Promise<DeviceSessionList>
  createPairingSession(): Promise<PairingSession>
  revokeDeviceSession(deviceSessionId: string): Promise<void>
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const request = error.requestId ? ` Request ID: ${error.requestId}.` : ''
    return `${error.message}${request}`
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }
  return 'The operation could not be completed.'
}

export const useSessionsStore = defineStore('device-sessions', () => {
  const items = ref<DeviceSession[]>([])
  const loading = ref(false)
  const revokingId = ref<string | null>(null)
  const creatingPairing = ref(false)
  const pairingSession = ref<PairingSession | null>(null)
  const error = ref<string | null>(null)
  let pairingExpiryTimer: ReturnType<typeof setTimeout> | undefined
  let pairingGeneration = 0

  const isBusy = computed(() => loading.value || revokingId.value !== null || creatingPairing.value)

  function clearPairingSession(): void {
    pairingGeneration += 1
    if (pairingExpiryTimer !== undefined) {
      clearTimeout(pairingExpiryTimer)
      pairingExpiryTimer = undefined
    }
    pairingSession.value = null
  }

  async function load(client: DeviceSessionsClient = apiClient): Promise<boolean> {
    clearPairingSession()
    if (isBusy.value) {
      error.value = 'Wait for the current device-session operation to finish.'
      return false
    }
    loading.value = true
    error.value = null
    try {
      const result = await client.listDeviceSessions()
      items.value = result.items
      return true
    } catch (cause) {
      error.value = safeErrorMessage(cause)
      return false
    } finally {
      loading.value = false
    }
  }

  async function createPairing(client: DeviceSessionsClient = apiClient): Promise<boolean> {
    if (isBusy.value) {
      error.value = 'Wait for the current device-session operation to finish.'
      return false
    }
    clearPairingSession()
    const generation = pairingGeneration
    creatingPairing.value = true
    error.value = null
    try {
      const created = await client.createPairingSession()
      if (generation !== pairingGeneration) {
        return false
      }
      const expiresIn = new Date(created.expires_at).getTime() - Date.now()
      if (!Number.isFinite(expiresIn) || expiresIn <= 0 || expiresIn > MAX_PAIRING_TTL_MS) {
        throw new TypeError('Server returned an invalid device-pairing expiry.')
      }
      pairingSession.value = Object.freeze({ ...created })
      pairingExpiryTimer = setTimeout(clearPairingSession, expiresIn)
      return true
    } catch (cause) {
      error.value = safeErrorMessage(cause)
      return false
    } finally {
      creatingPairing.value = false
    }
  }

  async function revoke(
    deviceSessionId: string,
    client: DeviceSessionsClient = apiClient,
  ): Promise<DeviceSession | null> {
    if (isBusy.value) {
      error.value = 'Wait for the current device-session operation to finish.'
      return null
    }
    const target = items.value.find((session) => session.id === deviceSessionId)
    if (!target) {
      error.value = 'Device session is not in the active inventory.'
      return null
    }

    revokingId.value = deviceSessionId
    error.value = null
    try {
      await client.revokeDeviceSession(deviceSessionId)
      items.value = items.value.filter((session) => session.id !== deviceSessionId)
      return target
    } catch (cause) {
      error.value = safeErrorMessage(cause)
      return null
    } finally {
      revokingId.value = null
    }
  }

  function reset(): void {
    items.value = []
    error.value = null
    clearPairingSession()
  }

  return {
    clearPairingSession,
    createPairing,
    creatingPairing: readonly(creatingPairing),
    error: readonly(error),
    isBusy,
    items: readonly(items),
    load,
    loading: readonly(loading),
    pairingSession: readonly(pairingSession),
    reset,
    revoke,
    revokingId: readonly(revokingId),
  }
})
