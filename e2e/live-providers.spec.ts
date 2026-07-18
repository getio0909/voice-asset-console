import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test.use({ screenshot: 'off', trace: 'off', video: 'off' })

function requiredEnvironment(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required for the live E2E.`)
  return value
}

test.describe('live Server provider administration', () => {
  // eslint-disable-next-line playwright/no-skipped-test -- This integration mutates only an ephemeral schema.
  test.skip(
    process.env.VOICEASSET_LIVE_E2E !== '1',
    'Set VOICEASSET_LIVE_E2E=1 with ephemeral owner credentials and a running Server.',
  )

  test('publishes hotwords and manages a real Mock ASR profile', async ({ page }) => {
    test.setTimeout(60_000)
    const email = requiredEnvironment('VOICEASSET_LIVE_OWNER_EMAIL')
    const password = requiredEnvironment('VOICEASSET_LIVE_OWNER_PASSWORD')

    await page.goto('/assets')
    await expect(page.getByRole('heading', { level: 2, name: 'Sign in' })).toBeVisible()
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: 'Sign in securely' }).click()
    await expect(page.getByText(email)).toBeVisible()

    await page.getByRole('link', { name: 'Providers', exact: true }).click()
    await expect(
      page.getByRole('heading', { level: 1, name: 'ASR providers & hotwords' }),
    ).toBeVisible()
    await expect(page.locator('.capability-card')).toHaveCount(3)

    await page.getByLabel('Hotword set name').fill('Live provider terminology')
    await page.getByLabel('Hotword term').fill('VoiceAsset')
    await page.getByLabel('Hotword aliases').fill('Voice Asset')
    await page.getByRole('button', { name: 'Create hotword version 1' }).click()

    const hotwordItem = page.getByRole('listitem').filter({ hasText: 'Live provider terminology' })
    await expect(hotwordItem).toContainText('v1')
    await page.getByLabel('Version target').selectOption({
      label: 'Live provider terminology (v1)',
    })
    await page.getByLabel('Replacement term').fill('VoiceAssets')
    await page.getByRole('button', { name: 'Publish hotword version' }).click()
    await expect(hotwordItem).toContainText('v2')
    await page.getByRole('button', { name: 'Disable Live provider terminology' }).click()
    await expect(hotwordItem).toContainText('disabled')

    await expect(page.getByLabel('ASR provider')).toHaveValue('mock_asr')
    await page.getByLabel('ASR profile name').fill('Live Mock ASR')
    await page.getByRole('button', { name: 'Create ASR profile' }).click()

    const profileItem = page.getByRole('listitem').filter({ hasText: 'Live Mock ASR' })
    await expect(profileItem).toContainText('no credential required')
    const healthButton = page.getByRole('button', { name: 'Check health for Live Mock ASR' })
    await healthButton.click()
    await expect(healthButton).toHaveText('healthy')
    await page.getByRole('button', { name: 'Disable Live Mock ASR' }).click()
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
