import { computed, readonly, ref } from 'vue'
import { defineStore } from 'pinia'

import { ApiError, apiClient } from '@/api/client'
import type {
  ApprovalResult,
  CreateGlossarySetRequest,
  GlossarySet,
  GlossarySetList,
  LLMHealth,
  LLMProfile,
  LLMProfileList,
  ReviewDecisionRequest,
  ReviewRecord,
  TranscriptExport,
  TranscriptExportFormat,
  TranscriptRevision,
  TranscriptionJob,
} from '@/api/client'

const DEFAULT_POLL_INTERVAL_MS = 1_000
const DEFAULT_MAX_POLLS = 300

export type CorrectionStage =
  'idle' | 'queueing' | 'correcting' | 'reviewing' | 'approving' | 'approved' | 'failed'

export type ChangeDecision = 'accepted' | 'rejected'

export interface PhaseThreeClient {
  listGlossarySets(): Promise<GlossarySetList>
  createGlossarySet(input: CreateGlossarySetRequest): Promise<GlossarySet>
  listLLMProfiles(): Promise<LLMProfileList>
  createLLMProfile(input: {
    provider_id: 'mock_llm'
    display_name: string
    config: {
      model: string
      timeout: string
      concurrency: number
      temperature: number
      context_limit: number
      structured_output: true
      prompt_template: string
      default_glossary_id?: string
      auto_approval_policy: 'never'
    }
    state: 'enabled'
    priority: number
  }): Promise<LLMProfile>
  checkLLMProfileHealth(profileId: string): Promise<LLMHealth>
  createCorrection(revisionId: string, idempotencyKey: string): Promise<TranscriptionJob>
  getJob(jobId: string): Promise<TranscriptionJob>
  getRevision(revisionId: string): Promise<TranscriptRevision>
  createReview(revisionId: string, input: ReviewDecisionRequest): Promise<ReviewRecord>
  approveRevision(revisionId: string, acceptPending?: boolean): Promise<ApprovalResult>
  createTranscriptExport(
    revisionId: string,
    format: TranscriptExportFormat,
  ): Promise<TranscriptExport>
  transcriptExportUrl(exportId: string): string
}

export interface CorrectionDependencies {
  client?: PhaseThreeClient
  delay?: (milliseconds: number) => Promise<void>
  createId?: () => string
  pollIntervalMs?: number
  maxPolls?: number
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

function randomId(): string {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error('Secure identifier generation is unavailable in this browser context.')
  }
  return globalThis.crypto.randomUUID()
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const request = error.requestId ? ` Request ID: ${error.requestId}.` : ''
    return `${error.message}${request}`
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }
  return 'The operation could not be completed.'
}

export const useCorrectionsStore = defineStore('corrections', () => {
  const profiles = ref<LLMProfile[]>([])
  const glossaries = ref<GlossarySet[]>([])
  const loadingConfiguration = ref(false)
  const configurationError = ref<string | null>(null)
  const operationError = ref<string | null>(null)
  const stage = ref<CorrectionStage>('idle')
  const job = ref<TranscriptionJob | null>(null)
  const proposal = ref<TranscriptRevision | null>(null)
  const approval = ref<ApprovalResult | null>(null)
  const autoApprovedRevision = ref<TranscriptRevision | null>(null)
  const decisions = ref<Record<number, ChangeDecision>>({})
  const health = ref<Record<string, LLMHealth>>({})
  const exportArtifact = ref<TranscriptExport | null>(null)
  const exportDownloadUrl = ref<string | null>(null)
  const exportError = ref<string | null>(null)
  const exporting = ref(false)

  const changes = computed(() => proposal.value?.diff.changes ?? [])
  const approvedRevision = computed(
    () => approval.value?.approved_revision ?? autoApprovedRevision.value,
  )
  const isBusy = computed(
    () => exporting.value || ['queueing', 'correcting', 'approving'].includes(stage.value),
  )

  function clearExport(): void {
    exportArtifact.value = null
    exportDownloadUrl.value = null
  }

  async function loadConfiguration(client: PhaseThreeClient = apiClient): Promise<boolean> {
    loadingConfiguration.value = true
    configurationError.value = null
    try {
      const [profileList, glossaryList] = await Promise.all([
        client.listLLMProfiles(),
        client.listGlossarySets(),
      ])
      profiles.value = profileList.items
      glossaries.value = glossaryList.items
      return true
    } catch (error) {
      configurationError.value = safeErrorMessage(error)
      return false
    } finally {
      loadingConfiguration.value = false
    }
  }

  async function createGlossary(
    input: CreateGlossarySetRequest,
    client: PhaseThreeClient = apiClient,
  ): Promise<boolean> {
    configurationError.value = null
    try {
      const created = await client.createGlossarySet(input)
      glossaries.value = [created, ...glossaries.value.filter((item) => item.id !== created.id)]
      return true
    } catch (error) {
      configurationError.value = safeErrorMessage(error)
      return false
    }
  }

  async function createMockProfile(
    displayName: string,
    defaultGlossaryId?: string,
    client: PhaseThreeClient = apiClient,
  ): Promise<boolean> {
    configurationError.value = null
    try {
      const created = await client.createLLMProfile({
        provider_id: 'mock_llm',
        display_name: displayName,
        state: 'enabled',
        priority: 1,
        config: {
          model: 'deterministic_glossary_v1',
          timeout: '30s',
          concurrency: 32,
          temperature: 0,
          context_limit: 64_000,
          structured_output: true,
          prompt_template: 'correction.v1',
          ...(defaultGlossaryId ? { default_glossary_id: defaultGlossaryId } : {}),
          auto_approval_policy: 'never',
        },
      })
      profiles.value = [created, ...profiles.value.filter((item) => item.id !== created.id)]
      return true
    } catch (error) {
      configurationError.value = safeErrorMessage(error)
      return false
    }
  }

  async function checkProfile(
    profileId: string,
    client: PhaseThreeClient = apiClient,
  ): Promise<boolean> {
    configurationError.value = null
    try {
      const result = await client.checkLLMProfileHealth(profileId)
      health.value = { ...health.value, [profileId]: result }
      return result.status === 'healthy'
    } catch (error) {
      configurationError.value = safeErrorMessage(error)
      return false
    }
  }

  async function runCorrection(
    revisionId: string,
    dependencies: CorrectionDependencies = {},
  ): Promise<boolean> {
    if (isBusy.value) {
      operationError.value = 'Wait for the current correction operation to finish.'
      return false
    }
    const client = dependencies.client ?? apiClient
    const delay = dependencies.delay ?? wait
    const createId = dependencies.createId ?? randomId
    const pollIntervalMs = dependencies.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
    const maxPolls = dependencies.maxPolls ?? DEFAULT_MAX_POLLS
    operationError.value = null
    proposal.value = null
    approval.value = null
    autoApprovedRevision.value = null
    decisions.value = {}
    job.value = null
    exportError.value = null
    clearExport()

    try {
      if (!Number.isSafeInteger(pollIntervalMs) || pollIntervalMs < 0) {
        throw new TypeError('pollIntervalMs must be a non-negative integer.')
      }
      if (!Number.isSafeInteger(maxPolls) || maxPolls < 1) {
        throw new TypeError('maxPolls must be a positive integer.')
      }
      stage.value = 'queueing'
      job.value = await client.createCorrection(revisionId.trim(), createId())
      stage.value = 'correcting'

      let polls = 0
      while (!['succeeded', 'failed', 'cancelled'].includes(job.value.state)) {
        if (polls >= maxPolls) {
          throw new Error('Correction did not finish before the polling limit.')
        }
        await delay(pollIntervalMs)
        job.value = await client.getJob(job.value.id)
        polls += 1
      }
      if (job.value.state !== 'succeeded' || !job.value.result_revision_id) {
        const reason = job.value.last_error_code ? ` (${job.value.last_error_code})` : ''
        throw new Error(`Correction ${job.value.state}${reason}.`)
      }
      const revision = await client.getRevision(job.value.result_revision_id)
      if (revision.kind === 'approved') {
        if (
          revision.review_status !== 'approved' ||
          revision.created_by_type !== 'system' ||
          !revision.parent_revision_id
        ) {
          throw new TypeError('Correction returned an invalid auto-approved revision.')
        }
        autoApprovedRevision.value = revision
        stage.value = 'approved'
        return true
      }
      if (revision.kind !== 'llm_corrected') {
        throw new TypeError(`Correction returned unexpected revision kind: ${revision.kind}.`)
      }
      proposal.value = revision
      stage.value = 'reviewing'
      return true
    } catch (error) {
      operationError.value = safeErrorMessage(error)
      stage.value = 'failed'
      return false
    }
  }

  async function recordDecision(
    input: ReviewDecisionRequest,
    client: PhaseThreeClient = apiClient,
  ): Promise<boolean> {
    if (!proposal.value || stage.value !== 'reviewing') {
      operationError.value = 'Load a correction proposal before recording review decisions.'
      return false
    }
    operationError.value = null
    try {
      await client.createReview(proposal.value.id, input)
      const next = { ...decisions.value }
      if (!('change_index' in input)) {
        const decision = input.action === 'accept_all' ? 'accepted' : 'rejected'
        changes.value.forEach((_change, index) => {
          next[index] = decision
        })
      } else {
        next[input.change_index] = input.action === 'accept_change' ? 'accepted' : 'rejected'
      }
      decisions.value = next
      return true
    } catch (error) {
      operationError.value = safeErrorMessage(error)
      return false
    }
  }

  async function approve(client: PhaseThreeClient = apiClient): Promise<boolean> {
    if (!proposal.value || stage.value !== 'reviewing') {
      operationError.value = 'Load a correction proposal before approval.'
      return false
    }
    operationError.value = null
    stage.value = 'approving'
    try {
      approval.value = await client.approveRevision(proposal.value.id, false)
      stage.value = 'approved'
      return true
    } catch (error) {
      operationError.value = safeErrorMessage(error)
      stage.value = 'reviewing'
      return false
    }
  }

  async function createExport(
    revisionId: string,
    format: TranscriptExportFormat,
    client: PhaseThreeClient = apiClient,
  ): Promise<boolean> {
    const normalizedRevisionId = revisionId.trim()
    if (!normalizedRevisionId) {
      exportError.value = 'Enter an immutable revision ID before exporting.'
      return false
    }
    if (isBusy.value) {
      exportError.value = 'Wait for the current correction operation to finish.'
      return false
    }
    exportError.value = null
    clearExport()
    exporting.value = true
    try {
      const created = await client.createTranscriptExport(normalizedRevisionId, format)
      if (created.revision_id !== normalizedRevisionId || created.format !== format) {
        throw new TypeError('The export response does not match the requested revision and format.')
      }
      exportArtifact.value = created
      exportDownloadUrl.value = client.transcriptExportUrl(created.id)
      return true
    } catch (error) {
      exportError.value = safeErrorMessage(error)
      return false
    } finally {
      exporting.value = false
    }
  }

  function resetCorrection(): void {
    if (isBusy.value) {
      throw new Error('Wait for the current correction operation to finish.')
    }
    operationError.value = null
    stage.value = 'idle'
    job.value = null
    proposal.value = null
    approval.value = null
    autoApprovedRevision.value = null
    decisions.value = {}
    exportError.value = null
    clearExport()
  }

  return {
    approval: readonly(approval),
    approvedRevision,
    autoApprovedRevision: readonly(autoApprovedRevision),
    approve,
    changes,
    checkProfile,
    configurationError: readonly(configurationError),
    createGlossary,
    createMockProfile,
    createExport,
    decisions: readonly(decisions),
    exportArtifact: readonly(exportArtifact),
    exportDownloadUrl: readonly(exportDownloadUrl),
    exportError: readonly(exportError),
    exporting: readonly(exporting),
    glossaries: readonly(glossaries),
    health: readonly(health),
    isBusy,
    job: readonly(job),
    loadConfiguration,
    loadingConfiguration: readonly(loadingConfiguration),
    operationError: readonly(operationError),
    profiles: readonly(profiles),
    proposal: readonly(proposal),
    recordDecision,
    resetCorrection,
    runCorrection,
    stage: readonly(stage),
  }
})
