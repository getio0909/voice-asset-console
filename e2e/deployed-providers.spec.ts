import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test.use({ screenshot: 'off', trace: 'off', video: 'off' })

function requiredEnvironment(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required for the deployed smoke test.`)
  return value
}

test.describe('deployed provider administration smoke', () => {
  // eslint-disable-next-line playwright/no-skipped-test -- This check requires the isolated deployment.
  test.skip(
    process.env.VOICEASSET_DEPLOYED_SMOKE !== '1',
    'Set VOICEASSET_DEPLOYED_SMOKE=1 with the isolated deployment credentials.',
  )

  test('loads credential-free ASR and LLM metadata through the real session', async ({ page }) => {
    const email = requiredEnvironment('VOICEASSET_LIVE_OWNER_EMAIL')
    const password = requiredEnvironment('VOICEASSET_LIVE_OWNER_PASSWORD')
    const observed = new Map<string, number>()
    const unexpectedWrites: string[] = []

    page.on('request', (request) => {
      const path = new URL(request.url()).pathname
      if (
        request.method() !== 'GET' &&
        path !== '/api/v1/auth/sessions' &&
        path !== '/api/v1/auth/session' &&
        path !== '/api/v1/auth/session/refresh'
      ) {
        unexpectedWrites.push(`${request.method()} ${path}`)
      }
    })

    page.on('response', (response) => {
      const path = new URL(response.url()).pathname
      if (
        path === '/api/v1/asr/provider-capabilities' ||
        path === '/api/v1/provider-profiles' ||
        path === '/api/v1/hotword-sets' ||
        path === '/api/v1/llm/provider-capabilities' ||
        path === '/api/v1/llm-profiles' ||
        path === '/api/v1/glossary-sets'
      ) {
        observed.set(path, response.status())
      }
    })

    await page.goto('/assets')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: 'Sign in securely' }).click()
    await expect(page.getByText(email)).toBeVisible()

    await page.getByRole('link', { name: 'Providers', exact: true }).click()
    await expect(
      page.getByRole('heading', { level: 1, name: 'ASR providers & hotwords' }),
    ).toBeVisible()
    const asrCapabilityCards = page.locator('.capability-card')
    await expect(asrCapabilityCards).toHaveCount(3)
    await expect(asrCapabilityCards).toContainText([
      'Mock ASR',
      'Alibaba Cloud Flash ASR',
      'Tencent Cloud Flash ASR',
    ])

    await page.getByRole('link', { name: 'LLM providers' }).click()
    await expect(
      page.getByRole('heading', { level: 1, name: 'LLM providers & glossaries' }),
    ).toBeVisible()
    const llmCapabilityCards = page.locator('.capability-card')
    await expect(llmCapabilityCards).toHaveCount(2)
    await expect(llmCapabilityCards).toContainText(['Mock LLM', 'OpenAI-compatible LLM'])

    expect(Object.fromEntries(observed)).toEqual({
      '/api/v1/asr/provider-capabilities': 200,
      '/api/v1/provider-profiles': 200,
      '/api/v1/hotword-sets': 200,
      '/api/v1/llm/provider-capabilities': 200,
      '/api/v1/llm-profiles': 200,
      '/api/v1/glossary-sets': 200,
    })
    expect(unexpectedWrites).toEqual([])
    expect(
      await page.evaluate(() => ({
        local: Object.keys(localStorage),
        session: Object.keys(sessionStorage),
      })),
    ).toEqual({ local: [], session: [] })

    const accessibility = await new AxeBuilder({ page }).analyze()
    expect(accessibility.violations).toEqual([])

    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page.getByRole('heading', { level: 2, name: 'Sign in' })).toBeVisible()
  })
})
