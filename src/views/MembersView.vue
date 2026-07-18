<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'

import { MEMBER_ROLES, MEMBER_STATUSES } from '@/api/client'
import type { Member, MemberRole, MemberStatus, UpdateMemberRequest } from '@/api/client'
import { useAssetsStore } from '@/stores/assets'
import { useConsoleStore } from '@/stores/console'
import { useMembersStore } from '@/stores/members'

const assetsStore = useAssetsStore()
const consoleStore = useConsoleStore()
const membersStore = useMembersStore()

const email = ref('')
const password = ref('')
const createRole = ref<MemberRole>('viewer')
const roleFilter = ref<MemberRole | ''>(membersStore.roleFilter)
const statusFilter = ref<MemberStatus | ''>(membersStore.statusFilter)
const feedback = ref('')

const canRead = computed(() => assetsStore.user?.scopes.includes('admin:read') ?? false)
const canManage = computed(
  () =>
    assetsStore.user?.role === 'owner' &&
    (assetsStore.user?.scopes.includes('admin:write') ?? false),
)

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

async function initialize(): Promise<void> {
  const authenticated =
    assetsStore.sessionStatus === 'authenticated' || (await assetsStore.restoreSession())
  if (authenticated && canRead.value) await membersStore.load()
}

async function applyFilters(): Promise<void> {
  feedback.value = ''
  if (
    membersStore.setFilters({
      ...(roleFilter.value ? { role: roleFilter.value } : {}),
      ...(statusFilter.value ? { status: statusFilter.value } : {}),
    })
  ) {
    await membersStore.load()
  }
}

async function createMember(): Promise<void> {
  feedback.value = ''
  const plaintextPassword = password.value
  password.value = ''
  const createdEmail = email.value.trim()
  const created = await membersStore.create({
    email: email.value,
    password: plaintextPassword,
    role: createRole.value,
  })
  if (created) {
    email.value = ''
    createRole.value = 'viewer'
    feedback.value = `Created ${createdEmail}. The plaintext password was cleared from this page.`
  }
}

async function saveMember(event: SubmitEvent, member: Member): Promise<void> {
  feedback.value = ''
  const form = event.currentTarget as HTMLFormElement
  const data = new FormData(form)
  const role = String(data.get('role')) as MemberRole
  const status = String(data.get('status')) as MemberStatus
  const input: UpdateMemberRequest = {}
  if (role !== member.role) input.role = role
  if (status !== member.status) input.status = status
  if (!input.role && !input.status) {
    feedback.value = `No changes were selected for ${member.email}.`
    return
  }
  if (await membersStore.update(member.id, member.version, input)) {
    feedback.value = `Updated ${member.email}.`
  }
}

async function logout(): Promise<void> {
  membersStore.reset()
  await assetsStore.logout()
}

onMounted(() => {
  void initialize()
})
</script>

<template>
  <div class="page-stack">
    <header class="page-heading">
      <span class="eyebrow">Workspace access</span>
      <h1>Members</h1>
      <p>
        Review workspace roles and access status. Owners can create members, change assignments, and
        disable credentials without exposing password hashes or stored tokens.
      </p>
    </header>

    <aside v-if="!consoleStore.isReady" class="connection-warning" role="status">
      <strong>Server compatibility: {{ consoleStore.apiStatus }}</strong>
      <span>{{ consoleStore.compatibilityIssue ?? 'Waiting for the capability check.' }}</span>
    </aside>

    <section v-if="assetsStore.sessionStatus === 'checking'" class="workflow-panel" role="status">
      <span class="eyebrow">Session</span>
      <h2>Checking administrator access</h2>
      <p>The Console uses the Server-managed HttpOnly session.</p>
    </section>

    <section v-else-if="!assetsStore.isAuthenticated" class="empty-state">
      <span class="empty-state__mark" aria-hidden="true">401</span>
      <h2>Sign in to review workspace members</h2>
      <p>Member inventory requires an authenticated principal with <code>admin:read</code>.</p>
      <RouterLink class="text-link" to="/assets">Go to secure sign in</RouterLink>
    </section>

    <template v-else>
      <section class="session-bar" aria-label="Current session">
        <div>
          <span class="eyebrow">Signed in</span>
          <strong>{{ assetsStore.user?.email }}</strong>
          <small>{{
            canManage ? 'Owner membership controls enabled' : 'Read-only membership access'
          }}</small>
        </div>
        <div class="button-row">
          <button
            class="button-secondary"
            type="button"
            :disabled="!canRead || membersStore.isBusy"
            @click="membersStore.load()"
          >
            Refresh
          </button>
          <button
            class="button-secondary"
            type="button"
            :disabled="membersStore.isBusy"
            @click="logout"
          >
            Sign out
          </button>
        </div>
      </section>

      <section v-if="!canRead" class="empty-state">
        <span class="empty-state__mark" aria-hidden="true">403</span>
        <h2>Administrative read scope required</h2>
        <p>Your current session does not include <code>admin:read</code>.</p>
      </section>

      <template v-else>
        <p v-if="membersStore.error" class="error-message" role="alert">
          {{ membersStore.error }}
        </p>
        <p v-if="feedback" class="success-message" role="status">{{ feedback }}</p>

        <section class="configuration-grid" aria-label="Workspace member administration">
          <article class="workflow-panel">
            <div class="section-heading">
              <div>
                <span class="eyebrow">Owner only</span>
                <h2>Create a member</h2>
              </div>
            </div>
            <p>
              The Server hashes the initial password. It is sent only in this request and cleared
              from the form immediately.
            </p>
            <form class="form-stack" @submit.prevent="createMember">
              <label class="field">
                <span>Email</span>
                <input v-model="email" type="email" maxlength="254" autocomplete="off" required />
              </label>
              <label class="field">
                <span>Initial password</span>
                <input
                  v-model="password"
                  type="password"
                  minlength="12"
                  maxlength="1024"
                  autocomplete="new-password"
                  required
                />
                <small
                  >Use at least 12 characters. The password is never returned by the API.</small
                >
              </label>
              <label class="field">
                <span>Role</span>
                <select v-model="createRole">
                  <option v-for="role in MEMBER_ROLES" :key="role" :value="role">{{ role }}</option>
                </select>
              </label>
              <button
                type="submit"
                :disabled="
                  !canManage || membersStore.isBusy || !email.trim() || password.length < 12
                "
              >
                Create member
              </button>
              <small v-if="!canManage">
                Creating members requires the Owner role and <code>admin:write</code>.
              </small>
            </form>
          </article>

          <article class="workflow-panel">
            <div class="section-heading">
              <div>
                <span class="eyebrow">Bounded query</span>
                <h2>Filter members</h2>
              </div>
            </div>
            <p>Each cursor is bound to the selected role and status filters.</p>
            <form class="form-stack" @submit.prevent="applyFilters">
              <label class="field">
                <span>Role</span>
                <select v-model="roleFilter" :disabled="membersStore.isBusy">
                  <option value="">All roles</option>
                  <option v-for="role in MEMBER_ROLES" :key="role" :value="role">{{ role }}</option>
                </select>
              </label>
              <label class="field">
                <span>Status</span>
                <select v-model="statusFilter" :disabled="membersStore.isBusy">
                  <option value="">All statuses</option>
                  <option v-for="status in MEMBER_STATUSES" :key="status" :value="status">
                    {{ status }}
                  </option>
                </select>
              </label>
              <button type="submit" :disabled="membersStore.isBusy">Apply filters</button>
            </form>
          </article>
        </section>

        <section class="workflow-panel" aria-labelledby="member-inventory-title">
          <div class="section-heading">
            <div>
              <span class="eyebrow">Newest updates first</span>
              <h2 id="member-inventory-title">Workspace members</h2>
            </div>
            <span class="status-pill">{{ membersStore.items.length }} loaded</span>
          </div>
          <p>
            Disabling a member revokes all of that member's active sessions and API keys. The last
            active Owner cannot be demoted or disabled.
          </p>
          <p v-if="membersStore.loading" role="status">Loading workspace members…</p>
          <p v-else-if="membersStore.items.length === 0">No members matched the current filters.</p>
          <ol v-else class="operations-list">
            <li v-for="member in membersStore.items" :key="`${member.id}-${member.version}`">
              <div class="operations-list__heading">
                <div>
                  <strong>{{ member.email }}</strong>
                  <small>
                    Updated {{ formatDate(member.updated_at) }} · membership version
                    {{ member.version }}
                  </small>
                </div>
                <div>
                  <span class="status-pill">{{ member.role }}</span>
                  <span class="status-pill">{{ member.status }}</span>
                </div>
              </div>
              <dl class="operations-metadata">
                <div>
                  <dt>User ID</dt>
                  <dd>
                    <code>{{ member.id }}</code>
                  </dd>
                </div>
                <div>
                  <dt>Created</dt>
                  <dd>{{ formatDate(member.created_at) }}</dd>
                </div>
              </dl>
              <form class="member-update-form" @submit.prevent="saveMember($event, member)">
                <label class="field">
                  <span>Role for {{ member.email }}</span>
                  <select
                    name="role"
                    :value="member.role"
                    :disabled="!canManage || membersStore.isBusy"
                  >
                    <option v-for="role in MEMBER_ROLES" :key="role" :value="role">
                      {{ role }}
                    </option>
                  </select>
                </label>
                <label class="field">
                  <span>Status for {{ member.email }}</span>
                  <select
                    name="status"
                    :value="member.status"
                    :disabled="!canManage || membersStore.isBusy"
                  >
                    <option v-for="status in MEMBER_STATUSES" :key="status" :value="status">
                      {{ status }}
                    </option>
                  </select>
                </label>
                <button type="submit" :disabled="!canManage || membersStore.isBusy">
                  Save changes for {{ member.email }}
                </button>
              </form>
            </li>
          </ol>
          <button
            v-if="membersStore.nextCursor"
            class="button-secondary operations-load-more"
            type="button"
            :disabled="membersStore.isBusy"
            @click="membersStore.loadMore()"
          >
            {{ membersStore.loadingMore ? 'Loading…' : 'Load more members' }}
          </button>
        </section>
      </template>
    </template>
  </div>
</template>
