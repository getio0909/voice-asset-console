import { readonly, ref } from 'vue'
import { defineStore } from 'pinia'

import { ApiError, apiClient } from '@/api/client'
import type { ChangePasswordRequest } from '@/api/client'

export interface AccountClient {
  changePassword(input: ChangePasswordRequest): Promise<void>
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const request = error.requestId ? ` Request ID: ${error.requestId}.` : ''
    return `${error.message}${request}`
  }
  if (error instanceof Error && error.message.trim()) return error.message
  return 'The password change could not be completed.'
}

export const useAccountStore = defineStore('account', () => {
  const changing = ref(false)
  const error = ref<string | null>(null)

  async function changePassword(
    input: ChangePasswordRequest,
    client: AccountClient = apiClient,
  ): Promise<boolean> {
    if (changing.value) {
      error.value = 'Wait for the current password change to finish.'
      return false
    }
    changing.value = true
    error.value = null
    try {
      await client.changePassword(input)
      return true
    } catch (cause) {
      error.value = safeErrorMessage(cause)
      return false
    } finally {
      changing.value = false
    }
  }

  function setValidationError(message: string): void {
    error.value = message
  }

  function reset(): void {
    changing.value = false
    error.value = null
  }

  return {
    changePassword,
    changing: readonly(changing),
    error: readonly(error),
    reset,
    setValidationError,
  }
})
