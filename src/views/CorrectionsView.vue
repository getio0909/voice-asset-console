<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

import { useAssetsStore } from '@/stores/assets'
import { useConsoleStore } from '@/stores/console'
import { useCorrectionsStore } from '@/stores/corrections'
import type { TranscriptExportFormat } from '@/api/client'

const route = useRoute()
const assetsStore = useAssetsStore()
const consoleStore = useConsoleStore()
const correctionsStore = useCorrectionsStore()

const glossaryName = ref('Platform corrections')
const canonicalForm = ref('')
const aliases = ref('')
const glossaryLanguage = ref('zh-CN')
const profileName = ref('Mock correction')
const defaultGlossaryId = ref('')
const sourceRevisionId = ref('')
const exportRevisionId = ref('')
const exportFormat = ref<TranscriptExportFormat>('markdown')

const canCorrect = computed(() => assetsStore.user?.scopes.includes('corrections:write') ?? false)
const canExport = computed(() => {
  const scopes = assetsStore.user?.scopes ?? []
  return scopes.includes('transcripts:read') && scopes.includes('metadata:write')
})

onMounted(async () => {
  const queryRevision = typeof route.query.revision === 'string' ? route.query.revision : ''
  sourceRevisionId.value = queryRevision || assetsStore.revision?.id || ''
  exportRevisionId.value = sourceRevisionId.value
  const authenticated =
    assetsStore.sessionStatus === 'authenticated' || (await assetsStore.restoreSession())
  if (authenticated) {
    await correctionsStore.loadConfiguration()
  }
})

watch(
  () => correctionsStore.approvedRevision?.id,
  (revisionId) => {
    if (revisionId) {
      exportRevisionId.value = revisionId
    }
  },
)

async function submitGlossary(): Promise<void> {
  const normalizedAliases = [
    ...new Set(
      aliases.value
        .split(',')
        .map((alias) => alias.trim())
        .filter(Boolean),
    ),
  ]
  const created = await correctionsStore.createGlossary({
    display_name: glossaryName.value,
    scope_type: 'workspace',
    state: 'enabled',
    entries: [
      {
        canonical_form: canonicalForm.value.trim(),
        aliases: normalizedAliases,
        language: glossaryLanguage.value.trim(),
        context_terms: [],
        forbidden_contexts: [],
        regex: false,
        case_sensitive: false,
        priority: 100,
        description: 'Created in VoiceAsset Console',
      },
    ],
  })
  if (created) {
    const latest = correctionsStore.glossaries[0]
    defaultGlossaryId.value = latest?.id ?? ''
    canonicalForm.value = ''
    aliases.value = ''
  }
}

async function submitProfile(): Promise<void> {
  await correctionsStore.createMockProfile(profileName.value, defaultGlossaryId.value || undefined)
}

async function submitCorrection(): Promise<void> {
  await correctionsStore.runCorrection(sourceRevisionId.value)
}

async function submitExport(): Promise<void> {
  await correctionsStore.createExport(exportRevisionId.value, exportFormat.value)
}

function exportLabel(format: TranscriptExportFormat): string {
  return {
    json: 'JSON',
    markdown: 'Markdown',
    srt: 'SRT',
    vtt: 'WebVTT',
  }[format]
}

function exportFilename(revisionId: string, format: TranscriptExportFormat): string {
  const extension = format === 'markdown' ? 'md' : format
  return `transcript-${revisionId}.${extension}`
}

function byteSizeLabel(bytes: number): string {
  return bytes < 1_024 ? `${bytes} B` : `${(bytes / 1_024).toFixed(1)} KiB`
}

function dateTimeLabel(value: string): string {
  return new Date(value).toLocaleString()
}
</script>

<template>
  <div class="page-stack">
    <header class="page-heading">
      <span class="eyebrow">Phase 3 workspace</span>
      <h1>Correction review</h1>
      <p>
        Configure an isolated Mock LLM and post-ASR glossary, then review structured changes before
        creating an immutable approved revision.
      </p>
    </header>

    <aside v-if="!consoleStore.isReady" class="connection-warning" role="status">
      <strong>Server compatibility: {{ consoleStore.apiStatus }}</strong>
      <span>{{
        consoleStore.compatibilityIssue ?? 'Waiting for the Phase 3 capability check.'
      }}</span>
    </aside>

    <section v-if="assetsStore.sessionStatus === 'checking'" class="workflow-panel" role="status">
      <span class="eyebrow">Session</span>
      <h2>Checking the secure web session</h2>
      <p>No provider secret or access token is stored in browser state.</p>
    </section>

    <section v-else-if="!assetsStore.isAuthenticated" class="empty-state">
      <span class="empty-state__mark" aria-hidden="true">03</span>
      <h2>Sign in before managing corrections</h2>
      <p>Use the Assets workspace to establish the same HttpOnly server session.</p>
      <RouterLink class="text-link" to="/assets">Go to secure sign in</RouterLink>
    </section>

    <template v-else>
      <section class="session-bar" aria-label="Current session">
        <div>
          <span class="eyebrow">Signed in</span>
          <strong>{{ assetsStore.user?.email }}</strong>
          <small>{{
            canCorrect ? 'Correction scope granted' : 'Missing corrections:write scope'
          }}</small>
        </div>
        <button
          class="button-secondary"
          type="button"
          :disabled="correctionsStore.loadingConfiguration"
          @click="correctionsStore.loadConfiguration()"
        >
          Refresh configuration
        </button>
      </section>

      <p v-if="correctionsStore.configurationError" class="error-message" role="alert">
        {{ correctionsStore.configurationError }}
      </p>

      <section class="configuration-grid" aria-label="Correction configuration">
        <article class="workflow-panel">
          <div class="section-heading">
            <div>
              <span class="eyebrow">Post-ASR vocabulary</span>
              <h2>Glossary</h2>
            </div>
            <span class="status-pill">{{ correctionsStore.glossaries.length }} sets</span>
          </div>
          <form class="form-stack" @submit.prevent="submitGlossary">
            <label class="field">
              <span>Set name</span>
              <input v-model="glossaryName" maxlength="100" required />
            </label>
            <label class="field">
              <span>Canonical form</span>
              <input v-model="canonicalForm" maxlength="200" required />
            </label>
            <label class="field">
              <span>Aliases</span>
              <input
                v-model="aliases"
                maxlength="1000"
                placeholder="容易云, 容易雲"
                aria-describedby="aliases-help"
                required
              />
              <small id="aliases-help">Separate exact aliases with commas.</small>
            </label>
            <label class="field">
              <span>Language</span>
              <input v-model="glossaryLanguage" maxlength="32" required />
            </label>
            <button
              type="submit"
              :disabled="!canCorrect || !canonicalForm.trim() || !aliases.trim()"
            >
              Create version 1
            </button>
          </form>
          <ul v-if="correctionsStore.glossaries.length" class="resource-list">
            <li v-for="glossary in correctionsStore.glossaries" :key="glossary.id">
              <strong>{{ glossary.display_name }}</strong>
              <span>v{{ glossary.current_version }} · {{ glossary.entries.length }} entries</span>
            </li>
          </ul>
        </article>

        <article class="workflow-panel">
          <div class="section-heading">
            <div>
              <span class="eyebrow">Deterministic provider</span>
              <h2>Mock LLM profile</h2>
            </div>
            <span class="status-pill">{{ correctionsStore.profiles.length }} profiles</span>
          </div>
          <form class="form-stack" @submit.prevent="submitProfile">
            <label class="field">
              <span>Profile name</span>
              <input v-model="profileName" maxlength="100" required />
            </label>
            <label class="field">
              <span>Default glossary</span>
              <select v-model="defaultGlossaryId">
                <option value="">Resolve by asset scope</option>
                <option
                  v-for="glossary in correctionsStore.glossaries"
                  :key="glossary.id"
                  :value="glossary.id"
                >
                  {{ glossary.display_name }} (v{{ glossary.current_version }})
                </option>
              </select>
            </label>
            <button type="submit" :disabled="!canCorrect || !profileName.trim()">
              Create enabled Mock profile
            </button>
          </form>
          <ul v-if="correctionsStore.profiles.length" class="resource-list">
            <li v-for="profile in correctionsStore.profiles" :key="profile.id">
              <span>
                <strong>{{ profile.display_name }}</strong>
                <small
                  >{{ profile.provider_id }} · {{ profile.state }} · v{{ profile.version }}</small
                >
              </span>
              <button
                class="button-secondary button-compact"
                type="button"
                @click="correctionsStore.checkProfile(profile.id)"
              >
                {{ correctionsStore.health[profile.id]?.status ?? 'Check health' }}
              </button>
            </li>
          </ul>
        </article>
      </section>

      <section class="workflow-panel" aria-labelledby="correction-title">
        <div class="section-heading">
          <div>
            <span class="eyebrow">Immutable proposal</span>
            <h2 id="correction-title">Run structured correction</h2>
          </div>
          <p>Use the normalized revision from Assets. The source remains unchanged.</p>
        </div>
        <form class="form-grid" @submit.prevent="submitCorrection">
          <label class="field">
            <span>Source revision ID</span>
            <input
              v-model.trim="sourceRevisionId"
              pattern="[0-9a-fA-F-]{36}"
              autocomplete="off"
              required
            />
          </label>
          <button
            type="submit"
            :disabled="!canCorrect || correctionsStore.isBusy || !sourceRevisionId"
          >
            Queue Mock LLM correction
          </button>
        </form>
        <p v-if="correctionsStore.isBusy" role="status" aria-live="polite">
          {{ correctionsStore.stage
          }}<span v-if="correctionsStore.job"> · {{ correctionsStore.job.state }}</span>
        </p>
        <p v-if="correctionsStore.operationError" class="error-message" role="alert">
          {{ correctionsStore.operationError }}
        </p>
      </section>

      <section
        v-if="correctionsStore.proposal"
        class="result-stack"
        aria-labelledby="proposal-title"
      >
        <div class="result-heading">
          <div>
            <span class="eyebrow">Validated structured patch</span>
            <h2 id="proposal-title">Review {{ correctionsStore.changes.length }} changes</h2>
            <p>
              <span class="status-pill">{{ correctionsStore.proposal.kind }}</span>
              {{ correctionsStore.proposal.model }} · {{ correctionsStore.proposal.prompt_version }}
            </p>
          </div>
          <div class="button-row">
            <button
              class="button-secondary"
              type="button"
              @click="correctionsStore.recordDecision({ action: 'reject_all' })"
            >
              Reject all
            </button>
            <button
              type="button"
              @click="correctionsStore.recordDecision({ action: 'accept_all' })"
            >
              Accept all
            </button>
          </div>
        </div>

        <ol class="change-list">
          <li v-for="(change, index) in correctionsStore.changes" :key="change.segment_id">
            <div class="change-copy">
              <span class="eyebrow">Change {{ index + 1 }}</span>
              <del>{{ change.original }}</del>
              <ins>{{ change.replacement }}</ins>
              <small>{{ Math.round(change.confidence * 100) }}% · {{ change.reason }}</small>
            </div>
            <div class="change-actions">
              <span v-if="correctionsStore.decisions[index]" class="status-pill">
                {{ correctionsStore.decisions[index] }}
              </span>
              <button
                class="button-secondary button-compact"
                type="button"
                @click="
                  correctionsStore.recordDecision({ action: 'reject_change', change_index: index })
                "
              >
                Reject
              </button>
              <button
                class="button-compact"
                type="button"
                @click="
                  correctionsStore.recordDecision({ action: 'accept_change', change_index: index })
                "
              >
                Accept
              </button>
            </div>
          </li>
        </ol>

        <div class="approval-bar">
          <p>Only explicitly accepted changes are applied; undecided changes are rejected.</p>
          <button
            type="button"
            :disabled="correctionsStore.stage !== 'reviewing'"
            @click="correctionsStore.approve()"
          >
            Create approved revision
          </button>
        </div>
      </section>

      <section
        v-if="correctionsStore.approval"
        class="workflow-panel approval-result"
        aria-live="polite"
      >
        <span class="eyebrow">Immutable approval complete</span>
        <h2>{{ correctionsStore.approval.approved_revision.kind }}</h2>
        <p>{{ correctionsStore.approval.approved_revision.text }}</p>
        <code>{{ correctionsStore.approval.approved_revision.id }}</code>
      </section>

      <section
        v-else-if="correctionsStore.autoApprovedRevision"
        class="workflow-panel approval-result"
        aria-live="polite"
      >
        <span class="eyebrow">Glossary-only auto-approval complete</span>
        <h2>{{ correctionsStore.autoApprovedRevision.kind }}</h2>
        <p>{{ correctionsStore.autoApprovedRevision.text }}</p>
        <small>
          Every accepted change matched the immutable glossary snapshot and passed Server safety
          validation.
        </small>
        <code>{{ correctionsStore.autoApprovedRevision.id }}</code>
      </section>

      <section class="workflow-panel" aria-labelledby="transcript-export-title">
        <div class="section-heading">
          <div>
            <span class="eyebrow">One-hour authenticated artifact</span>
            <h2 id="transcript-export-title">Export immutable transcript</h2>
          </div>
          <span class="status-pill">JSON · Markdown · SRT · WebVTT</span>
        </div>
        <p>
          Create an audited download for a specific Revision. The Server removes expired artifacts
          without changing the source Revision.
        </p>
        <form class="form-grid" @submit.prevent="submitExport">
          <label class="field">
            <span>Export revision ID</span>
            <input
              v-model.trim="exportRevisionId"
              pattern="[0-9a-fA-F-]{36}"
              autocomplete="off"
              required
            />
          </label>
          <label class="field">
            <span>Export format</span>
            <select v-model="exportFormat" :disabled="!canExport || correctionsStore.exporting">
              <option value="json">JSON</option>
              <option value="markdown">Markdown</option>
              <option value="srt">SRT subtitles</option>
              <option value="vtt">WebVTT subtitles</option>
            </select>
          </label>
          <button
            type="submit"
            :disabled="!canExport || correctionsStore.exporting || !exportRevisionId"
          >
            {{ correctionsStore.exporting ? 'Preparing…' : 'Prepare download' }}
          </button>
        </form>
        <p v-if="!canExport">
          This session requires both <code>transcripts:read</code> and
          <code>metadata:write</code> to export.
        </p>
        <p v-if="correctionsStore.exportError" class="error-message" role="alert">
          {{ correctionsStore.exportError }}
        </p>
        <div
          v-if="correctionsStore.exportArtifact && correctionsStore.exportDownloadUrl"
          class="export-result"
          role="status"
          aria-live="polite"
        >
          <a
            class="text-link"
            :href="correctionsStore.exportDownloadUrl"
            :download="
              exportFilename(
                correctionsStore.exportArtifact.revision_id,
                correctionsStore.exportArtifact.format,
              )
            "
          >
            Download {{ exportLabel(correctionsStore.exportArtifact.format) }}
          </a>
          <small>
            {{ byteSizeLabel(correctionsStore.exportArtifact.file_size) }} · expires
            {{ dateTimeLabel(correctionsStore.exportArtifact.expires_at) }}
          </small>
          <code>SHA-256 {{ correctionsStore.exportArtifact.sha256 }}</code>
        </div>
      </section>
    </template>
  </div>
</template>
