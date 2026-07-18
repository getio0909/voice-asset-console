import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/api/client'
import type { Member } from '@/api/client'

import { useMembersStore } from '../members'
import type { MembersClient } from '../members'

const firstMemberId = '30000000-0000-4000-8000-000000000001'
const secondMemberId = '40000000-0000-4000-8000-000000000002'

function member(id: string, updatedAt = '2026-07-17T12:00:00Z'): Member {
  return {
    id,
    workspace_id: '10000000-0000-4000-8000-000000000001',
    email: `${id.slice(0, 4)}@example.com`,
    role: 'viewer',
    status: 'active',
    version: 1,
    created_at: '2026-07-17T11:00:00Z',
    updated_at: updatedAt,
  }
}

function createClient(): MembersClient {
  return {
    listAdminMembers: vi
      .fn()
      .mockResolvedValueOnce({ items: [member(firstMemberId)], next_cursor: 'next-members' })
      .mockResolvedValueOnce({ items: [member(secondMemberId, '2026-07-17T10:00:00Z')] }),
    createAdminMember: vi.fn(async (input) => ({
      ...member(secondMemberId, '2026-07-17T13:00:00Z'),
      email: input.email,
      role: input.role,
    })),
    updateAdminMember: vi.fn(async (id, version, input) => ({
      ...member(id, '2026-07-17T14:00:00Z'),
      version: version + 1,
      ...input,
    })),
  }
}

describe('members store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('binds role and status filters to every cursor page', async () => {
    const store = useMembersStore()
    const client = createClient()

    expect(store.setFilters({ role: 'viewer', status: 'active' })).toBe(true)
    await expect(store.load(client)).resolves.toBe(true)
    await expect(store.loadMore(client)).resolves.toBe(true)

    expect(store.items.map((item) => item.id)).toEqual([firstMemberId, secondMemberId])
    expect(store.nextCursor).toBeNull()
    expect(client.listAdminMembers).toHaveBeenNthCalledWith(1, {
      limit: 50,
      role: 'viewer',
      status: 'active',
    })
    expect(client.listAdminMembers).toHaveBeenNthCalledWith(2, {
      limit: 50,
      cursor: 'next-members',
      role: 'viewer',
      status: 'active',
    })
  })

  it('creates a member without retaining its plaintext password', async () => {
    const store = useMembersStore()
    const client = createClient()
    const input = {
      email: 'new@example.com',
      password: 'long-test-password',
      role: 'editor' as const,
    }

    await expect(store.create(input, client)).resolves.toBe(true)

    expect(client.createAdminMember).toHaveBeenCalledWith(input)
    expect(store.items[0]).toMatchObject({ email: 'new@example.com', role: 'editor' })
    expect(JSON.stringify(store.items)).not.toContain('long-test-password')
  })

  it('uses the current version and replaces the updated member', async () => {
    const store = useMembersStore()
    const client = createClient()
    await store.load(client)

    await expect(
      store.update(firstMemberId, 1, { role: 'admin', status: 'disabled' }, client),
    ).resolves.toBe(true)

    expect(client.updateAdminMember).toHaveBeenCalledWith(firstMemberId, 1, {
      role: 'admin',
      status: 'disabled',
    })
    expect(store.items[0]).toMatchObject({
      id: firstMemberId,
      role: 'admin',
      status: 'disabled',
      version: 2,
    })
  })

  it('keeps server failures safe and includes the request identifier', async () => {
    const store = useMembersStore()
    const client = createClient()
    vi.mocked(client.listAdminMembers).mockReset()
    vi.mocked(client.listAdminMembers).mockRejectedValue(
      new ApiError('Membership unavailable.', { requestId: 'request-members', status: 503 }),
    )

    await expect(store.load(client)).resolves.toBe(false)

    expect(store.items).toEqual([])
    expect(store.error).toBe('Membership unavailable. Request ID: request-members.')
  })
})
