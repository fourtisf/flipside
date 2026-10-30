/**
 * The pre-launch edition (lib/edition.ts), which coinside.fun serves until real trading opens: markets and
 * charts can be browsed, nobody can trade, nothing mentions paper SOL, and nothing simulated is shown as
 * trading activity. Runs against `pnpm build` (the default edition) at 1440 and 390 px.
 */
import { expect, test, type Page } from '@playwright/test';

const GLOOP = 'AK6sDVobPJFuVSuepJF6QdZYvT9R4RqnerRJ8P5qpump';

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return errors;
}

const noPaper = async (page: Page) => expect(page.locator('body')).not.toContainText(/paper SOL|Practice/i);

test('markets: no paper SOL, no trading, only market data', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await expect(page.locator('.hdr .soon')).toHaveText('Trading opens soon');
  await expect(page.locator('#modeT')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Connect wallet|Claim/ })).toHaveCount(0);
  await expect(page.locator('#ctaPractice')).toHaveCount(0);

  // Quick trade: browse a coin, but the order button is closed
  await expect(page.locator('#tk-mode')).toHaveText('Preview');
  await expect(page.locator('#tk-cta')).toHaveText('Trading opens soon');
  await expect(page.locator('#tk-cta')).toBeDisabled();
  await expect(page.locator('#tk-pct')).toBeHidden();
  await page.locator('#tk-side [data-side="short"]').click();
  await expect(page.locator('#tk-cta')).toHaveText('Trading opens soon');

  // No simulated trading activity: tape, protocol stats, feed, wins, open interest
  await expect(page.locator('#tape')).toHaveCount(0);
  await expect(page.locator('.stats')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Live trades' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Top wins today' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Most shorted' })).toHaveCount(0);
  await expect(page.getByRole('columnheader', { name: /Long vs short/ })).toHaveCount(0);

  // Market data stays: map, lists (with Most liquid), table
  await expect(page.getByRole('heading', { name: 'Most liquid' })).toBeVisible();
  await expect(page.locator('#l-liq .lr')).toHaveCount(5);
  await expect(page.locator('#l-hot .lr')).toHaveCount(5);
  await expect(page.getByRole('table', { name: 'All markets' })).toBeVisible();
  await expect(page.locator('.fb')).toContainText('trading is not open yet');
  await noPaper(page);
  expect(errors).toEqual([]);
});

test('terminal: the chart works, the order panel is closed', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto(`/trade/${GLOOP}`);
  await expect(page.locator('#th-title')).toContainText('$GLOOP');
  await expect(page.locator('.tvc canvas').first()).toBeVisible();
  const cta = page.locator('.order .cta');
  await expect(cta).toHaveText('Trading opens soon');
  await expect(cta).toBeDisabled();
  await expect(page.locator('#o-pct')).toBeHidden();
  await expect(page.locator('#o-oc')).toBeHidden();
  await noPaper(page);
  expect(errors).toEqual([]);
});

for (const [path, heading, state] of [
  ['/portfolio', 'Portfolio', 'Trading opens soon'],
  ['/pool', 'The pool', 'Opens with trading'],
  ['/leaderboard', 'Leaderboard', 'Starts with trading'],
  ['/emergency', 'Emergency withdraw', 'Starts with deposits'],
] as const) {
  test(`${path}: says it opens with trading, shows nothing simulated`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
    await expect(page.locator('.soon-page')).toContainText(state);
    await expect(page.locator('.n')).toHaveCount(0); // no figures (every number in the UI is .n)
    await noPaper(page);
    expect(errors).toEqual([]);
  });
}

test('docs: no Practice step', async ({ page }) => {
  await page.goto('/docs');
  await expect(page.locator('#d-start')).not.toContainText('Practice');
  await expect(page.locator('#guards .gd')).toHaveCount(6);
});
