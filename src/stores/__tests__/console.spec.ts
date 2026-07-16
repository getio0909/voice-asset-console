import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useConsoleStore } from '../console'

describe('console store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('starts in an explicit, non-ready initialization state', () => {
    const store = useConsoleStore()

    expect(store.phase).toBe('initialization')
    expect(store.phaseLabel).toBe('Initialization')
    expect(store.isReady).toBe(false)
    expect(store.apiStatus).toBe('not-configured')
  })

  it('accepts an exactly compatible Server without changing the product phase', async () => {
    const store = useConsoleStore()

    await store.checkApi({
      async getCapabilities() {
        return {
          server_version: '0.1.0-dev',
          api_version: 'v1',
          contract_version: '0.1.0',
          features: ['capability_negotiation', 'health_checks', 'request_ids', 'structured_errors'],
        }
      },
    })

    expect(store.apiStatus).toBe('available')
    expect(store.serverVersion).toBe('0.1.0-dev')
    expect(store.phase).toBe('initialization')
  })

  it('fails closed when the Server contract is incompatible', async () => {
    const store = useConsoleStore()

    await store.checkApi({
      async getCapabilities() {
        return {
          server_version: '0.2.0',
          api_version: 'v1',
          contract_version: '0.2.0',
          features: [],
        }
      },
    })

    expect(store.apiStatus).toBe('unavailable')
    expect(store.compatibilityIssue).toContain('Unsupported contract version')
  })
})
