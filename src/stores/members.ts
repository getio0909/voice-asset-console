import { computed, readonly, ref } from 'vue'
import { defineStore } from 'pinia'

import { ApiError, apiClient } from '@/api/client'
import type {
  CreateMemberRequest,
  ListMembersOptions,
  Member,
  MemberList,
  MemberRole,
  MemberStatus,
  UpdateMemberRequest,
} from '@/api/client'

export interface MembersClient {
  listAdminMembers(options?: ListMembersOptions): Promise<MemberList>
  createAdminMember(input: CreateMemberRequest): Promise<Member>
  updateAdminMember(memberId: string, version: number, input: UpdateMemberRequest): Promise<Member>
}

export interface MemberFilters {
  role?: MemberRole
  status?: MemberStatus
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const request = error.requestId ? ` Request ID: ${error.requestId}.` : ''
    return `${error.message}${request}`
  }
  if (error instanceof Error && error.message.trim()) return error.message
  return 'The membership operation could not be completed.'
}

function newestFirst(items: Member[]): Member[] {
  const unique = new Map(items.map((item) => [item.id, item]))
  return [...unique.values()].sort(
    (left, right) =>
      right.updated_at.localeCompare(left.updated_at) || right.id.localeCompare(left.id),
  )
}

export const useMembersStore = defineStore('members', () => {
  const items = ref<Member[]>([])
  const nextCursor = ref<string | null>(null)
  const roleFilter = ref<MemberRole | ''>('')
  const statusFilter = ref<MemberStatus | ''>('')
  const loading = ref(false)
  const loadingMore = ref(false)
  const mutating = ref(false)
  const error = ref<string | null>(null)

  const isBusy = computed(() => loading.value || loadingMore.value || mutating.value)

  function setFilters(filters: MemberFilters): boolean {
    if (isBusy.value) {
      error.value = 'Wait for the current membership operation to finish.'
      return false
    }
    roleFilter.value = filters.role ?? ''
    statusFilter.value = filters.status ?? ''
    items.value = []
    nextCursor.value = null
    error.value = null
    return true
  }

  function listOptions(cursor?: string): ListMembersOptions {
    return {
      limit: 50,
      ...(cursor ? { cursor } : {}),
      ...(roleFilter.value ? { role: roleFilter.value } : {}),
      ...(statusFilter.value ? { status: statusFilter.value } : {}),
    }
  }

  async function load(client: MembersClient = apiClient): Promise<boolean> {
    if (isBusy.value) {
      error.value = 'Wait for the current membership operation to finish.'
      return false
    }
    loading.value = true
    error.value = null
    try {
      const result = await client.listAdminMembers(listOptions())
      items.value = newestFirst(result.items)
      nextCursor.value = result.next_cursor ?? null
      return true
    } catch (cause) {
      error.value = safeErrorMessage(cause)
      return false
    } finally {
      loading.value = false
    }
  }

  async function loadMore(client: MembersClient = apiClient): Promise<boolean> {
    const cursor = nextCursor.value
    if (!cursor || isBusy.value) return false
    loadingMore.value = true
    error.value = null
    try {
      const result = await client.listAdminMembers(listOptions(cursor))
      items.value = newestFirst([...items.value, ...result.items])
      nextCursor.value = result.next_cursor ?? null
      return true
    } catch (cause) {
      error.value = safeErrorMessage(cause)
      return false
    } finally {
      loadingMore.value = false
    }
  }

  async function create(
    input: CreateMemberRequest,
    client: MembersClient = apiClient,
  ): Promise<boolean> {
    if (isBusy.value) {
      error.value = 'Wait for the current membership operation to finish.'
      return false
    }
    mutating.value = true
    error.value = null
    try {
      const created = await client.createAdminMember(input)
      items.value = newestFirst([created, ...items.value])
      return true
    } catch (cause) {
      error.value = safeErrorMessage(cause)
      return false
    } finally {
      mutating.value = false
    }
  }

  async function update(
    memberId: string,
    version: number,
    input: UpdateMemberRequest,
    client: MembersClient = apiClient,
  ): Promise<boolean> {
    if (isBusy.value) {
      error.value = 'Wait for the current membership operation to finish.'
      return false
    }
    mutating.value = true
    error.value = null
    try {
      const updated = await client.updateAdminMember(memberId, version, input)
      items.value = newestFirst([updated, ...items.value.filter((item) => item.id !== updated.id)])
      return true
    } catch (cause) {
      error.value = safeErrorMessage(cause)
      return false
    } finally {
      mutating.value = false
    }
  }

  function reset(): void {
    items.value = []
    nextCursor.value = null
    roleFilter.value = ''
    statusFilter.value = ''
    loading.value = false
    loadingMore.value = false
    mutating.value = false
    error.value = null
  }

  return {
    create,
    error: readonly(error),
    isBusy,
    items: readonly(items),
    load,
    loading: readonly(loading),
    loadingMore: readonly(loadingMore),
    loadMore,
    mutating: readonly(mutating),
    nextCursor: readonly(nextCursor),
    reset,
    roleFilter: readonly(roleFilter),
    setFilters,
    statusFilter: readonly(statusFilter),
    update,
  }
})
