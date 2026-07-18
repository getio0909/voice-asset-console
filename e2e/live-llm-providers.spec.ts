import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test.use({ screenshot: 'off', trace: 'off', video: 'off' })

function requiredEnvironment(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required for the live E2E.`)
  return value
}

test.describe('live Server LLM administration', () => {
  // eslint-disable-next-line playwright/no-skipped-test -- This integration mutates only an ephemeral schema.
  test.skip(
    process.env.VOICEASSET_LIVE_E2E !== '1',
    'Set VOICEASSET_LIVE_E2E=1 with ephemeral owner credentials and a running Server.',
  )

  test('publishes glossaries and manages a real Mock LLM profile', async ({ page }) => {
    test.setTimeout(60_000)
    const email = requiredEnvironment('VOICEASSET_LIVE_OWNER_EMAIL')
    const password = requiredEnvironment('VOICEASSET_LIVE_OWNER_PASSWORD')

    await page.goto('/assets')
    await expect(page.getByRole('heading', { level: 2, name: 'Sign in' })).toBeVisible()
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: 'Sign in securely' }).click()
    await expect(page.getByText(email)).toBeVisible()

    await page.getByRole('link', { name: 'LLM providers' }).click()
    await expect(
      page.getByRole('heading', { level: 1, name: 'LLM providers & glossaries' }),
    ).toBeVisible()
    await expect(page.locator('.capability-card')).toHaveCount(2)

    await page.getByLabel('Glossary set name').fill('Live correction terminology')
    await page.getByLabel('Canonical form', { exact: true }).fill('VoiceAsset')
    await page.getByLabel('Aliases (comma-separated)').fill('Voice Asset')
    await page.getByRole('button', { name: 'Create glossary set' }).click()

    const glossaryItem = page
      .getByRole('listitem')
      .filter({ hasText: 'Live correction terminology' })
    await expect(glossaryItem).toContainText('v1')
    await page.getByLabel('Version target').selectOption({
      label: 'Live correction terminology (v1)',
    })
    await page.getByLabel('Replacement canonical form').fill('VoiceAssets')
    await page.getByLabel('Replacement aliases').fill('Voice Asset')
    await page.getByRole('button', { name: 'Publish glossary version' }).click()
    await expect(glossaryItem).toContainText('v2')
    await page.getByRole('button', { name: 'Disable Live correction terminology' }).click()
    await expect(glossaryItem).toContainText('disabled')

    await expect(page.getByLabel('LLM provider')).toHaveValue('mock_llm')
    await page.getByLabel('Profile name').fill('Live Mock LLM')
    await page.getByRole('button', { name: 'Create LLM profile' }).click()

    const profileItem = page.getByRole('listitem').filter({ hasText: 'Live Mock LLM' })
    await expect(profileItem).toContainText('no credential required')
    const healthButton = page.getByRole('button', { name: 'Check health for Live Mock LLM' })
    await healthButton.click()
    await expect(healthButton).toHaveText('healthy')
    await page.getByRole('button', { name: 'Disable Live Mock LLM' }).click()
    await expect(profileItem).toContainText('disabled')

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
