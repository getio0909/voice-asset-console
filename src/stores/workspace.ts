import { computed, readonly, ref } from 'vue'
import { defineStore } from 'pinia'

import { ApiError, apiClient } from '@/api/client'
import type { UpdateWorkspaceRequest, WorkspaceProfile } from '@/api/client'

export interface WorkspaceClient {
  getAdminWorkspace(): Promise<WorkspaceProfile>
  updateAdminWorkspace(version: number, input: UpdateWorkspaceRequest): Promise<WorkspaceProfile>
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const request = error.requestId ? ` Request ID: ${error.requestId}.` : ''
    return `${error.message}${request}`
  }
  if (error instanceof Error && error.message.trim()) return error.message
  return 'The workspace operation could not be completed.'
}

export const useWorkspaceStore = defineStore('workspace', () => {
  const profile = ref<WorkspaceProfile | null>(null)
  const loading = ref(false)
  const saving = ref(false)
  const error = ref<string | null>(null)

  const isBusy = computed(() => loading.value || saving.value)

  async function load(client: WorkspaceClient = apiClient): Promise<boolean> {
    if (isBusy.value) {
      error.value = 'Wait for the current workspace operation to finish.'
      return false
    }
    loading.value = true
    error.value = null
    try {
      profile.value = await client.getAdminWorkspace()
      return true
    } catch (cause) {
      error.value = safeErrorMessage(cause)
      return false
    } finally {
      loading.value = false
    }
  }

  async function update(
    input: UpdateWorkspaceRequest,
    client: WorkspaceClient = apiClient,
  ): Promise<boolean> {
    if (isBusy.value) {
      error.value = 'Wait for the current workspace operation to finish.'
      return false
    }
    if (!profile.value) {
      error.value = 'Load the workspace profile before saving changes.'
      return false
    }
    saving.value = true
    error.value = null
    try {
      profile.value = await client.updateAdminWorkspace(profile.value.version, input)
      return true
    } catch (cause) {
      error.value = safeErrorMessage(cause)
      return false
    } finally {
      saving.value = false
    }
  }

  function reset(): void {
    profile.value = null
    loading.value = false
    saving.value = false
    error.value = null
  }

  return {
    error: readonly(error),
    isBusy,
    load,
    loading: readonly(loading),
    profile: readonly(profile),
    reset,
    saving: readonly(saving),
    update,
  }
})
