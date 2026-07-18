import { computed, readonly, ref } from 'vue'
import { defineStore } from 'pinia'

import { ApiError, apiClient } from '@/api/client'
import type {
  Asset,
  CreateAssetRequest,
  CreateUploadRequest,
  CurrentSession,
  Principal,
  TranscriptList,
  TranscriptRevision,
  TranscriptionJob,
  UploadPart,
  UploadSession,
  WebSession,
} from '@/api/client'
import { sha256Hex } from '@/utils/sha256'

const MIN_WAV_SIZE = 44
const MAX_WAV_SIZE = 536_870_912
const MAX_PART_SIZE = 5_242_880
const DEFAULT_POLL_INTERVAL_MS = 1_000
const DEFAULT_MAX_POLLS = 300

export type SessionStatus = 'checking' | 'anonymous' | 'authenticated'

export type WorkflowStage =
  | 'idle'
  | 'hashing'
  | 'creating-asset'
  | 'creating-upload'
  | 'uploading'
  | 'completing-upload'
  | 'queuing-transcription'
  | 'transcribing'
  | 'reading-transcript'
  | 'ready'
  | 'failed'

export interface PhaseOneClient {
  login(email: string, password: string, deviceName?: string): Promise<WebSession>
  getSession(): Promise<CurrentSession>
  refreshSession(): Promise<WebSession>
  logout(): Promise<void>
  createAsset(input: CreateAssetRequest, idempotencyKey: string): Promise<Asset>
  createUpload(input: CreateUploadRequest, idempotencyKey: string): Promise<UploadSession>
  putUploadPart(
    uploadId: string,
    partNumber: number,
    body: Blob | ArrayBuffer,
    partSha256: string,
  ): Promise<UploadPart>
  completeUpload(uploadId: string): Promise<UploadSession>
  createTranscription(assetId: string, idempotencyKey: string): Promise<TranscriptionJob>
  getJob(jobId: string): Promise<TranscriptionJob>
  listTranscripts(assetId: string): Promise<TranscriptList>
  getRevision(revisionId: string): Promise<TranscriptRevision>
  audioUrl(assetId: string): string
}

export interface ProcessAssetInput {
  title: string
  language: string
  file: File
}

export interface WorkflowDependencies {
  client?: PhaseOneClient
  hash?: (value: Blob | ArrayBuffer) => Promise<string>
  delay?: (milliseconds: number) => Promise<void>
  createId?: () => string
  pollIntervalMs?: number
  maxPolls?: number
}

class WorkflowCancelledError extends Error {}

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

function validateFile(file: File): void {
  if (!file.name.toLowerCase().endsWith('.wav')) {
    throw new TypeError('Select a .wav audio file.')
  }
  if (file.size < MIN_WAV_SIZE || file.size > MAX_WAV_SIZE) {
    throw new TypeError(`WAV files must contain between ${MIN_WAV_SIZE} and ${MAX_WAV_SIZE} bytes.`)
  }
}

const stageLabels: Readonly<Record<WorkflowStage, string>> = Object.freeze({
  idle: 'Ready for a WAV file',
  hashing: 'Verifying local file',
  'creating-asset': 'Creating voice asset',
  'creating-upload': 'Opening resumable upload',
  uploading: 'Uploading verified parts',
  'completing-upload': 'Completing upload',
  'queuing-transcription': 'Queuing Mock ASR',
  transcribing: 'Running Mock ASR',
  'reading-transcript': 'Loading immutable transcript',
  ready: 'Transcript ready',
  failed: 'Workflow stopped',
})

export const useAssetsStore = defineStore('assets', () => {
  const sessionStatus = ref<SessionStatus>('checking')
  const user = ref<Principal | null>(null)
  const sessionError = ref<string | null>(null)
  const stage = ref<WorkflowStage>('idle')
  const workflowError = ref<string | null>(null)
  const asset = ref<Asset | null>(null)
  const upload = ref<UploadSession | null>(null)
  const job = ref<TranscriptionJob | null>(null)
  const revision = ref<TranscriptRevision | null>(null)
  const audioSource = ref<string | null>(null)
  const uploadedBytes = ref(0)
  const totalBytes = ref(0)
  const uploadedParts = ref(0)
  const totalParts = ref(0)
  let operationEpoch = 0

  const isAuthenticated = computed(() => sessionStatus.value === 'authenticated')
  const isBusy = computed(() =>
    [
      'hashing',
      'creating-asset',
      'creating-upload',
      'uploading',
      'completing-upload',
      'queuing-transcription',
      'transcribing',
      'reading-transcript',
    ].includes(stage.value),
  )
  const progressPercent = computed(() =>
    totalBytes.value > 0 ? Math.round((uploadedBytes.value / totalBytes.value) * 100) : 0,
  )
  const stageLabel = computed(() => stageLabels[stage.value])

  function clearWorkflow(): void {
    stage.value = 'idle'
    workflowError.value = null
    asset.value = null
    upload.value = null
    job.value = null
    revision.value = null
    audioSource.value = null
    uploadedBytes.value = 0
    totalBytes.value = 0
    uploadedParts.value = 0
    totalParts.value = 0
  }

  function ensureCurrent(epoch: number): void {
    if (epoch !== operationEpoch) {
      throw new WorkflowCancelledError('The local workflow was cancelled.')
    }
  }

  async function restoreSession(client: PhaseOneClient = apiClient): Promise<boolean> {
    sessionStatus.value = 'checking'
    sessionError.value = null
    try {
      const session = await client.getSession()
      user.value = session.user
      sessionStatus.value = 'authenticated'
      return true
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        try {
          const session = await client.refreshSession()
          user.value = session.user
          sessionStatus.value = 'authenticated'
          return true
        } catch (refreshError) {
          user.value = null
          sessionStatus.value = 'anonymous'
          if (!(refreshError instanceof ApiError && refreshError.status === 401)) {
            sessionError.value = safeErrorMessage(refreshError)
          }
          return false
        }
      }
      user.value = null
      sessionStatus.value = 'anonymous'
      sessionError.value = safeErrorMessage(error)
      return false
    }
  }

  async function login(
    email: string,
    password: string,
    deviceNameOrClient: string | PhaseOneClient = 'VoiceAsset Console',
    client: PhaseOneClient = apiClient,
  ): Promise<boolean> {
    sessionStatus.value = 'checking'
    sessionError.value = null
    const deviceName =
      typeof deviceNameOrClient === 'string' ? deviceNameOrClient : 'VoiceAsset Console'
    const sessionClient = typeof deviceNameOrClient === 'string' ? client : deviceNameOrClient
    try {
      const session = await sessionClient.login(email, password, deviceName)
      user.value = session.user
      sessionStatus.value = 'authenticated'
      return true
    } catch (error) {
      user.value = null
      sessionStatus.value = 'anonymous'
      sessionError.value = safeErrorMessage(error)
      return false
    }
  }

  function clearLocalSession(): void {
    operationEpoch += 1
    user.value = null
    sessionStatus.value = 'anonymous'
    sessionError.value = null
    clearWorkflow()
  }

  async function logout(client: PhaseOneClient = apiClient): Promise<boolean> {
    sessionError.value = null
    try {
      await client.logout()
      clearLocalSession()
      return true
    } catch (error) {
      sessionError.value = safeErrorMessage(error)
      return false
    }
  }

  function resetWorkflow(): void {
    if (isBusy.value) {
      throw new Error('Wait for the current workflow before starting another upload.')
    }
    clearWorkflow()
  }

  function clearAssetWorkflow(assetId: string): boolean {
    if (asset.value?.id !== assetId) return false
    operationEpoch += 1
    clearWorkflow()
    return true
  }

  async function processAsset(
    input: ProcessAssetInput,
    dependencies: WorkflowDependencies = {},
  ): Promise<boolean> {
    if (!isAuthenticated.value) {
      workflowError.value = 'Sign in before uploading an asset.'
      stage.value = 'failed'
      return false
    }
    if (isBusy.value) {
      workflowError.value = 'An asset workflow is already running.'
      return false
    }

    const client = dependencies.client ?? apiClient
    const hash = dependencies.hash ?? sha256Hex
    const delay = dependencies.delay ?? wait
    const createId = dependencies.createId ?? randomId
    const pollIntervalMs = dependencies.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
    const maxPolls = dependencies.maxPolls ?? DEFAULT_MAX_POLLS
    const epoch = ++operationEpoch
    clearWorkflow()
    totalBytes.value = input.file.size

    try {
      validateFile(input.file)
      if (!Number.isInteger(pollIntervalMs) || pollIntervalMs < 0) {
        throw new TypeError('pollIntervalMs must be a non-negative integer.')
      }
      if (!Number.isInteger(maxPolls) || maxPolls < 1) {
        throw new TypeError('maxPolls must be a positive integer.')
      }

      stage.value = 'hashing'
      const fileSha256 = await hash(input.file)
      ensureCurrent(epoch)

      stage.value = 'creating-asset'
      asset.value = await client.createAsset(
        { title: input.title, language: input.language },
        createId(),
      )
      ensureCurrent(epoch)

      stage.value = 'creating-upload'
      upload.value = await client.createUpload(
        {
          asset_id: asset.value.id,
          filename: input.file.name,
          mime_type: input.file.type === 'audio/x-wav' ? 'audio/x-wav' : 'audio/wav',
          size_bytes: input.file.size,
          sha256: fileSha256,
        },
        createId(),
      )
      ensureCurrent(epoch)

      const partSize = upload.value.part_size
      if (!Number.isSafeInteger(partSize) || partSize < 1 || partSize > MAX_PART_SIZE) {
        throw new TypeError('Server returned an invalid upload part size.')
      }
      totalParts.value = Math.ceil(input.file.size / partSize)
      stage.value = 'uploading'
      for (let partNumber = 1; partNumber <= totalParts.value; partNumber += 1) {
        ensureCurrent(epoch)
        const start = (partNumber - 1) * partSize
        const end = Math.min(start + partSize, input.file.size)
        const part = input.file.slice(start, end, 'application/octet-stream')
        const partSha256 = await hash(part)
        ensureCurrent(epoch)
        await client.putUploadPart(upload.value.id, partNumber, part, partSha256)
        ensureCurrent(epoch)
        uploadedBytes.value = end
        uploadedParts.value = partNumber
      }

      stage.value = 'completing-upload'
      upload.value = await client.completeUpload(upload.value.id)
      ensureCurrent(epoch)
      if (upload.value.state !== 'completed') {
        throw new Error(`Upload stopped in unexpected state: ${upload.value.state}.`)
      }
      audioSource.value = client.audioUrl(asset.value.id)

      stage.value = 'queuing-transcription'
      job.value = await client.createTranscription(asset.value.id, createId())
      ensureCurrent(epoch)
      stage.value = 'transcribing'

      let polls = 0
      while (!['succeeded', 'failed', 'cancelled'].includes(job.value.state)) {
        if (polls >= maxPolls) {
          throw new Error('Transcription did not finish before the polling limit.')
        }
        await delay(pollIntervalMs)
        ensureCurrent(epoch)
        job.value = await client.getJob(job.value.id)
        ensureCurrent(epoch)
        polls += 1
      }
      if (job.value.state !== 'succeeded') {
        const reason = job.value.last_error_code ? ` (${job.value.last_error_code})` : ''
        throw new Error(`Transcription ${job.value.state}${reason}.`)
      }

      stage.value = 'reading-transcript'
      let revisionId = job.value.result_revision_id
      if (!revisionId) {
        const transcripts = await client.listTranscripts(asset.value.id)
        ensureCurrent(epoch)
        revisionId = transcripts.items[0]?.latest_revision_id
      }
      if (!revisionId) {
        throw new Error('The completed job did not provide a transcript revision.')
      }
      revision.value = await client.getRevision(revisionId)
      ensureCurrent(epoch)
      stage.value = 'ready'
      return true
    } catch (error) {
      if (error instanceof WorkflowCancelledError || epoch !== operationEpoch) {
        return false
      }
      workflowError.value = safeErrorMessage(error)
      stage.value = 'failed'
      return false
    }
  }

  return {
    asset: readonly(asset),
    audioSource: readonly(audioSource),
    clearAssetWorkflow,
    clearLocalSession,
    isAuthenticated,
    isBusy,
    job: readonly(job),
    login,
    logout,
    processAsset,
    progressPercent,
    resetWorkflow,
    restoreSession,
    revision: readonly(revision),
    sessionError: readonly(sessionError),
    sessionStatus: readonly(sessionStatus),
    stage: readonly(stage),
    stageLabel,
    totalBytes: readonly(totalBytes),
    totalParts: readonly(totalParts),
    upload: readonly(upload),
    uploadedBytes: readonly(uploadedBytes),
    uploadedParts: readonly(uploadedParts),
    user: readonly(user),
    workflowError: readonly(workflowError),
  }
})
