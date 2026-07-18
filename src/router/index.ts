import { createRouter, createWebHistory } from 'vue-router'

import { brand } from '@/config/brand'
import APIKeysView from '@/views/APIKeysView.vue'
import AccountView from '@/views/AccountView.vue'
import AssetsView from '@/views/AssetsView.vue'
import AuditLogView from '@/views/AuditLogView.vue'
import CorrectionsView from '@/views/CorrectionsView.vue'
import DashboardView from '@/views/DashboardView.vue'
import JobCenterView from '@/views/JobCenterView.vue'
import LLMProvidersView from '@/views/LLMProvidersView.vue'
import MembersView from '@/views/MembersView.vue'
import NotFoundView from '@/views/NotFoundView.vue'
import ProvidersView from '@/views/ProvidersView.vue'
import SessionsView from '@/views/SessionsView.vue'
import SystemSettingsView from '@/views/SystemSettingsView.vue'
import SystemStatusView from '@/views/SystemStatusView.vue'
import VersionInformationView from '@/views/VersionInformationView.vue'
import WebhooksView from '@/views/WebhooksView.vue'
import WorkspaceView from '@/views/WorkspaceView.vue'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'dashboard',
      component: DashboardView,
      meta: { title: 'Dashboard' },
    },
    {
      path: '/account',
      name: 'account',
      component: AccountView,
      meta: { title: 'Account' },
    },
    {
      path: '/assets',
      name: 'assets',
      component: AssetsView,
      meta: { title: 'Assets' },
    },
    {
      path: '/corrections',
      name: 'corrections',
      component: CorrectionsView,
      meta: { title: 'Correction review' },
    },
    {
      path: '/providers',
      name: 'providers',
      component: ProvidersView,
      meta: { title: 'ASR providers & hotwords' },
    },
    {
      path: '/llm-providers',
      name: 'llm-providers',
      component: LLMProvidersView,
      meta: { title: 'LLM providers & glossaries' },
    },
    {
      path: '/api-keys',
      name: 'api-keys',
      component: APIKeysView,
      meta: { title: 'API keys' },
    },
    {
      path: '/webhooks',
      name: 'webhooks',
      component: WebhooksView,
      meta: { title: 'Outbound Webhooks' },
    },
    {
      path: '/jobs',
      name: 'jobs',
      component: JobCenterView,
      meta: { title: 'Job Center' },
    },
    {
      path: '/audit-log',
      name: 'audit-log',
      component: AuditLogView,
      meta: { title: 'Audit Log' },
    },
    {
      path: '/members',
      name: 'members',
      component: MembersView,
      meta: { title: 'Members' },
    },
    {
      path: '/workspace',
      name: 'workspace',
      component: WorkspaceView,
      meta: { title: 'Workspace' },
    },
    {
      path: '/system-settings',
      name: 'system-settings',
      component: SystemSettingsView,
      meta: { title: 'System Settings' },
    },
    {
      path: '/system-status',
      name: 'system-status',
      component: SystemStatusView,
      meta: { title: 'System Status' },
    },
    {
      path: '/version',
      name: 'version-information',
      component: VersionInformationView,
      meta: { title: 'Version Information' },
    },
    {
      path: '/sessions',
      name: 'sessions',
      component: SessionsView,
      meta: { title: 'Device sessions' },
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: NotFoundView,
      meta: { title: 'Not found' },
    },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

router.afterEach((to) => {
  const pageTitle = typeof to.meta.title === 'string' ? to.meta.title : 'Console'
  document.title = `${pageTitle} · ${brand.name}`
})
