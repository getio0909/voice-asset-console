import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { PairingSession } from '@/api/client'
import { useAssetsStore } from '@/stores/assets'
import { useSessionsStore } from '@/stores/sessions'

import SessionsView from './SessionsView.vue'

const apiMocks = vi.hoisted(() => ({
  createPairingSession: vi.fn(),
  listDeviceSessions: vi.fn(),
  revokeDeviceSession: vi.fn(),
}))
const qrMocks = vi.hoisted(() => ({ toCanvas: vi.fn() }))

vi.mock('@/api/client', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...(actual as object), apiClient: apiMocks }
})
vi.mock('qrcode', () => ({ default: qrMocks }))

let pairing: PairingSession

describe('SessionsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    pairing = {
      id: '30000000-0000-4000-8000-000000000003',
      expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      payload: 'voiceasset://pair?secret=one-time-payload',
    }
    apiMocks.listDeviceSessions.mockResolvedValue({ items: [] })
    apiMocks.createPairingSession.mockResolvedValue(pairing)
    apiMocks.revokeDeviceSession.mockResolvedValue(undefined)
    qrMocks.toCanvas.mockResolvedValue(undefined)
  })

  it('masks, copies, clears, and discards the one-time pairing payload on unmount', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const assetsStore = useAssetsStore()
    await assetsStore.restoreSession({
      getSession: vi.fn(async () => ({
        user: {
          id: '10000000-0000-4000-8000-000000000001',
          workspace_id: '20000000-0000-4000-8000-000000000002',
          role: 'owner',
          email: 'owner@example.com',
          scopes: ['assets:read'],
        },
      })),
    } as never)
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
    })
    await router.push('/sessions')
    await router.isReady()
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    const wrapper = mount(SessionsView, { global: { plugins: [pinia, router] } })
    await flushPromises()
    await wrapper.get('[data-testid="create-pairing"]').trigger('click')
    await flushPromises()

    const input = wrapper.get<HTMLInputElement>('[data-testid="pairing-payload"]')
    expect(input.attributes('type')).toBe('password')
    expect(input.element.value).toBe(pairing.payload)
    expect(wrapper.get('[data-testid="pairing-qr"]').attributes('aria-label')).toContain('QR')
    expect(qrMocks.toCanvas).toHaveBeenCalled()

    await wrapper.get('[data-testid="toggle-pairing"]').trigger('click')
    expect(input.attributes('type')).toBe('text')
    await wrapper.get('[data-testid="copy-pairing"]').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith(pairing.payload)

    await wrapper.get('[data-testid="clear-pairing"]').trigger('click')
    expect(useSessionsStore().pairingSession).toBeNull()

    await wrapper.get('[data-testid="create-pairing"]').trigger('click')
    await flushPromises()
    wrapper.unmount()
    expect(useSessionsStore().pairingSession).toBeNull()
  })
})
