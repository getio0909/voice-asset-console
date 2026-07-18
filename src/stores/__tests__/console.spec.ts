import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { CONTRACT_VERSION, REQUIRED_SERVER_FEATURES } from '@/config/contract'

import { useConsoleStore } from '../console'

describe('console store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('starts in an explicit, non-ready initialization state', () => {
    const store = useConsoleStore()

    expect(store.phase).toBe('initialization')
    expect(store.phaseLabel).toBe('Connecting')
    expect(store.isReady).toBe(false)
    expect(store.apiStatus).toBe('not-configured')
  })

  it('enables the Phase 3 workflow for an exactly compatible Server', async () => {
    const store = useConsoleStore()

    await store.checkApi({
      async getCapabilities() {
        return {
          server_version: '0.1.0-dev',
          api_version: 'v1',
          contract_version: CONTRACT_VERSION,
          features: [...REQUIRED_SERVER_FEATURES],
        }
      },
    })

    expect(store.apiStatus).toBe('available')
    expect(store.capabilities?.features).toEqual(REQUIRED_SERVER_FEATURES)
    expect(store.serverVersion).toBe('0.1.0-dev')
    expect(store.phase).toBe('ready')
    expect(store.phaseLabel).toBe('Compatible server')
  })

  it('fails closed when the Server contract is incompatible', async () => {
    const store = useConsoleStore()

    await store.checkApi({
      async getCapabilities() {
        return {
          server_version: '0.2.0',
          api_version: 'v1',
          contract_version: '999.0.0',
          features: [],
        }
      },
    })

    expect(store.apiStatus).toBe('unavailable')
    expect(store.capabilities?.contract_version).toBe('999.0.0')
    expect(store.compatibilityIssue).toContain('Unsupported contract version')
  })
})
