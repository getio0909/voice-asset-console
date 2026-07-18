import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/api/client'

import { useAccountStore } from '../account'
import type { AccountClient } from '../account'

function createClient(): AccountClient {
  return { changePassword: vi.fn(async () => undefined) }
}

describe('account store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('changes the password without retaining the input in store state', async () => {
    const store = useAccountStore()
    const client = createClient()
    const input = { current_password: 'current-password', new_password: 'new-password-456' }

    await expect(store.changePassword(input, client)).resolves.toBe(true)

    expect(client.changePassword).toHaveBeenCalledWith(input)
    expect(store.changing).toBe(false)
    expect(store.error).toBeNull()
    expect(Object.keys(store)).not.toContain('input')
  })

  it('reports a safe structured API error and supports immediate retry', async () => {
    const store = useAccountStore()
    const client = createClient()
    vi.mocked(client.changePassword)
      .mockRejectedValueOnce(
        new ApiError('Current password is incorrect.', {
          status: 401,
          code: 'invalid_credentials',
          requestId: 'request-password',
        }),
      )
      .mockResolvedValueOnce(undefined)

    await expect(
      store.changePassword(
        { current_password: 'wrong-password', new_password: 'new-password-456' },
        client,
      ),
    ).resolves.toBe(false)
    expect(store.error).toBe('Current password is incorrect. Request ID: request-password.')
    expect(store.changing).toBe(false)

    await expect(
      store.changePassword(
        { current_password: 'current-password', new_password: 'new-password-456' },
        client,
      ),
    ).resolves.toBe(true)
    expect(store.error).toBeNull()
  })
})
