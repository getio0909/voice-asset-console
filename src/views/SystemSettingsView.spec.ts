import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DeploymentSystemSettings } from '@/api/client'
import { useAssetsStore } from '@/stores/assets'

import SystemSettingsView from './SystemSettingsView.vue'

const apiMocks = vi.hoisted(() => ({
  getAdminSystemSettings: vi.fn(),
}))

vi.mock('@/api/client', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...(actual as object), apiClient: apiMocks }
})

const settings: DeploymentSystemSettings = {
  scope: 'deployment',
  management: 'operator_environment',
  mutable: false,
  brand_name: 'VoiceAsset Test',
  public_origin: 'https://voice.example.test',
  storage_backend: 'local',
  cookie_secure: true,
  provider_credential_encryption_configured: true,
}

describe('SystemSettingsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMocks.getAdminSystemSettings.mockResolvedValue(settings)
  })

  it('renders an admin-readable projection without mutation controls', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const assetsStore = useAssetsStore()
    await assetsStore.restoreSession({
      getSession: vi.fn(async () => ({
        user: {
          id: '20000000-0000-4000-8000-000000000002',
          workspace_id: '10000000-0000-4000-8000-000000000001',
          role: 'owner',
          email: 'owner@example.com',
          scopes: ['admin:read', 'admin:write'],
        },
      })),
    } as never)

    const wrapper = mount(SystemSettingsView, {
      global: {
        plugins: [pinia],
        stubs: { RouterLink: { template: '<a><slot /></a>' } },
      },
    })
    await flushPromises()

    expect(apiMocks.getAdminSystemSettings).toHaveBeenCalledOnce()
    expect(wrapper.get('h1').text()).toBe('System Settings')
    expect(wrapper.text()).toContain('VoiceAsset Test')
    expect(wrapper.text()).toContain('https://voice.example.test')
    expect(wrapper.text()).toContain('Operator-managed environment')
    expect(wrapper.text()).toContain('Read only')
    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.find('input').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Save settings')
  })
})
