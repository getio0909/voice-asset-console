import { computed, readonly, ref } from 'vue'
import { defineStore } from 'pinia'

import { apiClient } from '@/api/client'
import type { ServerCapabilities } from '@/api/client'
import { apiConfig } from '@/config/api'
import { API_VERSION, CONTRACT_VERSION, REQUIRED_SERVER_FEATURES } from '@/config/contract'

export type ConsolePhase = 'initialization' | 'ready'
export type ApiStatus = 'not-configured' | 'checking' | 'available' | 'unavailable'

export interface CapabilitiesClient {
  getCapabilities(): Promise<ServerCapabilities>
}

export const useConsoleStore = defineStore('console', () => {
  const phase = ref<ConsolePhase>('initialization')
  const apiStatus = ref<ApiStatus>('not-configured')
  const capabilities = ref<ServerCapabilities | null>(null)
  const compatibilityIssue = ref<string | null>(null)
  const serverVersion = ref<string | null>(null)

  const phaseLabel = computed(() =>
    phase.value === 'initialization' ? 'Connecting' : 'Compatible server',
  )
  const isReady = computed(() => phase.value === 'ready')

  function setApiStatus(status: ApiStatus): void {
    apiStatus.value = status
  }

  async function checkApi(client: CapabilitiesClient = apiClient): Promise<void> {
    phase.value = 'initialization'
    setApiStatus('checking')
    capabilities.value = null
    compatibilityIssue.value = null
    serverVersion.value = null

    try {
      const observed = await client.getCapabilities()
      capabilities.value = observed
      if (observed.api_version !== API_VERSION) {
        throw new Error(`Unsupported API version: ${observed.api_version}`)
      }
      if (observed.contract_version !== CONTRACT_VERSION) {
        throw new Error(`Unsupported contract version: ${observed.contract_version}`)
      }

      const missing = REQUIRED_SERVER_FEATURES.filter(
        (feature) => !observed.features.includes(feature),
      )
      if (missing.length > 0) {
        throw new Error(`Missing required Server features: ${missing.join(', ')}`)
      }

      serverVersion.value = observed.server_version
      phase.value = 'ready'
      setApiStatus('available')
    } catch (error) {
      phase.value = 'initialization'
      compatibilityIssue.value = error instanceof Error ? error.message : 'Capability check failed.'
      setApiStatus('unavailable')
    }
  }

  return {
    apiStatus: readonly(apiStatus),
    capabilities: readonly(capabilities),
    checkApi,
    compatibilityIssue: readonly(compatibilityIssue),
    contractVersion: apiConfig.contractVersion,
    isReady,
    phase: readonly(phase),
    phaseLabel,
    serverVersion: readonly(serverVersion),
    setApiStatus,
  }
})
