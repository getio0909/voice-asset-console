import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('shows the honest initialization state and routes to assets', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Project initialization in progress' }),
  ).toBeVisible()
  await expect(page.getByText('No synthetic metrics')).toBeVisible()

  await page.getByRole('link', { name: 'Assets' }).click()

  await expect(page.getByRole('heading', { level: 1, name: 'Voice assets' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'No assets loaded' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Upload audio' })).toBeDisabled()

  const accessibility = await new AxeBuilder({ page }).analyze()
  expect(accessibility.violations).toEqual([])
})
