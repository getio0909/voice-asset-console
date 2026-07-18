import { computed, readonly, ref } from 'vue'
import { defineStore } from 'pinia'

import { ApiError, apiClient } from '@/api/client'
import type {
  DeploymentSystemSettings,
  ListOperationsAuditOptions,
  ListOperationsJobsOptions,
  OperationsAuditActorType,
  OperationsAuditEntry,
  OperationsAuditList,
  OperationsJob,
  OperationsJobList,
  OperationsJobState,
  OperationsSystemStatus,
} from '@/api/client'

export interface OperationsClient {
  listAdminJobs(options?: ListOperationsJobsOptions): Promise<OperationsJobList>
  listAdminAuditLogs(options?: ListOperationsAuditOptions): Promise<OperationsAuditList>
  getAdminSystemStatus(): Promise<OperationsSystemStatus>
  getAdminSystemSettings(): Promise<DeploymentSystemSettings>
}

export interface OperationsJobFilters {
  state?: OperationsJobState
  kind?: string
}

export interface OperationsAuditFilters {
  actorType?: OperationsAuditActorType
  action?: string
  targetType?: string
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const request = error.requestId ? ` Request ID: ${error.requestId}.` : ''
    return `${error.message}${request}`
  }
  if (error instanceof Error && error.message.trim()) return error.message
  return 'The operation could not be completed.'
}

export const useOperationsStore = defineStore('operations', () => {
  const status = ref<OperationsSystemStatus | null>(null)
  const settings = ref<DeploymentSystemSettings | null>(null)
  const jobs = ref<OperationsJob[]>([])
  const auditEntries = ref<OperationsAuditEntry[]>([])
  const jobNextCursor = ref<string | null>(null)
  const auditNextCursor = ref<string | null>(null)
  const jobStateFilter = ref<OperationsJobState | ''>('')
  const jobKindFilter = ref('')
  const auditActorFilter = ref<OperationsAuditActorType | ''>('')
  const auditActionFilter = ref('')
  const auditTargetFilter = ref('')
  const loadingStatus = ref(false)
  const loadingSettings = ref(false)
  const loadingJobs = ref(false)
  const loadingMoreJobs = ref(false)
  const loadingAudit = ref(false)
  const loadingMoreAudit = ref(false)
  const statusError = ref<string | null>(null)
  const settingsError = ref<string | null>(null)
  const jobsError = ref<string | null>(null)
  const auditError = ref<string | null>(null)

  const jobsBusy = computed(() => loadingJobs.value || loadingMoreJobs.value)
  const auditBusy = computed(() => loadingAudit.value || loadingMoreAudit.value)
  const isBusy = computed(
    () => loadingStatus.value || loadingSettings.value || jobsBusy.value || auditBusy.value,
  )

  function setJobFilters(filters: OperationsJobFilters): boolean {
    if (jobsBusy.value) {
      jobsError.value = 'Wait for the current job request to finish.'
      return false
    }
    jobStateFilter.value = filters.state ?? ''
    jobKindFilter.value = filters.kind?.trim() ?? ''
    jobs.value = []
    jobNextCursor.value = null
    jobsError.value = null
    return true
  }

  function setAuditFilters(filters: OperationsAuditFilters): boolean {
    if (auditBusy.value) {
      auditError.value = 'Wait for the current audit request to finish.'
      return false
    }
    auditActorFilter.value = filters.actorType ?? ''
    auditActionFilter.value = filters.action?.trim() ?? ''
    auditTargetFilter.value = filters.targetType?.trim() ?? ''
    auditEntries.value = []
    auditNextCursor.value = null
    auditError.value = null
    return true
  }

  function jobOptions(cursor?: string): ListOperationsJobsOptions {
    return {
      limit: 50,
      ...(cursor ? { cursor } : {}),
      ...(jobStateFilter.value ? { state: jobStateFilter.value } : {}),
      ...(jobKindFilter.value ? { kind: jobKindFilter.value } : {}),
    }
  }

  function auditOptions(cursor?: string): ListOperationsAuditOptions {
    return {
      limit: 50,
      ...(cursor ? { cursor } : {}),
      ...(auditActorFilter.value ? { actorType: auditActorFilter.value } : {}),
      ...(auditActionFilter.value ? { action: auditActionFilter.value } : {}),
      ...(auditTargetFilter.value ? { targetType: auditTargetFilter.value } : {}),
    }
  }

  async function loadStatus(client: OperationsClient = apiClient): Promise<boolean> {
    if (loadingStatus.value) {
      statusError.value = 'Wait for the current system-status request to finish.'
      return false
    }
    loadingStatus.value = true
    statusError.value = null
    try {
      status.value = await client.getAdminSystemStatus()
      return true
    } catch (error) {
      statusError.value = safeErrorMessage(error)
      return false
    } finally {
      loadingStatus.value = false
    }
  }

  async function loadSettings(client: OperationsClient = apiClient): Promise<boolean> {
    if (loadingSettings.value) {
      settingsError.value = 'Wait for the current system-settings request to finish.'
      return false
    }
    loadingSettings.value = true
    settingsError.value = null
    try {
      settings.value = await client.getAdminSystemSettings()
      return true
    } catch (error) {
      settingsError.value = safeErrorMessage(error)
      return false
    } finally {
      loadingSettings.value = false
    }
  }

  async function loadJobs(client: OperationsClient = apiClient): Promise<boolean> {
    if (jobsBusy.value) {
      jobsError.value = 'Wait for the current job request to finish.'
      return false
    }
    loadingJobs.value = true
    jobsError.value = null
    try {
      const result = await client.listAdminJobs(jobOptions())
      jobs.value = result.items
      jobNextCursor.value = result.next_cursor ?? null
      return true
    } catch (error) {
      jobsError.value = safeErrorMessage(error)
      return false
    } finally {
      loadingJobs.value = false
    }
  }

  async function loadMoreJobs(client: OperationsClient = apiClient): Promise<boolean> {
    const cursor = jobNextCursor.value
    if (!cursor || jobsBusy.value) return false
    loadingMoreJobs.value = true
    jobsError.value = null
    try {
      const result = await client.listAdminJobs(jobOptions(cursor))
      jobs.value = [...jobs.value, ...result.items]
      jobNextCursor.value = result.next_cursor ?? null
      return true
    } catch (error) {
      jobsError.value = safeErrorMessage(error)
      return false
    } finally {
      loadingMoreJobs.value = false
    }
  }

  async function loadAuditLogs(client: OperationsClient = apiClient): Promise<boolean> {
    if (auditBusy.value) {
      auditError.value = 'Wait for the current audit request to finish.'
      return false
    }
    loadingAudit.value = true
    auditError.value = null
    try {
      const result = await client.listAdminAuditLogs(auditOptions())
      auditEntries.value = result.items
      auditNextCursor.value = result.next_cursor ?? null
      return true
    } catch (error) {
      auditError.value = safeErrorMessage(error)
      return false
    } finally {
      loadingAudit.value = false
    }
  }

  async function loadMoreAuditLogs(client: OperationsClient = apiClient): Promise<boolean> {
    const cursor = auditNextCursor.value
    if (!cursor || auditBusy.value) return false
    loadingMoreAudit.value = true
    auditError.value = null
    try {
      const result = await client.listAdminAuditLogs(auditOptions(cursor))
      auditEntries.value = [...auditEntries.value, ...result.items]
      auditNextCursor.value = result.next_cursor ?? null
      return true
    } catch (error) {
      auditError.value = safeErrorMessage(error)
      return false
    } finally {
      loadingMoreAudit.value = false
    }
  }

  function reset(): void {
    status.value = null
    settings.value = null
    jobs.value = []
    auditEntries.value = []
    jobNextCursor.value = null
    auditNextCursor.value = null
    jobStateFilter.value = ''
    jobKindFilter.value = ''
    auditActorFilter.value = ''
    auditActionFilter.value = ''
    auditTargetFilter.value = ''
    loadingStatus.value = false
    loadingSettings.value = false
    loadingJobs.value = false
    loadingMoreJobs.value = false
    loadingAudit.value = false
    loadingMoreAudit.value = false
    statusError.value = null
    settingsError.value = null
    jobsError.value = null
    auditError.value = null
  }

  return {
    auditActionFilter: readonly(auditActionFilter),
    auditActorFilter: readonly(auditActorFilter),
    auditBusy,
    auditEntries: readonly(auditEntries),
    auditError: readonly(auditError),
    auditNextCursor: readonly(auditNextCursor),
    auditTargetFilter: readonly(auditTargetFilter),
    isBusy,
    jobKindFilter: readonly(jobKindFilter),
    jobNextCursor: readonly(jobNextCursor),
    jobs: readonly(jobs),
    jobsBusy,
    jobsError: readonly(jobsError),
    jobStateFilter: readonly(jobStateFilter),
    loadAuditLogs,
    loadJobs,
    loadMoreAuditLogs,
    loadMoreJobs,
    loadSettings,
    loadStatus,
    loadingAudit: readonly(loadingAudit),
    loadingJobs: readonly(loadingJobs),
    loadingMoreAudit: readonly(loadingMoreAudit),
    loadingMoreJobs: readonly(loadingMoreJobs),
    loadingStatus: readonly(loadingStatus),
    loadingSettings: readonly(loadingSettings),
    reset,
    setAuditFilters,
    setJobFilters,
    status: readonly(status),
    statusError: readonly(statusError),
    settings: readonly(settings),
    settingsError: readonly(settingsError),
  }
})
