import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('lifeos-kline');
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  });
  await page.reload();
});

test('记录一天 → 刷新后仍在 → K线出现蜡烛 → 时间轴与历史可见', async ({ page }) => {
  await expect(page.getByTestId('today-card')).toBeVisible();
  await expect(page.getByTestId('guide-card')).toContainText('每天就三步');
  await page.getByTestId('tab-record').click();

  // 快速模式默认：只有「今晚整体」，晨/最好/最差不可见
  await expect(page.getByTestId('health-evening')).toBeVisible();
  await expect(page.getByTestId('health-morning')).toHaveCount(0);
  await page.getByTestId('toggle-detail').click();

  // 健康维度填齐四值：晨3 晚4 最好5 最差2
  const pick = async (tid: string, n: number) => {
    await page.getByTestId(tid).getByRole('radio').nth(n - 1).click();
  };
  await pick('health-morning', 3);
  await pick('health-evening', 4);
  await pick('health-best', 5);
  await pick('health-worst', 2);
  await page.getByTestId('fact-sleepMinutes').fill('420');
  await page.getByTestId('story').fill('e2e 测试故事：今天把K线记上了');
  await page.getByTestId('save-btn').click();
  await expect(page.getByTestId('save-msg')).toContainText('已保存');

  // 刷新后数据仍在（IndexedDB 持久化）
  await page.reload();
  await page.getByTestId('tab-record').click();
  await expect(page.getByTestId('story')).toHaveValue('e2e 测试故事：今天把K线记上了');
  await expect(page.getByTestId('fact-sleepMinutes')).toHaveValue('420');

  // K线页：健康维度出现标准蜡烛
  await page.getByTestId('tab-kline').click();
  await expect(page.getByTestId('kline-chart')).toBeVisible();
  await expect(page.getByTestId('candle').first()).toBeVisible();
  await expect(page.getByTestId('kline-list')).toContainText('开 3 · 高 5 · 低 2 · 收 4');

  // 时间轴能看到故事
  await page.getByTestId('tab-timeline').click();
  await expect(page.getByTestId('timeline-list')).toContainText('e2e 测试故事');
});

test('只有晚间值的一天只画点不画蜡烛；约束错误被表单拦下', async ({ page }) => {
  await page.getByTestId('tab-record').click();
  const pick = async (tid: string, n: number) => {
    await page.getByTestId(tid).getByRole('radio').nth(n - 1).click();
  };
  // 先制造约束错误：晚4、最好3 → 保存应被拦（最好在「记更细」里）
  await pick('emotion-evening', 4);
  await page.getByTestId('toggle-detail').click();
  await pick('emotion-best', 3);
  await page.getByTestId('save-btn').click();
  await expect(page.getByTestId('form-errors')).toContainText('最好状态不能低于晚间状态');
  // 取消最好，只留晚间值 → 保存成功，K线只有点
  await pick('emotion-best', 3);
  await page.getByTestId('save-btn').click();
  await expect(page.getByTestId('save-msg')).toContainText('已保存');
  await page.getByTestId('tab-kline').click();
  await page.getByTestId('dim-chips').getByText('情绪').click();
  await expect(page.getByTestId('point').first()).toBeVisible();
  await expect(page.getByTestId('candle')).toHaveCount(0);
  await expect(page.getByTestId('kline-list')).toContainText('只有点位 4');
});

test('事件增删 + 导出文件为 lifeos-export-v1 + 示例数据', async ({ page }) => {
  await page.getByTestId('tab-timeline').click();
  await page.getByTestId('add-event-btn').click();
  await page.getByTestId('event-title').fill('e2e 事件：搬家');
  await page.getByTestId('event-save').click();
  await expect(page.getByTestId('timeline-list')).toContainText('e2e 事件：搬家');

  await page.getByTestId('tab-data').click();
  const dl = page.waitForEvent('download');
  await page.getByTestId('export-json').click();
  const download = await dl;
  const path = await download.path();
  const fs = await import('node:fs/promises');
  const parsed = JSON.parse(await fs.readFile(path!, 'utf-8'));
  expect(parsed.format).toBe('lifeos-export-v1');
  expect(parsed.counts.events).toBe(1);

  await page.getByTestId('load-sample').click();
  await expect(page.getByTestId('data-msg')).toContainText('示例数据');
  await expect(page.getByTestId('history-list')).toContainText('示例');
});
