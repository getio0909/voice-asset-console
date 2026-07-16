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
  const compatibilityIssue = ref<string | null>(null)
  const serverVersion = ref<string | null>(null)

  const phaseLabel = computed(() => (phase.value === 'initialization' ? 'Initialization' : 'Ready'))
  const isReady = computed(() => phase.value === 'ready')

  function setApiStatus(status: ApiStatus): void {
    apiStatus.value = status
  }

  async function checkApi(client: CapabilitiesClient = apiClient): Promise<void> {
    setApiStatus('checking')
    compatibilityIssue.value = null
    serverVersion.value = null

    try {
      const capabilities = await client.getCapabilities()
      if (capabilities.api_version !== API_VERSION) {
        throw new Error(`Unsupported API version: ${capabilities.api_version}`)
      }
      if (capabilities.contract_version !== CONTRACT_VERSION) {
        throw new Error(`Unsupported contract version: ${capabilities.contract_version}`)
      }

      const missing = REQUIRED_SERVER_FEATURES.filter(
        (feature) => !capabilities.features.includes(feature),
      )
      if (missing.length > 0) {
        throw new Error(`Missing required Server features: ${missing.join(', ')}`)
      }

      serverVersion.value = capabilities.server_version
      setApiStatus('available')
    } catch (error) {
      compatibilityIssue.value = error instanceof Error ? error.message : 'Capability check failed.'
      setApiStatus('unavailable')
    }
  }

  return {
    apiStatus: readonly(apiStatus),
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
