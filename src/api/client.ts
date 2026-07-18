import { apiConfig } from '@/config/api'

const MAX_UPLOAD_SIZE = 536_870_912
const UPLOAD_PART_SIZE = 5_242_880

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CANONICAL_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const SHA256_PATTERN = /^[0-9a-f]{64}$/
const LANGUAGE_PATTERN = /^(?:und|[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)$/
const HOTWORD_LANGUAGE_PATTERN = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/
const PAIRING_SECRET_PATTERN = /^va_pair_[A-Za-z0-9_-]{43}$/
const RFC3339_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/
const MAX_PAIRING_PAYLOAD_LENGTH = 2_048
const MAX_PAIRING_FUTURE_TTL_MS = 6 * 60_000
const PAIRING_RESPONSE_FIELDS = Object.freeze(['expires_at', 'id', 'payload'] as const)
const PAIRING_PAYLOAD_FIELDS = Object.freeze([
  'api_version',
  'contract_version',
  'expires_at',
  'origin',
  'pairing_session_id',
  'secret',
  'version',
] as const)

export interface ApiErrorPayload {
  code: string
  message: string
  request_id: string
}

interface ApiErrorEnvelope {
  error: ApiErrorPayload
}

export interface ServerCapabilities {
  server_version: string
  api_version: string
  contract_version: string
  features: string[]
}

export const MEMBER_ROLES = ['owner', 'admin', 'editor', 'viewer', 'agent'] as const
export const MEMBER_STATUSES = ['active', 'disabled'] as const

export type PrincipalRole = (typeof MEMBER_ROLES)[number]
export type MemberRole = PrincipalRole
export type MemberStatus = (typeof MEMBER_STATUSES)[number]

export const API_KEY_SCOPES = [
  'admin:read',
  'admin:write',
  'assets:read',
  'assets:write',
  'audio:read',
  'corrections:write',
  'metadata:write',
  'transcriptions:write',
  'transcripts:read',
] as const

export type Scope = (typeof API_KEY_SCOPES)[number]

export interface Principal {
  id: string
  workspace_id: string
  role: PrincipalRole
  email: string
  scopes: Scope[]
}

export interface WebSession {
  expires_at: string
  refresh_expires_at: string
  user: Principal
}

export interface CurrentSession {
  user: Principal
}

export interface ChangePasswordRequest {
  current_password: string
  new_password: string
}

export interface DeviceSession {
  id: string
  device_name: string
  current: boolean
  created_at: string
  last_seen_at: string
  expires_at: string
  refresh_expires_at: string
  revoked_at?: string | null
}

export interface DeviceSessionList {
  items: DeviceSession[]
}

export interface PairingSession {
  id: string
  expires_at: string
  payload: string
}

export interface CreateAPIKeyRequest {
  name: string
  scopes: Scope[]
  expires_at: string
}

export interface APIKey {
  id: string
  workspace_id: string
  name: string
  token_prefix: string
  scopes: Scope[]
  expires_at: string
  revoked_at: string | null
  last_used_at: string | null
  created_at: string
}

export interface CreatedAPIKey {
  api_key: APIKey
  token: string
}

export interface APIKeyList {
  items: APIKey[]
}

export const WEBHOOK_EVENT_TYPES = ['job.succeeded', 'job.failed', 'job.cancelled'] as const
export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number]
export type WebhookState = 'enabled' | 'disabled'

export interface Webhook {
  id: string
  workspace_id: string
  display_name: string
  url: string
  event_types: WebhookEventType[]
  state: WebhookState
  version: number
  secret_configured: boolean
  created_at: string
  updated_at: string
}

export interface WebhookSecret extends Webhook {
  signing_secret: string
}

export interface WebhookList {
  items: Webhook[]
}

export interface CreateWebhookRequest {
  display_name: string
  url: string
  event_types: WebhookEventType[]
  state?: WebhookState
}

export interface UpdateWebhookRequest {
  display_name?: string
  url?: string
  event_types?: WebhookEventType[]
  state?: WebhookState
}

export type WebhookDeliveryState =
  'pending' | 'delivering' | 'retry_wait' | 'succeeded' | 'failed' | 'cancelled'

export interface WebhookDelivery {
  id: string
  workspace_id: string
  webhook_id: string
  webhook_version: number
  notification_id?: string
  event_id: string
  event_type: WebhookEventType | 'webhook.test'
  state: WebhookDeliveryState
  attempts: number
  max_attempts: number
  available_at: string
  response_status?: number
  last_error_code?: string
  delivered_at?: string
  created_at: string
  updated_at: string
}

export interface WebhookDeliveryList {
  items: WebhookDelivery[]
}

export interface Member {
  id: string
  workspace_id: string
  email: string
  role: MemberRole
  status: MemberStatus
  version: number
  created_at: string
  updated_at: string
}

export interface WorkspaceProfile {
  id: string
  name: string
  version: number
  created_at: string
  updated_at: string
}

export interface UpdateWorkspaceRequest {
  name: string
}

export interface MemberList {
  items: Member[]
  next_cursor?: string
}

export interface ListMembersOptions {
  limit?: number
  cursor?: string
  role?: MemberRole
  status?: MemberStatus
}

export interface CreateMemberRequest {
  email: string
  password: string
  role: MemberRole
}

export interface UpdateMemberRequest {
  role?: MemberRole
  status?: MemberStatus
}

export interface CreateAssetRequest {
  title: string
  language: string
}

export type AssetStatus = 'draft' | 'uploading' | 'processing' | 'ready' | 'failed' | 'trashed'

export interface Asset {
  id: string
  workspace_id: string
  collection_id: string | null
  title: string
  language: string
  status: AssetStatus
  duration_ms: number | null
  version: number
  created_at: string
  updated_at: string
  search?: AssetSearchMatch
}

export interface AssetSearchMatch {
  title: boolean
  provider_ids: ASRProviderId[]
  segments: AssetSearchSegmentHit[]
}

export interface AssetSearchSegmentHit {
  transcript_id: string
  revision_id: string
  segment_id: string
  ordinal: number
  start_ms: number
  end_ms: number
  speaker: string | null
  text: string
}

export interface AssetList {
  items: Asset[]
  next_cursor?: string
}

export type AssetPurgeState = 'queued' | 'running' | 'retry_wait' | 'succeeded' | 'failed'

export interface AssetPurgeJob {
  job_id: string
  asset_id: string
  asset_version: number
  state: AssetPurgeState
  requested_at: string
}

export interface ListAssetsOptions {
  query?: string
  collectionId?: string
  tagId?: string
  status?: AssetStatus
  providerId?: ASRProviderId
  speaker?: string
  createdFrom?: string
  createdBefore?: string
  limit?: number
  cursor?: string
}

export interface UpdateAssetMetadataRequest {
  title: string
  language: string
  collection_id: string | null
}

export interface Collection {
  id: string
  workspace_id: string
  name: string
  description: string
  version: number
  asset_count: number
  created_at: string
  updated_at: string
}

export interface CollectionList {
  items: Collection[]
  next_cursor?: string
}

export interface ListCollectionsOptions {
  limit?: number
  cursor?: string
}

export type ListTagsOptions = ListCollectionsOptions

export interface Tag {
  id: string
  workspace_id: string
  name: string
  color: string | null
  asset_count: number
  created_at: string
}

export interface TagList {
  items: Tag[]
  next_cursor?: string
}

export interface TagMutationResult {
  asset_id: string
  tag_ids: string[]
  changed_count: number
}

export type AnnotationKind = 'bookmark' | 'note'

export interface CreateAnnotationRequest {
  kind: AnnotationKind
  start_ms: number
  end_ms?: number | null
  body: string
}

export interface Annotation {
  id: string
  workspace_id: string
  asset_id: string
  kind: AnnotationKind
  start_ms: number
  end_ms: number | null
  body: string
  version: number
  created_by: string
  created_at: string
  updated_at: string
}

export interface AnnotationList {
  items: Annotation[]
  next_cursor?: string
}

export interface ListAnnotationsOptions {
  limit?: number
  cursor?: string
}

export interface ProcessingJob {
  id: string
  kind: string
  state: TranscriptionJobState
  attempts: number
  max_attempts: number
  last_error_code: JobErrorCode | null
  result_revision_id: string | null
  created_at: string
  updated_at: string
}

export interface ProcessingStatus {
  asset_id: string
  asset_status: AssetStatus
  active: boolean
  jobs: ProcessingJob[]
  updated_at: string
}

export type AudioMimeType = 'audio/wav' | 'audio/x-wav' | 'audio/mp4'

export interface CreateUploadRequest {
  asset_id: string
  filename: string
  mime_type: AudioMimeType
  size_bytes: number
  sha256: string
}

export type UploadState = 'active' | 'assembling' | 'completed' | 'cancelled' | 'failed'

export interface UploadPart {
  number: number
  size_bytes: number
  sha256: string
  created_at: string
}

export interface UploadSession {
  id: string
  asset_id: string
  workspace_id: string
  filename: string
  mime_type: AudioMimeType
  expected_size: number
  expected_sha256: string
  part_size: 5_242_880
  state: UploadState
  expires_at: string
  created_at: string
  updated_at: string
  completed_at: string | null
  error_code: 'invalid_audio' | null
  parts: UploadPart[] | null
}

export type TranscriptionJobState =
  'queued' | 'running' | 'retry_wait' | 'succeeded' | 'failed' | 'cancelled'

export type JobErrorCode =
  | 'internal_error'
  | 'provider_unavailable'
  | 'invalid_audio'
  | 'provider_rejected'
  | 'worker_timeout'
  | 'lease_expired'

export type TranscriptionJobKind = 'mock_transcribe' | 'llm_correct'

export type TranscriptionJobPayload = { asset_id: string } | { source_revision_id: string }

export interface TranscriptionJob {
  id: string
  workspace_id: string
  asset_id: string
  created_by: string
  kind: TranscriptionJobKind
  state: TranscriptionJobState
  payload: TranscriptionJobPayload
  attempts: number
  max_attempts: 3
  available_at: string
  lease_owner?: string
  lease_expires_at?: string
  last_error_code?: JobErrorCode
  result_revision_id?: string
  created_at: string
  updated_at: string
}

export type OperationsJobState = TranscriptionJobState

export interface OperationsJob {
  id: string
  asset_id?: string
  created_by: string
  kind: string
  state: OperationsJobState
  attempts: number
  max_attempts: number
  available_at: string
  lease_expires_at?: string
  last_error_code?: string
  result_revision_id?: string
  created_at: string
  updated_at: string
}

export interface OperationsJobList {
  items: OperationsJob[]
  next_cursor?: string
}

export interface ListOperationsJobsOptions {
  limit?: number
  cursor?: string
  state?: OperationsJobState
  kind?: string
}

export type OperationsAuditActorType = 'user' | 'agent' | 'system'

export interface OperationsAuditEntry {
  id: string
  actor_id?: string
  actor_email?: string
  actor_type: OperationsAuditActorType
  action: string
  target_type: string
  target_id?: string
  request_id?: string
  metadata: Record<string, unknown>
  occurred_at: string
}

export interface OperationsAuditList {
  items: OperationsAuditEntry[]
  next_cursor?: string
}

export interface ListOperationsAuditOptions {
  limit?: number
  cursor?: string
  actorType?: OperationsAuditActorType
  action?: string
  targetType?: string
}

export interface OperationsAssetStatus {
  total: number
  active: number
  trashed: number
  purging: number
  failed: number
  audio_duration_ms: number
}

export interface OperationsStorageStatus {
  object_count: number
  bytes: number
}

export interface OperationsTranscriptStatus {
  transcript_count: number
  revision_count: number
}

export interface OperationsJobStatus {
  total: number
  queued: number
  running: number
  retry_wait: number
  succeeded: number
  failed: number
  cancelled: number
}

export interface OperationsProviderStatus {
  enabled_asr: number
  enabled_llm: number
}

export interface OperationsSystemStatus {
  generated_at: string
  active_users: number
  assets: OperationsAssetStatus
  storage: OperationsStorageStatus
  transcripts: OperationsTranscriptStatus
  jobs: OperationsJobStatus
  providers: OperationsProviderStatus
}

export interface DeploymentSystemSettings {
  scope: 'deployment'
  management: 'operator_environment'
  mutable: false
  brand_name: string
  public_origin: string
  storage_backend: 'local' | 's3'
  cookie_secure: boolean
  provider_credential_encryption_configured: boolean
}

export interface TranscriptSummary {
  id: string
  asset_id: string
  language: string
  latest_revision_id: string
  latest_kind: TranscriptKind
  latest_text: string
  created_at: string
  revision_created_at: string
}

export interface TranscriptList {
  items: TranscriptSummary[]
}

export interface TranscriptWord {
  start_ms: number
  end_ms: number
  text: string
  confidence: number
  [key: string]: unknown
}

export interface TranscriptSegment {
  id: string
  ordinal: number
  start_ms: number
  end_ms: number
  speaker: string | null
  text: string
  confidence: number | null
  words: TranscriptWord[]
}

export type TranscriptKind =
  'raw_asr' | 'normalized' | 'llm_corrected' | 'human_edited' | 'approved'

export type TranscriptReviewStatus = 'pending' | 'reviewed' | 'approved' | 'rejected'

export interface CorrectionChange {
  segment_id: string
  original: string
  replacement: string
  confidence: number
  reason: string
}

export interface TranscriptDiff {
  changes?: CorrectionChange[]
  [key: string]: unknown
}

export interface TranscriptRevision {
  id: string
  transcript_id: string
  asset_id: string
  parent_revision_id?: string
  kind: TranscriptKind
  language: string
  text: string
  provider_snapshot: Record<string, unknown> & { provider_id: string }
  hotword_snapshot: Record<string, unknown>
  glossary_snapshot: Record<string, unknown>
  diff: TranscriptDiff
  validation_result: Record<string, unknown>
  provider_raw_object_id?: string
  source_job_id?: string
  created_by?: string
  created_by_type: 'user' | 'agent' | 'system'
  model?: string
  prompt_version?: string
  review_status: TranscriptReviewStatus
  created_at: string
  segments: TranscriptSegment[]
}

export type GlossaryScope = 'workspace' | 'collection' | 'asset'
export type ResourceState = 'enabled' | 'disabled'

export const ASR_PROVIDER_IDS = ['mock_asr', 'aliyun_asr', 'tencent_asr'] as const

export type ASRProviderId = (typeof ASR_PROVIDER_IDS)[number]
export type HotwordScope = GlossaryScope

export interface HotwordEntryInput {
  term: string
  aliases?: string[]
  language: string
  weight: number
  provider_mapping?: Partial<Record<ASRProviderId, Record<string, unknown>>>
  enabled?: boolean
  description?: string
}

export interface HotwordEntry {
  term: string
  aliases: string[]
  language: string
  weight: number
  provider_mapping: Partial<Record<ASRProviderId, Record<string, unknown>>>
  enabled: boolean
  description?: string
}

export interface CreateHotwordSetRequest {
  display_name: string
  scope_type: HotwordScope
  scope_id?: string
  state?: ResourceState
  entries: HotwordEntryInput[]
}

export interface AddHotwordSetVersionRequest {
  entries: HotwordEntryInput[]
}

export interface HotwordSet {
  id: string
  workspace_id: string
  display_name: string
  scope_type: HotwordScope
  scope_id: string | null
  state: ResourceState
  current_version: number
  resource_version: number
  entries: HotwordEntry[]
  created_at: string
  updated_at: string
}

export interface HotwordSetList {
  items: HotwordSet[]
}

export interface ASRProviderCapabilities {
  provider_id: ASRProviderId
  batch: boolean
  realtime: boolean
  sentence: boolean
  languages: string[]
  models: string[]
  formats: string[]
  sample_rates: number[]
  hotwords: boolean
  temporary_hotwords: boolean
  timestamps: boolean
  word_timestamps: boolean
  speaker_diarization: boolean
  punctuation: boolean
  number_normalization: boolean
  max_duration_ms: number
  max_file_size_bytes: number
  max_concurrency: number
}

export interface ASRProviderCapabilitiesList {
  items: ASRProviderCapabilities[]
}

export interface ProviderRetryPolicy {
  max_attempts: number
  base_delay: string
  max_delay: string
}

export interface ASRProviderConfig {
  endpoint?: string
  region?: string
  model: string
  language: string
  dialect?: string
  sample_rate: number
  audio_format: string
  punctuation: boolean
  timestamps: boolean
  word_timestamps: boolean
  speaker_diarization: boolean
  number_normalization: boolean
  hotword_set_id?: string
  timeout: string
  retry: ProviderRetryPolicy
  concurrency: number
  vendor_extension: Record<string, unknown>
}

export type AliyunProviderCredentials =
  | {
      access_token: string
      access_key_id?: never
      access_key_secret?: never
    }
  | {
      access_token?: never
      access_key_id: string
      access_key_secret: string
    }

export interface TencentProviderCredentials {
  secret_id: string
  secret_key: string
}

export type ProviderCredentials = AliyunProviderCredentials | TencentProviderCredentials

interface CreateProviderProfileBase {
  display_name: string
  config: ASRProviderConfig
  state?: ResourceState
  priority?: number
}

export type CreateProviderProfileRequest =
  | (CreateProviderProfileBase & {
      provider_id: 'mock_asr'
      credentials?: never
    })
  | (CreateProviderProfileBase & {
      provider_id: 'aliyun_asr'
      credentials: AliyunProviderCredentials
    })
  | (CreateProviderProfileBase & {
      provider_id: 'tencent_asr'
      credentials: TencentProviderCredentials
    })

export interface UpdateProviderProfileRequest {
  display_name?: string
  config?: ASRProviderConfig
  credentials?: ProviderCredentials
  state?: ResourceState
  priority?: number
}

export interface ProviderProfile {
  id: string
  workspace_id: string
  provider_id: ASRProviderId
  display_name: string
  config: ASRProviderConfig
  state: ResourceState
  priority: number
  version: number
  secret_configured: boolean
  created_at: string
  updated_at: string
}

export interface ProviderProfileList {
  items: ProviderProfile[]
}

export interface ProviderHealth {
  profile_id: string
  status: 'healthy' | 'unhealthy'
  error_class?: string
  checked_at: string
}

export interface GlossaryEntry {
  canonical_form: string
  aliases: string[]
  language: string
  context_terms?: string[]
  forbidden_contexts?: string[]
  regex?: boolean
  case_sensitive?: boolean
  priority: number
  description?: string
}

export interface CreateGlossarySetRequest {
  display_name: string
  scope_type: GlossaryScope
  scope_id?: string
  state?: ResourceState
  entries: GlossaryEntry[]
}

export interface AddGlossarySetVersionRequest {
  entries: GlossaryEntry[]
}

export interface GlossarySet {
  id: string
  workspace_id: string
  display_name: string
  scope_type: GlossaryScope
  scope_id: string | null
  state: ResourceState
  current_version: number
  resource_version: number
  entries: GlossaryEntry[]
  created_at: string
  updated_at: string
}

export interface GlossarySetList {
  items: GlossarySet[]
}

export type LLMProviderId = 'mock_llm' | 'openai_compatible_llm'

export interface LLMCapabilities {
  provider_id: LLMProviderId
  structured_patch: boolean
  custom_headers: boolean
  max_context_tokens: number
  max_concurrency: number
}

export interface LLMCapabilitiesList {
  items: LLMCapabilities[]
}

export interface LLMConfig {
  base_url?: string
  model: string
  custom_header_names?: string[]
  timeout: string
  concurrency: number
  temperature: number
  context_limit: number
  structured_output: true
  prompt_template: string
  default_glossary_id?: string
  auto_approval_policy: 'never' | 'validated_glossary_only'
}

export interface LLMCredentials {
  api_key: string
  custom_headers?: Record<string, string>
}

interface CreateLLMProfileBase {
  display_name: string
  config: LLMConfig
  state?: ResourceState
  priority?: number
}

export type CreateLLMProfileRequest =
  | (CreateLLMProfileBase & {
      provider_id: 'mock_llm'
      credentials?: never
    })
  | (CreateLLMProfileBase & {
      provider_id: 'openai_compatible_llm'
      credentials: LLMCredentials
    })

export interface UpdateLLMProfileRequest {
  display_name?: string
  config?: LLMConfig
  credentials?: LLMCredentials
  state?: ResourceState
  priority?: number
}

export interface LLMProfile {
  id: string
  workspace_id: string
  provider_id: LLMProviderId
  display_name: string
  config: LLMConfig
  state: ResourceState
  priority: number
  version: number
  secret_configured: boolean
  created_at: string
  updated_at: string
}

export interface LLMProfileList {
  items: LLMProfile[]
}

export interface LLMHealth {
  profile_id: string
  status: 'healthy' | 'unhealthy'
  error_class?: string
  checked_at: string
}

export type ReviewAction = 'accept_change' | 'reject_change' | 'accept_all' | 'reject_all'

export type ReviewDecisionRequest =
  | { action: 'accept_change' | 'reject_change'; change_index: number }
  | { action: 'accept_all' | 'reject_all' }

export interface ReviewRecord {
  id: string
  revision_id: string
  reviewer_id: string
  action: ReviewAction | 'approve'
  change_index?: number
  resulting_revision_id?: string
  created_at: string
}

export interface ApprovalResult {
  review: ReviewRecord
  human_revision: TranscriptRevision
  approved_revision: TranscriptRevision
}

export type TranscriptExportFormat = 'json' | 'markdown' | 'srt' | 'vtt'

export interface TranscriptExport {
  id: string
  asset_id: string
  revision_id: string
  format: TranscriptExportFormat
  mime_type:
    | 'application/json'
    | 'text/markdown; charset=utf-8'
    | 'application/x-subrip; charset=utf-8'
    | 'text/vtt; charset=utf-8'
  file_size: number
  sha256: string
  download_url: string
  created_at: string
  expires_at: string
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly requestId?: string

  constructor(
    message: string,
    options: {
      status: number
      code?: string
      requestId?: string
    },
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = options.status
    this.code = options.code ?? 'http_error'
    this.requestId = options.requestId
  }
}

export type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

function readApiError(value: unknown): ApiErrorPayload | undefined {
  if (typeof value !== 'object' || value === null || !('error' in value)) {
    return undefined
  }
  const envelope = value as ApiErrorEnvelope
  const error = envelope.error
  if (typeof error !== 'object' || error === null) {
    return undefined
  }

  const candidate = error as Partial<ApiErrorPayload>
  if (
    typeof candidate.code !== 'string' ||
    candidate.code.length === 0 ||
    typeof candidate.message !== 'string' ||
    candidate.message.length === 0 ||
    typeof candidate.request_id !== 'string' ||
    candidate.request_id.length === 0
  ) {
    return undefined
  }

  return candidate as ApiErrorPayload
}

function readCapabilities(value: unknown): ServerCapabilities | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }

  const candidate = value as Partial<ServerCapabilities>
  if (
    typeof candidate.server_version !== 'string' ||
    candidate.server_version.length === 0 ||
    typeof candidate.api_version !== 'string' ||
    candidate.api_version.length === 0 ||
    typeof candidate.contract_version !== 'string' ||
    candidate.contract_version.length === 0 ||
    !Array.isArray(candidate.features) ||
    candidate.features.some(
      (feature) => typeof feature !== 'string' || !/^[a-z][a-z0-9_]*$/.test(feature),
    ) ||
    new Set(candidate.features).size !== candidate.features.length ||
    candidate.features.some(
      (feature, index, features) => index > 0 && features[index - 1]! > feature,
    )
  ) {
    return undefined
  }

  return candidate as ServerCapabilities
}

function hasExactFields(
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort()
  return (
    actual.length === expected.length && actual.every((field, index) => field === expected[index])
  )
}

function parsePairingTimestamp(value: string): number | undefined {
  if (!RFC3339_PATTERN.test(value)) {
    return undefined
  }
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : undefined
}

function isCanonicalPairingSecret(value: string): boolean {
  if (!PAIRING_SECRET_PATTERN.test(value)) {
    return false
  }
  const encoded = value.slice('va_pair_'.length)
  try {
    const decoded = atob(encoded.replaceAll('-', '+').replaceAll('_', '/') + '=')
    const canonical = btoa(decoded).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
    return decoded.length === 32 && canonical === encoded
  } catch {
    return false
  }
}

function readPairingPayloadQuery(rawQuery: string): Map<string, string> | undefined {
  if (!rawQuery || rawQuery.includes('+')) {
    return undefined
  }
  const fields = new Map<string, string>()
  try {
    for (const pair of rawQuery.split('&')) {
      const separator = pair.indexOf('=')
      if (separator <= 0 || separator === pair.length - 1) {
        return undefined
      }
      const name = decodeURIComponent(pair.slice(0, separator))
      const value = decodeURIComponent(pair.slice(separator + 1))
      if (
        !PAIRING_PAYLOAD_FIELDS.includes(name as (typeof PAIRING_PAYLOAD_FIELDS)[number]) ||
        fields.has(name) ||
        !value ||
        /[\u0000-\u001f\u007f]/.test(name) ||
        /[\u0000-\u001f\u007f]/.test(value)
      ) {
        return undefined
      }
      fields.set(name, value)
    }
  } catch {
    return undefined
  }
  return fields.size === PAIRING_PAYLOAD_FIELDS.length ? fields : undefined
}

function readPairingSession(value: unknown): PairingSession | undefined {
  if (!isRecord(value) || !hasExactFields(value, PAIRING_RESPONSE_FIELDS)) {
    return undefined
  }
  if (
    typeof value.id !== 'string' ||
    !CANONICAL_UUID_PATTERN.test(value.id) ||
    typeof value.expires_at !== 'string' ||
    typeof value.payload !== 'string' ||
    value.payload !== value.payload.trim() ||
    value.payload.length < 1 ||
    value.payload.length > MAX_PAIRING_PAYLOAD_LENGTH ||
    !value.payload.startsWith('voiceasset://pair?')
  ) {
    return undefined
  }

  let payloadUrl: URL
  try {
    payloadUrl = new URL(value.payload)
  } catch {
    return undefined
  }
  if (
    payloadUrl.protocol !== 'voiceasset:' ||
    payloadUrl.host !== 'pair' ||
    payloadUrl.username ||
    payloadUrl.password ||
    payloadUrl.port ||
    payloadUrl.pathname ||
    payloadUrl.hash
  ) {
    return undefined
  }

  const fields = readPairingPayloadQuery(payloadUrl.search.slice(1))
  if (
    !fields ||
    fields.get('version') !== '1' ||
    fields.get('api_version') !== 'v1' ||
    fields.get('contract_version') !== apiConfig.contractVersion ||
    fields.get('pairing_session_id') !== value.id ||
    !isCanonicalPairingSecret(fields.get('secret') ?? '')
  ) {
    return undefined
  }

  const rawOrigin = fields.get('origin') ?? ''
  let origin: URL
  try {
    origin = new URL(rawOrigin)
  } catch {
    return undefined
  }
  if (
    origin.protocol !== 'https:' ||
    !origin.hostname ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.origin !== rawOrigin ||
    (origin.port !== '' && (Number(origin.port) < 1 || Number(origin.port) > 65_535))
  ) {
    return undefined
  }

  const responseExpiry = parsePairingTimestamp(value.expires_at)
  const payloadExpiry = parsePairingTimestamp(fields.get('expires_at') ?? '')
  const now = Date.now()
  if (
    responseExpiry === undefined ||
    payloadExpiry === undefined ||
    Math.floor(responseExpiry / 1_000) !== Math.floor(payloadExpiry / 1_000) ||
    payloadExpiry <= now ||
    payloadExpiry > now + MAX_PAIRING_FUTURE_TTL_MS
  ) {
    return undefined
  }
  return value as unknown as PairingSession
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.headers.get('content-type')?.includes('application/json')) {
    return null
  }

  try {
    return await response.json()
  } catch {
    return null
  }
}

function relativeApiPath(path: string): string {
  if (/^(?:[a-z][a-z\d+.-]*:)?\/\//i.test(path)) {
    throw new TypeError('API request paths must be relative to the configured server.')
  }

  return path.startsWith('/') ? path : `/${path}`
}

function assertUuid(value: string, name: string): string {
  if (!UUID_PATTERN.test(value)) {
    throw new TypeError(`${name} must be a UUID.`)
  }
  return value
}

function assertSha256(value: string, name: string): string {
  if (!SHA256_PATTERN.test(value)) {
    throw new TypeError(`${name} must be a lowercase hexadecimal SHA-256.`)
  }
  return value
}

function assertIdempotencyKey(value: string): string {
  if (value.length < 1 || value.length > 200) {
    throw new TypeError('idempotencyKey must contain between 1 and 200 characters.')
  }
  return value
}

function assertLanguage(value: string): string {
  if (!LANGUAGE_PATTERN.test(value)) {
    throw new TypeError('language must be a supported language tag or "und".')
  }
  return value
}

function normalizeTitle(value: string): string {
  const title = value.trim()
  if (title.length < 1 || title.length > 500 || /[\u0000-\u001f\u007f]/.test(title)) {
    throw new TypeError('title must contain 1 to 500 characters without control characters.')
  }
  return title
}

function normalizeEmail(value: string): string {
  const email = value.trim()
  if (email.length < 3 || email.length > 254 || !/^\S+@\S+\.\S+$/.test(email)) {
    throw new TypeError('email must be a valid email address.')
  }
  return email
}

function assertPassword(value: string): string {
  if (value.length < 1) {
    throw new TypeError('password must not be empty.')
  }
  return value
}

function normalizeChangePasswordRequest(input: ChangePasswordRequest): ChangePasswordRequest {
  const currentBytes = new TextEncoder().encode(input.current_password).byteLength
  const newBytes = new TextEncoder().encode(input.new_password).byteLength
  const newCharacters = [...input.new_password].length
  if (currentBytes < 1 || currentBytes > 1024) {
    throw new TypeError('currentPassword must contain between 1 and 1024 bytes.')
  }
  if (newCharacters < 12 || newBytes > 1024) {
    throw new TypeError('newPassword must contain at least 12 characters and at most 1024 bytes.')
  }
  if (input.current_password === input.new_password) {
    throw new TypeError('newPassword must differ from currentPassword.')
  }
  return { ...input }
}

function normalizeDeviceName(value: string): string {
  const name = value.trim()
  if (name.length < 1 || [...name].length > 100 || /\p{Cc}/u.test(name)) {
    throw new TypeError('deviceName must contain 1 to 100 characters without control characters.')
  }
  return name
}

function normalizeDisplayName(value: string): string {
  const name = value.trim()
  if (name.length < 1 || name.length > 100 || /[\u0000-\u001f\u007f]/.test(name)) {
    throw new TypeError('displayName must contain 1 to 100 characters without control characters.')
  }
  return name
}

function assertResourceVersion(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${name} must be a positive integer.`)
  }
  return value
}

function normalizeWebhookURL(value: string): string {
  const url = value.trim()
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new TypeError('Webhook URL must be an absolute HTTPS URL.')
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    url.length > 2048
  ) {
    throw new TypeError('Webhook URL must be HTTPS without credentials, query, or fragment.')
  }
  return parsed.toString()
}

function normalizeWebhookEvents(values: WebhookEventType[]): WebhookEventType[] {
  if (values.length < 1 || values.length > WEBHOOK_EVENT_TYPES.length) {
    throw new TypeError('Webhook event types must contain between 1 and 3 items.')
  }
  const unique = [...new Set(values)]
  if (
    unique.length !== values.length ||
    unique.some((value) => !WEBHOOK_EVENT_TYPES.includes(value))
  ) {
    throw new TypeError('Webhook event types are invalid or duplicated.')
  }
  return [...unique].sort()
}

function normalizeCreateWebhookRequest(input: CreateWebhookRequest): CreateWebhookRequest {
  const displayName = normalizeDisplayName(input.display_name)
  const eventTypes = normalizeWebhookEvents(input.event_types)
  const state = input.state ?? 'disabled'
  if (state !== 'enabled' && state !== 'disabled') {
    throw new TypeError('Webhook state is invalid.')
  }
  return {
    display_name: displayName,
    url: normalizeWebhookURL(input.url),
    event_types: eventTypes,
    state,
  }
}

function normalizeUpdateWebhookRequest(input: UpdateWebhookRequest): UpdateWebhookRequest {
  const output: UpdateWebhookRequest = {}
  if (input.display_name !== undefined)
    output.display_name = normalizeDisplayName(input.display_name)
  if (input.url !== undefined) output.url = normalizeWebhookURL(input.url)
  if (input.event_types !== undefined)
    output.event_types = normalizeWebhookEvents(input.event_types)
  if (input.state !== undefined) {
    if (input.state !== 'enabled' && input.state !== 'disabled') {
      throw new TypeError('Webhook state is invalid.')
    }
    output.state = input.state
  }
  if (Object.keys(output).length === 0) {
    throw new TypeError('Webhook update must include at least one field.')
  }
  return output
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeHotwordTerm(value: string): string {
  const term = value.trim()
  if ([...term].length < 1 || [...term].length > 30 || /[,|\u0000-\u001f\u007f]/.test(term)) {
    throw new TypeError('hotword terms must contain 1 to 30 characters without delimiters.')
  }
  return term
}

function normalizeHotwordEntries(inputs: HotwordEntryInput[]): HotwordEntryInput[] {
  if (inputs.length < 1 || inputs.length > 500) {
    throw new TypeError('hotword entries must contain between 1 and 500 items.')
  }

  const seen = new Set<string>()
  return inputs.map((input) => {
    const term = normalizeHotwordTerm(input.term)
    const aliases = (input.aliases ?? []).map(normalizeHotwordTerm)
    if (aliases.length > 20) {
      throw new TypeError('hotword aliases must contain at most 20 items.')
    }
    for (const candidate of [term, ...aliases]) {
      const key = candidate.toLocaleLowerCase('en-US')
      if (seen.has(key)) {
        throw new TypeError('hotword terms and aliases must be unique.')
      }
      seen.add(key)
    }

    const language = input.language.trim()
    if (!HOTWORD_LANGUAGE_PATTERN.test(language)) {
      throw new TypeError('hotword language must be a valid language tag.')
    }
    if (!Number.isSafeInteger(input.weight) || input.weight < 1 || input.weight > 100) {
      throw new TypeError('hotword weight must be an integer between 1 and 100.')
    }

    const providerMapping: Partial<Record<ASRProviderId, Record<string, unknown>>> = {}
    for (const [providerId, mapping] of Object.entries(input.provider_mapping ?? {})) {
      if (!ASR_PROVIDER_IDS.includes(providerId as ASRProviderId) || !isRecord(mapping)) {
        throw new TypeError('providerMapping must contain supported provider JSON objects.')
      }
      providerMapping[providerId as ASRProviderId] = mapping
    }
    const description = input.description?.trim()
    if (description && [...description].length > 500) {
      throw new TypeError('hotword description must contain at most 500 characters.')
    }

    return {
      term,
      aliases,
      language,
      weight: input.weight,
      provider_mapping: providerMapping,
      ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
      ...(description ? { description } : {}),
    }
  })
}

function normalizeHotwordSetRequest(input: CreateHotwordSetRequest): CreateHotwordSetRequest {
  if (!['workspace', 'collection', 'asset'].includes(input.scope_type)) {
    throw new TypeError('scopeType must be workspace, collection, or asset.')
  }
  if (input.state && input.state !== 'enabled' && input.state !== 'disabled') {
    throw new TypeError('state must be enabled or disabled.')
  }

  let scopeId: string | undefined
  if (input.scope_type === 'workspace') {
    if (input.scope_id?.trim()) {
      throw new TypeError('Workspace hotword sets must not include a scopeId.')
    }
  } else {
    scopeId = assertUuid(input.scope_id ?? '', 'scopeId')
  }

  return {
    display_name: normalizeDisplayName(input.display_name),
    scope_type: input.scope_type,
    ...(scopeId ? { scope_id: scopeId } : {}),
    ...(input.state ? { state: input.state } : {}),
    entries: normalizeHotwordEntries(input.entries),
  }
}

function normalizeProviderConfig(input: ASRProviderConfig): ASRProviderConfig {
  const model = input.model.trim()
  const language = input.language.trim()
  const audioFormat = input.audio_format.trim().toLowerCase()
  const timeout = input.timeout.trim()
  const baseDelay = input.retry.base_delay.trim()
  const maxDelay = input.retry.max_delay.trim()
  if (!model || model.length > 100 || !language || language.length > 100) {
    throw new TypeError('provider model and language must contain between 1 and 100 characters.')
  }
  if (!audioFormat || audioFormat.length > 32 || !timeout || timeout.length > 32) {
    throw new TypeError('provider format and timeout are invalid.')
  }
  if (!Number.isSafeInteger(input.sample_rate) || input.sample_rate < 1) {
    throw new TypeError('sampleRate must be a positive integer.')
  }
  if (
    !Number.isSafeInteger(input.concurrency) ||
    input.concurrency < 1 ||
    input.concurrency > 128
  ) {
    throw new TypeError('concurrency must be an integer between 1 and 128.')
  }
  if (
    !Number.isSafeInteger(input.retry.max_attempts) ||
    input.retry.max_attempts < 1 ||
    input.retry.max_attempts > 10 ||
    !baseDelay ||
    baseDelay.length > 32 ||
    !maxDelay ||
    maxDelay.length > 32
  ) {
    throw new TypeError('retry must contain bounded attempts and delay durations.')
  }
  if (!isRecord(input.vendor_extension)) {
    throw new TypeError('vendorExtension must be a JSON object.')
  }

  const endpoint = input.endpoint?.trim()
  if (endpoint) {
    let url: URL
    try {
      url = new URL(endpoint)
    } catch {
      throw new TypeError('endpoint must be an absolute HTTPS URL.')
    }
    if (url.protocol !== 'https:' || url.username || url.password) {
      throw new TypeError('endpoint must be an absolute HTTPS URL without credentials.')
    }
  }

  return {
    ...(endpoint ? { endpoint } : {}),
    ...(input.region?.trim() ? { region: input.region.trim() } : {}),
    model,
    language,
    ...(input.dialect?.trim() ? { dialect: input.dialect.trim() } : {}),
    sample_rate: input.sample_rate,
    audio_format: audioFormat,
    punctuation: input.punctuation,
    timestamps: input.timestamps,
    word_timestamps: input.word_timestamps,
    speaker_diarization: input.speaker_diarization,
    number_normalization: input.number_normalization,
    ...(input.hotword_set_id
      ? { hotword_set_id: assertUuid(input.hotword_set_id, 'hotwordSetId') }
      : {}),
    timeout,
    retry: {
      max_attempts: input.retry.max_attempts,
      base_delay: baseDelay,
      max_delay: maxDelay,
    },
    concurrency: input.concurrency,
    vendor_extension: input.vendor_extension,
  }
}

function validCredential(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length >= 8 && value.length <= 4096
}

function normalizeProviderCredentials(
  providerId: ASRProviderId,
  credentials: ProviderCredentials | undefined,
): ProviderCredentials | undefined {
  if (providerId === 'mock_asr') {
    if (credentials !== undefined) {
      throw new TypeError('Mock ASR does not accept credentials.')
    }
    return undefined
  }
  if (!credentials || !isRecord(credentials)) {
    throw new TypeError('provider credentials are required.')
  }
  const credentialRecord = credentials as Record<string, unknown>

  if (providerId === 'aliyun_asr') {
    const accessToken = credentialRecord.access_token
    const accessKeyId = credentialRecord.access_key_id
    const accessKeySecret = credentialRecord.access_key_secret
    if (
      validCredential(accessToken) &&
      accessKeyId === undefined &&
      accessKeySecret === undefined
    ) {
      return { access_token: accessToken }
    }
    if (
      accessToken === undefined &&
      validCredential(accessKeyId) &&
      validCredential(accessKeySecret)
    ) {
      return { access_key_id: accessKeyId, access_key_secret: accessKeySecret }
    }
    throw new TypeError('Aliyun credentials require one token or one AccessKey pair.')
  }

  const secretId = credentialRecord.secret_id
  const secretKey = credentialRecord.secret_key
  if (!validCredential(secretId) || !validCredential(secretKey)) {
    throw new TypeError('Tencent credentials require a SecretId and SecretKey.')
  }
  return { secret_id: secretId, secret_key: secretKey }
}

function normalizeProviderProfileRequest(
  input: CreateProviderProfileRequest,
): CreateProviderProfileRequest {
  const base = {
    display_name: normalizeDisplayName(input.display_name),
    config: normalizeProviderConfig(input.config),
    ...(input.state ? { state: input.state } : {}),
    ...(input.priority === undefined
      ? {}
      : { priority: assertResourceVersion(input.priority, 'priority') }),
  }
  if (input.state && input.state !== 'enabled' && input.state !== 'disabled') {
    throw new TypeError('state must be enabled or disabled.')
  }
  if (input.priority !== undefined && input.priority > 1000) {
    throw new TypeError('priority must be between 1 and 1000.')
  }

  const credentials = normalizeProviderCredentials(input.provider_id, input.credentials)
  if (input.provider_id === 'mock_asr') {
    return { ...base, provider_id: 'mock_asr' }
  }
  if (input.provider_id === 'aliyun_asr') {
    return {
      ...base,
      provider_id: 'aliyun_asr',
      credentials: credentials as AliyunProviderCredentials,
    }
  }
  return {
    ...base,
    provider_id: 'tencent_asr',
    credentials: credentials as TencentProviderCredentials,
  }
}

function normalizeProviderProfileUpdate(
  providerId: ASRProviderId,
  input: UpdateProviderProfileRequest,
): UpdateProviderProfileRequest {
  if (Object.keys(input).length === 0) {
    throw new TypeError('provider profile update must contain at least one field.')
  }
  if (input.state && input.state !== 'enabled' && input.state !== 'disabled') {
    throw new TypeError('state must be enabled or disabled.')
  }
  if (
    input.priority !== undefined &&
    (!Number.isSafeInteger(input.priority) || input.priority < 1 || input.priority > 1000)
  ) {
    throw new TypeError('priority must be between 1 and 1000.')
  }
  return {
    ...(input.display_name === undefined
      ? {}
      : { display_name: normalizeDisplayName(input.display_name) }),
    ...(input.config === undefined ? {} : { config: normalizeProviderConfig(input.config) }),
    ...(input.credentials === undefined
      ? {}
      : { credentials: normalizeProviderCredentials(providerId, input.credentials)! }),
    ...(input.state === undefined ? {} : { state: input.state }),
    ...(input.priority === undefined ? {} : { priority: input.priority }),
  }
}

function normalizeAPIKeyRequest(input: CreateAPIKeyRequest): CreateAPIKeyRequest {
  const scopes = [...input.scopes]
  if (
    scopes.length < 1 ||
    scopes.length > 20 ||
    new Set(scopes).size !== scopes.length ||
    scopes.some((scope) => !API_KEY_SCOPES.includes(scope))
  ) {
    throw new TypeError('scopes must contain unique supported API-key scopes.')
  }

  const expiresAt = input.expires_at.trim()
  const parsedExpiry = new Date(expiresAt)
  if (!expiresAt || Number.isNaN(parsedExpiry.getTime())) {
    throw new TypeError('expiresAt must be a valid date-time.')
  }

  return {
    name: normalizeDisplayName(input.name),
    scopes,
    expires_at: parsedExpiry.toISOString(),
  }
}

function normalizeGlossaryList(
  values: string[] | undefined,
  name: string,
  minimum: number,
  maximum: number,
): string[] {
  if (!Array.isArray(values) || values.length < minimum || values.length > maximum) {
    throw new TypeError(`${name} must contain between ${minimum} and ${maximum} values.`)
  }
  const normalized = values.map((value) => {
    if (typeof value !== 'string') throw new TypeError(`${name} values must be strings.`)
    const trimmed = value.trim()
    if (!trimmed || [...trimmed].length > 200) {
      throw new TypeError(`${name} values must contain between 1 and 200 characters.`)
    }
    return trimmed
  })
  if (new Set(normalized).size !== normalized.length) {
    throw new TypeError(`${name} values must be unique.`)
  }
  return normalized
}

function normalizeGlossaryEntries(entries: GlossaryEntry[]): GlossaryEntry[] {
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > 500) {
    throw new TypeError('entries must contain between 1 and 500 glossary entries.')
  }
  return entries.map((entry) => {
    if (!isRecord(entry)) throw new TypeError('glossary entries must be objects.')
    const canonicalForm =
      typeof entry.canonical_form === 'string' ? entry.canonical_form.trim() : ''
    const language = typeof entry.language === 'string' ? entry.language.trim() : ''
    if (!canonicalForm || [...canonicalForm].length > 200) {
      throw new TypeError('canonicalForm must contain between 1 and 200 characters.')
    }
    if (!/^(?:\*|[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*)$/.test(language)) {
      throw new TypeError('glossary language is invalid.')
    }
    if (!Number.isSafeInteger(entry.priority) || entry.priority < 1 || entry.priority > 1000) {
      throw new TypeError('glossary priority must be between 1 and 1000.')
    }
    const description = typeof entry.description === 'string' ? entry.description.trim() : ''
    if ([...description].length > 500) {
      throw new TypeError('glossary description must not exceed 500 characters.')
    }
    if (entry.regex !== undefined && typeof entry.regex !== 'boolean') {
      throw new TypeError('glossary regex must be a boolean.')
    }
    if (entry.case_sensitive !== undefined && typeof entry.case_sensitive !== 'boolean') {
      throw new TypeError('glossary caseSensitive must be a boolean.')
    }
    return {
      canonical_form: canonicalForm,
      aliases: normalizeGlossaryList(entry.aliases, 'aliases', 1, 50),
      language,
      ...(entry.context_terms === undefined
        ? {}
        : { context_terms: normalizeGlossaryList(entry.context_terms, 'contextTerms', 0, 50) }),
      ...(entry.forbidden_contexts === undefined
        ? {}
        : {
            forbidden_contexts: normalizeGlossaryList(
              entry.forbidden_contexts,
              'forbiddenContexts',
              0,
              50,
            ),
          }),
      ...(entry.regex === undefined ? {} : { regex: entry.regex }),
      ...(entry.case_sensitive === undefined ? {} : { case_sensitive: entry.case_sensitive }),
      priority: entry.priority,
      ...(description ? { description } : {}),
    }
  })
}

function normalizeGlossaryRequest(input: CreateGlossarySetRequest): CreateGlossarySetRequest {
  if (
    input.scope_type !== 'workspace' &&
    input.scope_type !== 'collection' &&
    input.scope_type !== 'asset'
  ) {
    throw new TypeError('scopeType must be workspace, collection, or asset.')
  }
  if (input.scope_type === 'workspace' && input.scope_id) {
    throw new TypeError('Workspace glossaries must not include a scopeId.')
  }
  if (input.scope_type !== 'workspace') {
    assertUuid(input.scope_id ?? '', 'scopeId')
  }
  if (input.state && input.state !== 'enabled' && input.state !== 'disabled') {
    throw new TypeError('state must be enabled or disabled.')
  }
  return {
    display_name: normalizeDisplayName(input.display_name),
    scope_type: input.scope_type,
    ...(input.scope_type === 'workspace' ? {} : { scope_id: input.scope_id }),
    ...(input.state ? { state: input.state } : {}),
    entries: normalizeGlossaryEntries(input.entries),
  }
}

const HTTP_HEADER_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/
const FORBIDDEN_LLM_HEADERS = new Set([
  'authorization',
  'content-length',
  'host',
  'transfer-encoding',
])

function canonicalHeaderName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .split('-')
    .map((part) => (part ? `${part[0]!.toUpperCase()}${part.slice(1)}` : part))
    .join('-')
}

function normalizeHeaderNames(values: string[] | undefined): string[] {
  if (values === undefined) return []
  if (!Array.isArray(values) || values.length > 20) {
    throw new TypeError('customHeaderNames must contain at most 20 values.')
  }
  const seen = new Set<string>()
  const normalized = values.map((value) => {
    if (typeof value !== 'string') throw new TypeError('custom header names must be strings.')
    const trimmed = value.trim()
    const key = trimmed.toLowerCase()
    if (
      !trimmed ||
      trimmed.length > 100 ||
      !HTTP_HEADER_NAME.test(trimmed) ||
      FORBIDDEN_LLM_HEADERS.has(key) ||
      seen.has(key)
    ) {
      throw new TypeError('custom header names must be unique, safe HTTP header names.')
    }
    seen.add(key)
    return canonicalHeaderName(trimmed)
  })
  return normalized.sort((left, right) => left.localeCompare(right))
}

function normalizeLLMConfig(providerId: LLMProviderId, input: LLMConfig): LLMConfig {
  const baseUrl = input.base_url?.trim() ?? ''
  const model = input.model.trim()
  const timeout = input.timeout.trim()
  const promptTemplate = input.prompt_template.trim()
  const headerNames = normalizeHeaderNames(input.custom_header_names)
  if (providerId === 'openai_compatible_llm') {
    let parsed: URL
    try {
      parsed = new URL(baseUrl)
    } catch {
      throw new TypeError('baseUrl must be an absolute HTTPS URL.')
    }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
      throw new TypeError('baseUrl must be an absolute HTTPS URL without embedded credentials.')
    }
  } else if (baseUrl || headerNames.length > 0 || model !== 'deterministic_glossary_v1') {
    throw new TypeError('Mock LLM requires its deterministic model and no endpoint or headers.')
  }
  if (!model || [...model].length > 256) {
    throw new TypeError('model must contain between 1 and 256 characters.')
  }
  if (!timeout || timeout.length > 32) throw new TypeError('timeout is invalid.')
  if (
    !Number.isSafeInteger(input.concurrency) ||
    input.concurrency < 1 ||
    input.concurrency > 128
  ) {
    throw new TypeError('concurrency must be between 1 and 128.')
  }
  if (!Number.isFinite(input.temperature) || input.temperature < 0 || input.temperature > 1) {
    throw new TypeError('temperature must be between 0 and 1.')
  }
  if (
    !Number.isSafeInteger(input.context_limit) ||
    input.context_limit < 1_000 ||
    input.context_limit > 1_000_000
  ) {
    throw new TypeError('contextLimit must be between 1000 and 1000000.')
  }
  if (input.structured_output !== true) throw new TypeError('structuredOutput must be true.')
  if (!promptTemplate || [...promptTemplate].length > 8_000) {
    throw new TypeError('promptTemplate must contain between 1 and 8000 characters.')
  }
  if (
    input.auto_approval_policy !== 'never' &&
    input.auto_approval_policy !== 'validated_glossary_only'
  ) {
    throw new TypeError('autoApprovalPolicy is invalid.')
  }
  if (input.default_glossary_id) {
    assertUuid(input.default_glossary_id, 'defaultGlossaryId')
  }
  return {
    ...(baseUrl ? { base_url: baseUrl.replace(/\/$/, '') } : {}),
    model,
    ...(headerNames.length ? { custom_header_names: headerNames } : {}),
    timeout,
    concurrency: input.concurrency,
    temperature: input.temperature,
    context_limit: input.context_limit,
    structured_output: true,
    prompt_template: promptTemplate,
    ...(input.default_glossary_id ? { default_glossary_id: input.default_glossary_id.trim() } : {}),
    auto_approval_policy: input.auto_approval_policy,
  }
}

function normalizeLLMCredentials(
  providerId: LLMProviderId,
  credentials: LLMCredentials | undefined,
): LLMCredentials | undefined {
  if (providerId === 'mock_llm') {
    if (credentials !== undefined) throw new TypeError('Mock LLM does not accept credentials.')
    return undefined
  }
  if (!credentials || !isRecord(credentials)) {
    throw new TypeError('OpenAI-compatible LLM requires credentials.')
  }
  const keys = Object.keys(credentials)
  if (keys.some((key) => key !== 'api_key' && key !== 'custom_headers')) {
    throw new TypeError('LLM credentials contain an unsupported field.')
  }
  const apiKey = typeof credentials.api_key === 'string' ? credentials.api_key.trim() : ''
  if (apiKey.length < 8 || apiKey.length > 4_096 || /[\0\r\n]/.test(apiKey)) {
    throw new TypeError('apiKey must contain between 8 and 4096 safe characters.')
  }
  const rawHeaders = credentials.custom_headers
  if (rawHeaders !== undefined && !isRecord(rawHeaders)) {
    throw new TypeError('customHeaders must be an object.')
  }
  const headerEntries = Object.entries(rawHeaders ?? {})
  if (headerEntries.length > 20)
    throw new TypeError('customHeaders must contain at most 20 values.')
  const normalizedHeaders: Record<string, string> = {}
  const seen = new Set<string>()
  for (const [name, value] of headerEntries) {
    const trimmedName = name.trim()
    const key = trimmedName.toLowerCase()
    if (
      !trimmedName ||
      trimmedName.length > 100 ||
      !HTTP_HEADER_NAME.test(trimmedName) ||
      FORBIDDEN_LLM_HEADERS.has(key) ||
      seen.has(key) ||
      typeof value !== 'string' ||
      value.length > 4_096 ||
      /[\0\r\n]/.test(value)
    ) {
      throw new TypeError('customHeaders must contain unique, safe HTTP header values.')
    }
    seen.add(key)
    normalizedHeaders[canonicalHeaderName(trimmedName)] = value
  }
  return {
    api_key: apiKey,
    ...(headerEntries.length ? { custom_headers: normalizedHeaders } : {}),
  }
}

function headersMatch(config: LLMConfig, credentials: LLMCredentials): boolean {
  const names = (config.custom_header_names ?? []).map((name) => name.toLowerCase()).sort()
  const credentialNames = Object.keys(credentials.custom_headers ?? {})
    .map((name) => name.toLowerCase())
    .sort()
  return (
    names.length === credentialNames.length &&
    names.every((name, index) => name === credentialNames[index])
  )
}

function normalizeLLMProfileRequest(input: CreateLLMProfileRequest): CreateLLMProfileRequest {
  const config = normalizeLLMConfig(input.provider_id, input.config)
  const credentials = normalizeLLMCredentials(input.provider_id, input.credentials)
  if (input.state && input.state !== 'enabled' && input.state !== 'disabled') {
    throw new TypeError('state must be enabled or disabled.')
  }
  if (
    input.priority !== undefined &&
    (!Number.isSafeInteger(input.priority) || input.priority < 1 || input.priority > 1000)
  ) {
    throw new TypeError('priority must be between 1 and 1000.')
  }
  const base = {
    display_name: normalizeDisplayName(input.display_name),
    config,
    ...(input.state ? { state: input.state } : {}),
    ...(input.priority === undefined ? {} : { priority: input.priority }),
  }
  if (input.provider_id === 'mock_llm') return { ...base, provider_id: 'mock_llm' }
  if (!credentials || !headersMatch(config, credentials)) {
    throw new TypeError('customHeaderNames must match encrypted customHeaders exactly.')
  }
  return { ...base, provider_id: 'openai_compatible_llm', credentials }
}

function normalizeLLMProfileUpdate(
  providerId: LLMProviderId,
  input: UpdateLLMProfileRequest,
): UpdateLLMProfileRequest {
  if (Object.keys(input).length === 0) {
    throw new TypeError('LLM profile update must contain at least one field.')
  }
  if (input.state && input.state !== 'enabled' && input.state !== 'disabled') {
    throw new TypeError('state must be enabled or disabled.')
  }
  if (
    input.priority !== undefined &&
    (!Number.isSafeInteger(input.priority) || input.priority < 1 || input.priority > 1000)
  ) {
    throw new TypeError('priority must be between 1 and 1000.')
  }
  const config =
    input.config === undefined ? undefined : normalizeLLMConfig(providerId, input.config)
  const credentials =
    input.credentials === undefined
      ? undefined
      : normalizeLLMCredentials(providerId, input.credentials)
  if (config && credentials && !headersMatch(config, credentials)) {
    throw new TypeError('customHeaderNames must match encrypted customHeaders exactly.')
  }
  return {
    ...(input.display_name === undefined
      ? {}
      : { display_name: normalizeDisplayName(input.display_name) }),
    ...(config === undefined ? {} : { config }),
    ...(credentials === undefined ? {} : { credentials }),
    ...(input.state === undefined ? {} : { state: input.state }),
    ...(input.priority === undefined ? {} : { priority: input.priority }),
  }
}

function normalizeCreateAssetRequest(input: CreateAssetRequest): CreateAssetRequest {
  return {
    title: normalizeTitle(input.title),
    language: assertLanguage(input.language),
  }
}

function normalizeAssetSearchQuery(value = ''): string {
  const query = value.trim()
  if ([...query].length > 200 || /\p{Cc}/u.test(query)) {
    throw new TypeError('query must contain at most 200 characters without control characters.')
  }
  return query
}

function normalizeAssetListDate(value: string | undefined, name: string): string | undefined {
  if (value === undefined) return undefined
  const normalized = value.trim()
  const parsed = new Date(normalized)
  if (!normalized || Number.isNaN(parsed.getTime())) {
    throw new TypeError(`${name} must be a valid date-time.`)
  }
  return parsed.toISOString()
}

function normalizeTagIds(values: string[]): string[] {
  if (values.length < 1 || values.length > 100) {
    throw new TypeError('tagIds must contain between 1 and 100 values.')
  }
  const normalized = values.map((value) => assertUuid(value, 'tagId'))
  if (new Set(normalized).size !== normalized.length) {
    throw new TypeError('tagIds must contain unique values.')
  }
  return normalized
}

function assertListLimit(value: number | undefined, defaultValue: number): number {
  const limit = value ?? defaultValue
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new TypeError('limit must be an integer between 1 and 100.')
  }
  return limit
}

function assertListCursor(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined
  }
  if (value.length < 1 || value.length > 1024 || value.trim() !== value || /\p{Cc}/u.test(value)) {
    throw new TypeError('cursor must contain 1 to 1024 safe characters.')
  }
  return value
}

function normalizeOperationsFilter(value: string | undefined, name: string): string | undefined {
  if (value === undefined) return undefined
  const normalized = value.trim()
  if (!normalized) return undefined
  if (!/^[a-z][a-z0-9_.]{0,99}$/.test(normalized)) {
    throw new TypeError(`${name} must be a lowercase operations identifier.`)
  }
  return normalized
}

function assertOperationsJobState(
  value: OperationsJobState | undefined,
): OperationsJobState | undefined {
  if (value === undefined) return undefined
  if (!['queued', 'running', 'retry_wait', 'succeeded', 'failed', 'cancelled'].includes(value)) {
    throw new TypeError('state must be a supported operations job state.')
  }
  return value
}

function assertOperationsActorType(
  value: OperationsAuditActorType | undefined,
): OperationsAuditActorType | undefined {
  if (value === undefined) return undefined
  if (!['user', 'agent', 'system'].includes(value)) {
    throw new TypeError('actorType must be user, agent, or system.')
  }
  return value
}

function assertMemberRole(value: MemberRole | undefined): MemberRole | undefined {
  if (value === undefined) return undefined
  if (!MEMBER_ROLES.includes(value)) {
    throw new TypeError('role must be a supported workspace member role.')
  }
  return value
}

function assertMemberStatus(value: MemberStatus | undefined): MemberStatus | undefined {
  if (value === undefined) return undefined
  if (!MEMBER_STATUSES.includes(value)) {
    throw new TypeError('status must be active or disabled.')
  }
  return value
}

function normalizeCreateMemberRequest(input: CreateMemberRequest): CreateMemberRequest {
  const passwordLength = [...input.password].length
  if (passwordLength < 12 || passwordLength > 1024) {
    throw new TypeError('password must contain between 12 and 1024 characters.')
  }
  return {
    email: normalizeEmail(input.email).toLocaleLowerCase('en-US'),
    password: input.password,
    role: assertMemberRole(input.role)!,
  }
}

function normalizeUpdateMemberRequest(input: UpdateMemberRequest): UpdateMemberRequest {
  const role = assertMemberRole(input.role)
  const status = assertMemberStatus(input.status)
  if (role === undefined && status === undefined) {
    throw new TypeError('membership update must include role or status.')
  }
  return {
    ...(role ? { role } : {}),
    ...(status ? { status } : {}),
  }
}

function normalizeWorkspaceName(value: string): string {
  const normalized = value.trim()
  const length = [...normalized].length
  if (length < 1 || length > 200 || /\p{Cc}/u.test(normalized)) {
    throw new TypeError('workspace name must contain between 1 and 200 safe characters.')
  }
  return normalized
}

function listPath(path: string, parameters: URLSearchParams): string {
  const query = parameters.toString()
  return query ? `${path}?${query}` : path
}

function normalizeUpdateAssetMetadataRequest(
  input: UpdateAssetMetadataRequest,
): UpdateAssetMetadataRequest {
  return {
    title: normalizeTitle(input.title),
    language: assertLanguage(input.language),
    collection_id:
      input.collection_id === null ? null : assertUuid(input.collection_id, 'collectionId'),
  }
}

function normalizeAnnotationRequest(input: CreateAnnotationRequest): CreateAnnotationRequest {
  if (input.kind !== 'bookmark' && input.kind !== 'note') {
    throw new TypeError('annotation kind must be bookmark or note.')
  }
  if (!Number.isSafeInteger(input.start_ms) || input.start_ms < 0) {
    throw new TypeError('annotation startMs must be a non-negative integer.')
  }
  if (
    input.end_ms !== undefined &&
    input.end_ms !== null &&
    (!Number.isSafeInteger(input.end_ms) || input.end_ms <= input.start_ms)
  ) {
    throw new TypeError('annotation endMs must be an integer greater than startMs.')
  }
  const body = input.body.trim()
  if (input.kind === 'note' && !body) {
    throw new TypeError('note annotations require a body.')
  }
  if ([...body].length > 4_000) {
    throw new TypeError('annotation body must contain at most 4000 characters.')
  }
  for (const character of body) {
    if (/\p{Cc}/u.test(character) && !['\n', '\r', '\t'].includes(character)) {
      throw new TypeError('annotation body contains an unsupported control character.')
    }
  }
  return {
    kind: input.kind,
    start_ms: input.start_ms,
    ...(input.end_ms === undefined ? {} : { end_ms: input.end_ms }),
    body,
  }
}

function assertTranscriptExportFormat(value: string): TranscriptExportFormat {
  if (!['json', 'markdown', 'srt', 'vtt'].includes(value)) {
    throw new TypeError('export format must be json, markdown, srt, or vtt.')
  }
  return value as TranscriptExportFormat
}

function normalizeCreateUploadRequest(input: CreateUploadRequest): CreateUploadRequest {
  assertUuid(input.asset_id, 'assetId')
  if (
    input.filename.length < 1 ||
    input.filename.length > 255 ||
    /[/\\\u0000-\u001f\u007f]/.test(input.filename)
  ) {
    throw new TypeError('filename must be 1 to 255 characters without path separators.')
  }
  if (
    input.mime_type !== 'audio/wav' &&
    input.mime_type !== 'audio/x-wav' &&
    input.mime_type !== 'audio/mp4'
  ) {
    throw new TypeError('mimeType must be audio/wav, audio/x-wav, or audio/mp4.')
  }
  if (
    !Number.isSafeInteger(input.size_bytes) ||
    input.size_bytes < 44 ||
    input.size_bytes > MAX_UPLOAD_SIZE
  ) {
    throw new TypeError(`sizeBytes must be an integer between 44 and ${MAX_UPLOAD_SIZE}.`)
  }
  assertSha256(input.sha256, 'sha256')
  return { ...input }
}

function assertPartNumber(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 10_000) {
    throw new TypeError('partNumber must be an integer between 1 and 10000.')
  }
  return value
}

function assertPartBody(body: Blob | ArrayBuffer): Blob | ArrayBuffer {
  const size = body instanceof Blob ? body.size : body.byteLength
  if (size < 1 || size > UPLOAD_PART_SIZE) {
    throw new TypeError(`body must contain between 1 and ${UPLOAD_PART_SIZE} bytes.`)
  }
  return body
}

export class ApiClient {
  constructor(
    private readonly baseUrl = apiConfig.baseUrl,
    private readonly fetcher: Fetcher = (input, init) => fetch(input, init),
  ) {}

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers)
    headers.set('Accept', 'application/json')

    if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }

    const response = await this.fetcher(`${this.baseUrl}${relativeApiPath(path)}`, {
      ...init,
      credentials: 'include',
      headers,
    })
    const payload = await readJson(response)

    if (!response.ok) {
      const error = readApiError(payload)
      throw new ApiError(error?.message ?? `Request failed with status ${response.status}.`, {
        status: response.status,
        code: error?.code,
        requestId: error?.request_id ?? response.headers.get('x-request-id') ?? undefined,
      })
    }

    return payload as T
  }

  async getCapabilities(): Promise<ServerCapabilities> {
    const payload = await this.request<unknown>('system/capabilities')
    const capabilities = readCapabilities(payload)
    if (!capabilities) {
      throw new TypeError('Server returned an invalid capabilities document.')
    }
    return capabilities
  }

  login(email: string, password: string, deviceName = 'VoiceAsset Console'): Promise<WebSession> {
    return this.request<WebSession>('auth/sessions', {
      method: 'POST',
      body: JSON.stringify({
        email: normalizeEmail(email),
        password: assertPassword(password),
        device_name: normalizeDeviceName(deviceName),
      }),
    })
  }

  getSession(): Promise<CurrentSession> {
    return this.request<CurrentSession>('auth/session')
  }

  refreshSession(): Promise<WebSession> {
    return this.request<WebSession>('auth/session/refresh', { method: 'POST' })
  }

  async logout(): Promise<void> {
    await this.request<unknown>('auth/session', { method: 'DELETE' })
  }

  async changePassword(input: ChangePasswordRequest): Promise<void> {
    await this.request<unknown>('auth/password', {
      method: 'PATCH',
      body: JSON.stringify(normalizeChangePasswordRequest(input)),
    })
  }

  listDeviceSessions(): Promise<DeviceSessionList> {
    return this.request<DeviceSessionList>('auth/device-sessions')
  }

  async createPairingSession(): Promise<PairingSession> {
    const payload = await this.request<unknown>('auth/pairing-sessions', { method: 'POST' })
    const pairingSession = readPairingSession(payload)
    if (!pairingSession) {
      throw new TypeError('Server returned an invalid device-pairing payload.')
    }
    return pairingSession
  }

  async revokeDeviceSession(deviceSessionId: string): Promise<void> {
    await this.request<unknown>(
      `auth/device-sessions/${assertUuid(deviceSessionId, 'deviceSessionId')}`,
      { method: 'DELETE' },
    )
  }

  listAPIKeys(): Promise<APIKeyList> {
    return this.request<APIKeyList>('api-keys')
  }

  listAdminWebhooks(): Promise<WebhookList> {
    return this.request<WebhookList>('admin/webhooks')
  }

  createAdminWebhook(input: CreateWebhookRequest): Promise<WebhookSecret> {
    return this.request<WebhookSecret>('admin/webhooks', {
      method: 'POST',
      body: JSON.stringify(normalizeCreateWebhookRequest(input)),
    })
  }

  updateAdminWebhook(
    webhookId: string,
    version: number,
    input: UpdateWebhookRequest,
  ): Promise<Webhook> {
    return this.request<Webhook>(`admin/webhooks/${assertUuid(webhookId, 'webhookId')}`, {
      method: 'PATCH',
      headers: { 'If-Match': `"${assertResourceVersion(version, 'version')}"` },
      body: JSON.stringify(normalizeUpdateWebhookRequest(input)),
    })
  }

  rotateAdminWebhookSecret(webhookId: string, version: number): Promise<WebhookSecret> {
    return this.request<WebhookSecret>(
      `admin/webhooks/${assertUuid(webhookId, 'webhookId')}/rotate-secret`,
      {
        method: 'POST',
        headers: { 'If-Match': `"${assertResourceVersion(version, 'version')}"` },
      },
    )
  }

  testAdminWebhook(webhookId: string): Promise<WebhookDelivery> {
    return this.request<WebhookDelivery>(
      `admin/webhooks/${assertUuid(webhookId, 'webhookId')}/test`,
      { method: 'POST' },
    )
  }

  listAdminWebhookDeliveries(webhookId: string, limit = 50): Promise<WebhookDeliveryList> {
    const parameters = new URLSearchParams({ limit: String(assertListLimit(limit, 50)) })
    return this.request<WebhookDeliveryList>(
      listPath(`admin/webhooks/${assertUuid(webhookId, 'webhookId')}/deliveries`, parameters),
    )
  }

  listAdminJobs(options: ListOperationsJobsOptions = {}): Promise<OperationsJobList> {
    const parameters = new URLSearchParams()
    parameters.set('limit', String(assertListLimit(options.limit, 50)))
    const cursor = assertListCursor(options.cursor)
    if (cursor) parameters.set('cursor', cursor)
    const state = assertOperationsJobState(options.state)
    if (state) parameters.set('state', state)
    const kind = normalizeOperationsFilter(options.kind, 'kind')
    if (kind) parameters.set('kind', kind)
    return this.request<OperationsJobList>(listPath('admin/jobs', parameters))
  }

  listAdminAuditLogs(options: ListOperationsAuditOptions = {}): Promise<OperationsAuditList> {
    const parameters = new URLSearchParams()
    parameters.set('limit', String(assertListLimit(options.limit, 50)))
    const cursor = assertListCursor(options.cursor)
    if (cursor) parameters.set('cursor', cursor)
    const actorType = assertOperationsActorType(options.actorType)
    if (actorType) parameters.set('actor_type', actorType)
    const action = normalizeOperationsFilter(options.action, 'action')
    if (action) parameters.set('action', action)
    const targetType = normalizeOperationsFilter(options.targetType, 'targetType')
    if (targetType) parameters.set('target_type', targetType)
    return this.request<OperationsAuditList>(listPath('admin/audit-logs', parameters))
  }

  getAdminSystemStatus(): Promise<OperationsSystemStatus> {
    return this.request<OperationsSystemStatus>('admin/system-status')
  }

  getAdminSystemSettings(): Promise<DeploymentSystemSettings> {
    return this.request<DeploymentSystemSettings>('admin/system-settings')
  }

  getAdminWorkspace(): Promise<WorkspaceProfile> {
    return this.request<WorkspaceProfile>('admin/workspace')
  }

  updateAdminWorkspace(version: number, input: UpdateWorkspaceRequest): Promise<WorkspaceProfile> {
    return this.request<WorkspaceProfile>('admin/workspace', {
      method: 'PATCH',
      headers: { 'If-Match': `"${assertResourceVersion(version, 'version')}"` },
      body: JSON.stringify({ name: normalizeWorkspaceName(input.name) }),
    })
  }

  listAdminMembers(options: ListMembersOptions = {}): Promise<MemberList> {
    const parameters = new URLSearchParams()
    parameters.set('limit', String(assertListLimit(options.limit, 50)))
    const cursor = assertListCursor(options.cursor)
    if (cursor) parameters.set('cursor', cursor)
    const role = assertMemberRole(options.role)
    if (role) parameters.set('role', role)
    const status = assertMemberStatus(options.status)
    if (status) parameters.set('status', status)
    return this.request<MemberList>(listPath('admin/members', parameters))
  }

  createAdminMember(input: CreateMemberRequest): Promise<Member> {
    return this.request<Member>('admin/members', {
      method: 'POST',
      body: JSON.stringify(normalizeCreateMemberRequest(input)),
    })
  }

  updateAdminMember(
    memberId: string,
    version: number,
    input: UpdateMemberRequest,
  ): Promise<Member> {
    return this.request<Member>(`admin/members/${assertUuid(memberId, 'memberId')}`, {
      method: 'PATCH',
      headers: { 'If-Match': `"${assertResourceVersion(version, 'version')}"` },
      body: JSON.stringify(normalizeUpdateMemberRequest(input)),
    })
  }

  createAPIKey(input: CreateAPIKeyRequest): Promise<CreatedAPIKey> {
    return this.request<CreatedAPIKey>('api-keys', {
      method: 'POST',
      body: JSON.stringify(normalizeAPIKeyRequest(input)),
    })
  }

  revokeAPIKey(apiKeyId: string): Promise<APIKey> {
    return this.request<APIKey>(`api-keys/${assertUuid(apiKeyId, 'apiKeyId')}`, {
      method: 'DELETE',
    })
  }

  createAsset(input: CreateAssetRequest, idempotencyKey: string): Promise<Asset> {
    return this.request<Asset>('assets', {
      method: 'POST',
      headers: { 'Idempotency-Key': assertIdempotencyKey(idempotencyKey) },
      body: JSON.stringify(normalizeCreateAssetRequest(input)),
    })
  }

  listAssets(options: ListAssetsOptions = {}): Promise<AssetList> {
    const parameters = new URLSearchParams()
    const query = normalizeAssetSearchQuery(options.query)
    if (query) parameters.set('q', query)
    if (options.collectionId) {
      parameters.set('collection_id', assertUuid(options.collectionId, 'collectionId'))
    }
    if (options.tagId) parameters.set('tag_id', assertUuid(options.tagId, 'tagId'))
    if (options.status) {
      if (
        !['draft', 'uploading', 'processing', 'ready', 'failed', 'trashed'].includes(options.status)
      ) {
        throw new TypeError('status must be a supported asset status.')
      }
      parameters.set('status', options.status)
    }
    if (options.providerId) {
      if (!ASR_PROVIDER_IDS.includes(options.providerId)) {
        throw new TypeError('providerId must be a supported ASR provider.')
      }
      parameters.set('provider_id', options.providerId)
    }
    const speaker = normalizeAssetSearchQuery(options.speaker)
    if (speaker) parameters.set('speaker', speaker)
    const createdFrom = normalizeAssetListDate(options.createdFrom, 'createdFrom')
    const createdBefore = normalizeAssetListDate(options.createdBefore, 'createdBefore')
    if (createdFrom && createdBefore && createdFrom >= createdBefore) {
      throw new TypeError('createdFrom must be earlier than createdBefore.')
    }
    if (createdFrom) parameters.set('created_from', createdFrom)
    if (createdBefore) parameters.set('created_before', createdBefore)
    parameters.set('limit', String(assertListLimit(options.limit, 20)))
    const cursor = assertListCursor(options.cursor)
    if (cursor) parameters.set('cursor', cursor)
    return this.request<AssetList>(listPath('assets', parameters))
  }

  getAsset(assetId: string): Promise<Asset> {
    return this.request<Asset>(`assets/${assertUuid(assetId, 'assetId')}`)
  }

  updateAssetMetadata(
    assetId: string,
    version: number,
    input: UpdateAssetMetadataRequest,
  ): Promise<Asset> {
    return this.request<Asset>(`assets/${assertUuid(assetId, 'assetId')}/metadata`, {
      method: 'PUT',
      headers: { 'If-Match': `"${assertResourceVersion(version, 'version')}"` },
      body: JSON.stringify(normalizeUpdateAssetMetadataRequest(input)),
    })
  }

  trashAsset(assetId: string, version: number): Promise<Asset> {
    return this.request<Asset>(`assets/${assertUuid(assetId, 'assetId')}`, {
      method: 'DELETE',
      headers: { 'If-Match': `"${assertResourceVersion(version, 'version')}"` },
    })
  }

  restoreAsset(assetId: string, version: number): Promise<Asset> {
    return this.request<Asset>(`assets/${assertUuid(assetId, 'assetId')}/restore`, {
      method: 'POST',
      headers: { 'If-Match': `"${assertResourceVersion(version, 'version')}"` },
    })
  }

  requestAssetPurge(
    assetId: string,
    version: number,
    confirmation: string,
    idempotencyKey: string,
  ): Promise<AssetPurgeJob> {
    const canonicalAssetId = assertUuid(assetId, 'assetId')
    if (confirmation !== canonicalAssetId) {
      throw new TypeError('confirmation must exactly match assetId.')
    }
    return this.request<AssetPurgeJob>(`assets/${canonicalAssetId}/purge`, {
      method: 'POST',
      headers: {
        'Idempotency-Key': assertIdempotencyKey(idempotencyKey),
        'If-Match': `"${assertResourceVersion(version, 'version')}"`,
      },
      body: JSON.stringify({ confirmation }),
    })
  }

  getAssetPurgeJob(jobId: string): Promise<AssetPurgeJob> {
    return this.request<AssetPurgeJob>(`asset-purge-jobs/${assertUuid(jobId, 'assetPurgeJobId')}`)
  }

  listCollections(options: ListCollectionsOptions = {}): Promise<CollectionList> {
    const parameters = new URLSearchParams()
    parameters.set('limit', String(assertListLimit(options.limit, 50)))
    const cursor = assertListCursor(options.cursor)
    if (cursor) parameters.set('cursor', cursor)
    return this.request<CollectionList>(listPath('collections', parameters))
  }

  listTags(options: ListTagsOptions = {}): Promise<TagList> {
    const parameters = new URLSearchParams()
    parameters.set('limit', String(assertListLimit(options.limit, 50)))
    const cursor = assertListCursor(options.cursor)
    if (cursor) parameters.set('cursor', cursor)
    return this.request<TagList>(listPath('tags', parameters))
  }

  listAssetTags(assetId: string, options: ListTagsOptions = {}): Promise<TagList> {
    const parameters = new URLSearchParams()
    parameters.set('limit', String(assertListLimit(options.limit, 50)))
    const cursor = assertListCursor(options.cursor)
    if (cursor) parameters.set('cursor', cursor)
    return this.request<TagList>(
      listPath(`assets/${assertUuid(assetId, 'assetId')}/tags`, parameters),
    )
  }

  addAssetTags(assetId: string, tagIds: string[]): Promise<TagMutationResult> {
    return this.request<TagMutationResult>(`assets/${assertUuid(assetId, 'assetId')}/tags`, {
      method: 'POST',
      body: JSON.stringify({ tag_ids: normalizeTagIds(tagIds) }),
    })
  }

  removeAssetTags(assetId: string, tagIds: string[]): Promise<TagMutationResult> {
    return this.request<TagMutationResult>(`assets/${assertUuid(assetId, 'assetId')}/tags`, {
      method: 'DELETE',
      body: JSON.stringify({ tag_ids: normalizeTagIds(tagIds) }),
    })
  }

  listAssetAnnotations(
    assetId: string,
    options: ListAnnotationsOptions = {},
  ): Promise<AnnotationList> {
    const parameters = new URLSearchParams()
    parameters.set('limit', String(assertListLimit(options.limit, 50)))
    const cursor = assertListCursor(options.cursor)
    if (cursor) parameters.set('cursor', cursor)
    return this.request<AnnotationList>(
      listPath(`assets/${assertUuid(assetId, 'assetId')}/annotations`, parameters),
    )
  }

  createAssetAnnotation(assetId: string, input: CreateAnnotationRequest): Promise<Annotation> {
    return this.request<Annotation>(`assets/${assertUuid(assetId, 'assetId')}/annotations`, {
      method: 'POST',
      body: JSON.stringify(normalizeAnnotationRequest(input)),
    })
  }

  getAssetProcessingStatus(assetId: string): Promise<ProcessingStatus> {
    return this.request<ProcessingStatus>(
      `assets/${assertUuid(assetId, 'assetId')}/processing-status`,
    )
  }

  createUpload(input: CreateUploadRequest, idempotencyKey: string): Promise<UploadSession> {
    return this.request<UploadSession>('uploads', {
      method: 'POST',
      headers: { 'Idempotency-Key': assertIdempotencyKey(idempotencyKey) },
      body: JSON.stringify(normalizeCreateUploadRequest(input)),
    })
  }

  getUpload(uploadId: string): Promise<UploadSession> {
    return this.request<UploadSession>(`uploads/${assertUuid(uploadId, 'uploadId')}`)
  }

  putUploadPart(
    uploadId: string,
    partNumber: number,
    body: Blob | ArrayBuffer,
    partSha256: string,
  ): Promise<UploadPart> {
    return this.request<UploadPart>(
      `uploads/${assertUuid(uploadId, 'uploadId')}/parts/${assertPartNumber(partNumber)}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Part-SHA256': assertSha256(partSha256, 'partSha256'),
        },
        body: assertPartBody(body),
      },
    )
  }

  completeUpload(uploadId: string): Promise<UploadSession> {
    return this.request<UploadSession>(`uploads/${assertUuid(uploadId, 'uploadId')}/complete`, {
      method: 'POST',
    })
  }

  createTranscription(assetId: string, idempotencyKey: string): Promise<TranscriptionJob> {
    return this.request<TranscriptionJob>(
      `assets/${assertUuid(assetId, 'assetId')}/transcriptions`,
      {
        method: 'POST',
        headers: { 'Idempotency-Key': assertIdempotencyKey(idempotencyKey) },
      },
    )
  }

  getJob(jobId: string): Promise<TranscriptionJob> {
    return this.request<TranscriptionJob>(`transcription-jobs/${assertUuid(jobId, 'jobId')}`)
  }

  listTranscripts(assetId: string): Promise<TranscriptList> {
    return this.request<TranscriptList>(`assets/${assertUuid(assetId, 'assetId')}/transcripts`)
  }

  getRevision(revisionId: string): Promise<TranscriptRevision> {
    return this.request<TranscriptRevision>(
      `transcript-revisions/${assertUuid(revisionId, 'revisionId')}`,
    )
  }

  listASRProviderCapabilities(): Promise<ASRProviderCapabilitiesList> {
    return this.request<ASRProviderCapabilitiesList>('asr/provider-capabilities')
  }

  listProviderProfiles(): Promise<ProviderProfileList> {
    return this.request<ProviderProfileList>('provider-profiles')
  }

  createProviderProfile(input: CreateProviderProfileRequest): Promise<ProviderProfile> {
    return this.request<ProviderProfile>('provider-profiles', {
      method: 'POST',
      body: JSON.stringify(normalizeProviderProfileRequest(input)),
    })
  }

  updateProviderProfile(
    profileId: string,
    providerId: ASRProviderId,
    version: number,
    input: UpdateProviderProfileRequest,
  ): Promise<ProviderProfile> {
    return this.request<ProviderProfile>(
      `provider-profiles/${assertUuid(profileId, 'profileId')}`,
      {
        method: 'PATCH',
        headers: { 'If-Match': `"${assertResourceVersion(version, 'version')}"` },
        body: JSON.stringify(normalizeProviderProfileUpdate(providerId, input)),
      },
    )
  }

  checkProviderProfileHealth(profileId: string): Promise<ProviderHealth> {
    return this.request<ProviderHealth>(
      `provider-profiles/${assertUuid(profileId, 'profileId')}/health`,
      { method: 'POST' },
    )
  }

  listHotwordSets(): Promise<HotwordSetList> {
    return this.request<HotwordSetList>('hotword-sets')
  }

  createHotwordSet(input: CreateHotwordSetRequest): Promise<HotwordSet> {
    return this.request<HotwordSet>('hotword-sets', {
      method: 'POST',
      body: JSON.stringify(normalizeHotwordSetRequest(input)),
    })
  }

  createHotwordSetVersion(
    hotwordSetId: string,
    resourceVersion: number,
    input: AddHotwordSetVersionRequest,
  ): Promise<HotwordSet> {
    return this.request<HotwordSet>(
      `hotword-sets/${assertUuid(hotwordSetId, 'hotwordSetId')}/versions`,
      {
        method: 'POST',
        headers: {
          'If-Match': `"${assertResourceVersion(resourceVersion, 'resourceVersion')}"`,
        },
        body: JSON.stringify({ entries: normalizeHotwordEntries(input.entries) }),
      },
    )
  }

  updateHotwordSet(
    hotwordSetId: string,
    resourceVersion: number,
    state: ResourceState,
  ): Promise<HotwordSet> {
    if (state !== 'enabled' && state !== 'disabled') {
      throw new TypeError('state must be enabled or disabled.')
    }
    return this.request<HotwordSet>(`hotword-sets/${assertUuid(hotwordSetId, 'hotwordSetId')}`, {
      method: 'PATCH',
      headers: { 'If-Match': `"${assertResourceVersion(resourceVersion, 'resourceVersion')}"` },
      body: JSON.stringify({ state }),
    })
  }

  listGlossarySets(): Promise<GlossarySetList> {
    return this.request<GlossarySetList>('glossary-sets')
  }

  createGlossarySet(input: CreateGlossarySetRequest): Promise<GlossarySet> {
    return this.request<GlossarySet>('glossary-sets', {
      method: 'POST',
      body: JSON.stringify(normalizeGlossaryRequest(input)),
    })
  }

  createGlossarySetVersion(
    glossarySetId: string,
    resourceVersion: number,
    input: AddGlossarySetVersionRequest,
  ): Promise<GlossarySet> {
    return this.request<GlossarySet>(
      `glossary-sets/${assertUuid(glossarySetId, 'glossarySetId')}/versions`,
      {
        method: 'POST',
        headers: {
          'If-Match': `"${assertResourceVersion(resourceVersion, 'resourceVersion')}"`,
        },
        body: JSON.stringify({ entries: normalizeGlossaryEntries(input.entries) }),
      },
    )
  }

  updateGlossarySet(
    glossarySetId: string,
    resourceVersion: number,
    state: ResourceState,
  ): Promise<GlossarySet> {
    if (state !== 'enabled' && state !== 'disabled') {
      throw new TypeError('state must be enabled or disabled.')
    }
    return this.request<GlossarySet>(
      `glossary-sets/${assertUuid(glossarySetId, 'glossarySetId')}`,
      {
        method: 'PATCH',
        headers: {
          'If-Match': `"${assertResourceVersion(resourceVersion, 'resourceVersion')}"`,
        },
        body: JSON.stringify({ state }),
      },
    )
  }

  listLLMProviderCapabilities(): Promise<LLMCapabilitiesList> {
    return this.request<LLMCapabilitiesList>('llm/provider-capabilities')
  }

  listLLMProfiles(): Promise<LLMProfileList> {
    return this.request<LLMProfileList>('llm-profiles')
  }

  createLLMProfile(input: CreateLLMProfileRequest): Promise<LLMProfile> {
    return this.request<LLMProfile>('llm-profiles', {
      method: 'POST',
      body: JSON.stringify(normalizeLLMProfileRequest(input)),
    })
  }

  updateLLMProfile(
    profileId: string,
    providerId: LLMProviderId,
    version: number,
    input: UpdateLLMProfileRequest,
  ): Promise<LLMProfile> {
    return this.request<LLMProfile>(`llm-profiles/${assertUuid(profileId, 'profileId')}`, {
      method: 'PATCH',
      headers: { 'If-Match': `"${assertResourceVersion(version, 'version')}"` },
      body: JSON.stringify(normalizeLLMProfileUpdate(providerId, input)),
    })
  }

  checkLLMProfileHealth(profileId: string): Promise<LLMHealth> {
    return this.request<LLMHealth>(`llm-profiles/${assertUuid(profileId, 'profileId')}/health`, {
      method: 'POST',
    })
  }

  createCorrection(revisionId: string, idempotencyKey: string): Promise<TranscriptionJob> {
    return this.request<TranscriptionJob>(
      `transcript-revisions/${assertUuid(revisionId, 'revisionId')}/corrections`,
      {
        method: 'POST',
        headers: { 'Idempotency-Key': assertIdempotencyKey(idempotencyKey) },
      },
    )
  }

  createReview(revisionId: string, input: ReviewDecisionRequest): Promise<ReviewRecord> {
    if (
      (input.action === 'accept_change' || input.action === 'reject_change') &&
      (!Number.isSafeInteger(input.change_index) || input.change_index < 0)
    ) {
      throw new TypeError('changeIndex must be a non-negative integer.')
    }
    return this.request<ReviewRecord>(
      `transcript-revisions/${assertUuid(revisionId, 'revisionId')}/reviews`,
      { method: 'POST', body: JSON.stringify(input) },
    )
  }

  approveRevision(revisionId: string, acceptPending = false): Promise<ApprovalResult> {
    return this.request<ApprovalResult>(
      `transcript-revisions/${assertUuid(revisionId, 'revisionId')}/approve`,
      { method: 'POST', body: JSON.stringify({ accept_pending: acceptPending }) },
    )
  }

  createTranscriptExport(
    revisionId: string,
    format: TranscriptExportFormat,
  ): Promise<TranscriptExport> {
    return this.request<TranscriptExport>(
      `transcript-revisions/${assertUuid(revisionId, 'revisionId')}/exports`,
      {
        method: 'POST',
        body: JSON.stringify({ format: assertTranscriptExportFormat(format) }),
      },
    )
  }

  transcriptExportUrl(exportId: string): string {
    return `${this.baseUrl}/transcript-exports/${assertUuid(exportId, 'exportId')}`
  }

  audioUrl(assetId: string): string {
    return `${this.baseUrl}/assets/${assertUuid(assetId, 'assetId')}/audio`
  }

  waveformUrl(assetId: string): string {
    return `${this.baseUrl}/assets/${assertUuid(assetId, 'assetId')}/waveform`
  }
}

export const apiClient = new ApiClient()
