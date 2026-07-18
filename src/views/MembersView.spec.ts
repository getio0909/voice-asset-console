import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Member } from '@/api/client'
import { useAssetsStore } from '@/stores/assets'
import { useMembersStore } from '@/stores/members'

import MembersView from './MembersView.vue'

const apiMocks = vi.hoisted(() => ({
  createAdminMember: vi.fn(),
  listAdminMembers: vi.fn(),
  updateAdminMember: vi.fn(),
}))

vi.mock('@/api/client', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...(actual as object), apiClient: apiMocks }
})

const member: Member = {
  id: '30000000-0000-4000-8000-000000000001',
  workspace_id: '10000000-0000-4000-8000-000000000001',
  email: 'member@example.com',
  role: 'viewer',
  status: 'active',
  version: 1,
  created_at: '2026-07-17T12:00:00Z',
  updated_at: '2026-07-17T12:00:00Z',
}

describe('MembersView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiMocks.listAdminMembers.mockResolvedValue({ items: [member] })
    apiMocks.createAdminMember.mockResolvedValue(member)
  })

  it('clears the plaintext password as soon as Owner creation starts', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const assetsStore = useAssetsStore()
    await assetsStore.restoreSession({
      getSession: vi.fn(async () => ({
        user: {
          id: '20000000-0000-4000-8000-000000000002',
          workspace_id: member.workspace_id,
          role: 'owner',
          email: 'owner@example.com',
          scopes: ['admin:read', 'admin:write'],
        },
      })),
    } as never)
    const wrapper = mount(MembersView, {
      global: {
        plugins: [pinia],
        stubs: { RouterLink: { template: '<a><slot /></a>' } },
      },
    })
    await flushPromises()

    const email = wrapper.get<HTMLInputElement>('input[type="email"]')
    const password = wrapper.get<HTMLInputElement>('input[autocomplete="new-password"]')
    await email.setValue('new@example.com')
    await password.setValue('long-test-password')
    await wrapper.get('form.form-stack').trigger('submit')

    expect(password.element.value).toBe('')
    await flushPromises()
    expect(apiMocks.createAdminMember).toHaveBeenCalledWith({
      email: 'new@example.com',
      password: 'long-test-password',
      role: 'viewer',
    })
    expect(JSON.stringify(useMembersStore().items)).not.toContain('long-test-password')
    expect(wrapper.text()).toContain('The plaintext password was cleared from this page.')
  })
})
