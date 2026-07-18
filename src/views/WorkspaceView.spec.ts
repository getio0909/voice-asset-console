import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { WorkspaceProfile } from '@/api/client'
import { useAssetsStore } from '@/stores/assets'

import WorkspaceView from './WorkspaceView.vue'

const apiMocks = vi.hoisted(() => ({
  getAdminWorkspace: vi.fn(),
  updateAdminWorkspace: vi.fn(),
}))

vi.mock('@/api/client', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...(actual as object), apiClient: apiMocks }
})

const workspace: WorkspaceProfile = {
  id: '10000000-0000-4000-8000-000000000001',
  name: 'Primary',
  version: 3,
  created_at: '2026-07-17T12:00:00Z',
  updated_at: '2026-07-17T12:00:00Z',
}

describe('WorkspaceView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMocks.getAdminWorkspace.mockResolvedValue(workspace)
    apiMocks.updateAdminWorkspace.mockResolvedValue({ ...workspace, name: 'Renamed', version: 4 })
  })

  it('loads and conditionally updates the workspace for an Owner', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const assetsStore = useAssetsStore()
    await assetsStore.restoreSession({
      getSession: vi.fn(async () => ({
        user: {
          id: '20000000-0000-4000-8000-000000000002',
          workspace_id: workspace.id,
          role: 'owner',
          email: 'owner@example.com',
          scopes: ['admin:read', 'admin:write'],
        },
      })),
    } as never)
    const wrapper = mount(WorkspaceView, {
      global: {
        plugins: [pinia],
        stubs: { RouterLink: { template: '<a><slot /></a>' } },
      },
    })
    await flushPromises()

    expect(apiMocks.getAdminWorkspace).toHaveBeenCalledOnce()
    const input = wrapper.get<HTMLInputElement>('input[autocomplete="organization"]')
    expect(input.element.value).toBe('Primary')
    await input.setValue('Renamed')
    await wrapper.get('form.workspace-profile-form').trigger('submit')
    await flushPromises()

    expect(apiMocks.updateAdminWorkspace).toHaveBeenCalledWith(3, { name: 'Renamed' })
    expect(wrapper.text()).toContain('Workspace version is now 4.')
    expect(wrapper.text()).toContain('Version 4')
  })
})
