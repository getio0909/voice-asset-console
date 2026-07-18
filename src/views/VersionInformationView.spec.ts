import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ServerCapabilities } from '@/api/client'
import { CONTRACT_VERSION, REQUIRED_SERVER_FEATURES } from '@/config/contract'
import { useConsoleStore } from '@/stores/console'

import VersionInformationView from './VersionInformationView.vue'

const apiMocks = vi.hoisted(() => ({ getCapabilities: vi.fn() }))

vi.mock('@/api/client', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...(actual as object), apiClient: apiMocks }
})

const capabilities: ServerCapabilities = {
  server_version: '0.1.0-dev',
  api_version: 'v1',
  contract_version: CONTRACT_VERSION,
  features: [...REQUIRED_SERVER_FEATURES],
}

describe('VersionInformationView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMocks.getCapabilities.mockResolvedValue({ ...capabilities, server_version: '0.1.1-dev' })
  })

  it('renders the observed contract and refreshes through the shared capability store', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const consoleStore = useConsoleStore()
    await consoleStore.checkApi({ getCapabilities: vi.fn(async () => capabilities) })

    const wrapper = mount(VersionInformationView, { global: { plugins: [pinia] } })

    expect(wrapper.get('h1').text()).toBe('Version Information')
    expect(wrapper.text()).toContain('0.1.0-dev')
    expect(wrapper.text()).toContain(CONTRACT_VERSION)
    expect(wrapper.findAll('.version-feature-list li')).toHaveLength(
      REQUIRED_SERVER_FEATURES.length,
    )

    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(apiMocks.getCapabilities).toHaveBeenCalledOnce()
    expect(wrapper.text()).toContain('0.1.1-dev')
    expect(wrapper.text()).toContain('Compatible')
  })
})
