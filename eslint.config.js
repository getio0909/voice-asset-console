import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import vitest from '@vitest/eslint-plugin'
import pluginPlaywright from 'eslint-plugin-playwright'
import pluginVue from 'eslint-plugin-vue'

export default defineConfigWithVueTs(
  {
    name: 'voice-asset-console/files',
    files: ['**/*.{ts,mts,tsx,vue}'],
  },
  {
    name: 'voice-asset-console/ignores',
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/playwright-report/**',
      '**/test-results/**',
    ],
  },
  pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,
  {
    name: 'voice-asset-console/vitest',
    files: ['src/**/*.spec.ts', 'src/**/__tests__/**/*.ts'],
    plugins: { vitest },
    rules: vitest.configs.recommended.rules,
  },
  {
    ...pluginPlaywright.configs['flat/recommended'],
    name: 'voice-asset-console/playwright',
    files: ['e2e/**/*.ts'],
  },
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      'vue/multi-word-component-names': ['error', { ignores: ['App'] }],
    },
  },
)
