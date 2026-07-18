import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/api/client'
import type { WorkspaceProfile } from '@/api/client'

import { useWorkspaceStore } from '../workspace'
import type { WorkspaceClient } from '../workspace'

const workspace: WorkspaceProfile = {
  id: '10000000-0000-4000-8000-000000000001',
  name: 'Primary',
  version: 3,
  created_at: '2026-07-17T11:00:00Z',
  updated_at: '2026-07-17T12:00:00Z',
}

function createClient(): WorkspaceClient {
  return {
    getAdminWorkspace: vi.fn(async () => workspace),
    updateAdminWorkspace: vi.fn(async (version, input) => ({
      ...workspace,
      name: input.name,
      version: version + 1,
      updated_at: '2026-07-17T13:00:00Z',
    })),
  }
}

describe('workspace store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('loads the authenticated workspace profile', async () => {
    const store = useWorkspaceStore()
    const client = createClient()

    await expect(store.load(client)).resolves.toBe(true)

    expect(client.getAdminWorkspace).toHaveBeenCalledOnce()
    expect(store.profile).toEqual(workspace)
  })

  it('updates using the current profile version', async () => {
    const store = useWorkspaceStore()
    const client = createClient()
    await store.load(client)

    await expect(store.update({ name: 'Renamed' }, client)).resolves.toBe(true)

    expect(client.updateAdminWorkspace).toHaveBeenCalledWith(3, { name: 'Renamed' })
    expect(store.profile).toMatchObject({ name: 'Renamed', version: 4 })
  })

  it('requires a loaded profile and reports safe server errors', async () => {
    const store = useWorkspaceStore()
    const client = createClient()

    await expect(store.update({ name: 'Renamed' }, client)).resolves.toBe(false)
    expect(store.error).toBe('Load the workspace profile before saving changes.')

    vi.mocked(client.getAdminWorkspace).mockRejectedValue(
      new ApiError('Workspace unavailable.', { requestId: 'request-workspace', status: 503 }),
    )
    await expect(store.load(client)).resolves.toBe(false)
    expect(store.profile).toBeNull()
    expect(store.error).toBe('Workspace unavailable. Request ID: request-workspace.')
  })
})
