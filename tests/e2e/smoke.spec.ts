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
  await expect(page.getByTestId('guide-card')).toContainText('大部分数据自己会来');
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

test('收数据：导入生息交换文件 → 健康维度出现自动分（菱形）与依据', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  const today = new Date();
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const t = fmt(today);
  const exchange = {
    manifest: { format: 'lifeos-exchange', protocolVersion: '0.1.2', sourceApp: 'lifeos.shike', synthetic: false, scoringPolicy: 'facts-never-produce-scores' },
    records: [
      {
        sourceRecordId: 'sleep-1', sourceApp: 'lifeos.shike', op: 'write', layer: 'fact',
        occurredAt: `${t}T00:00:00Z`, tz: 'Asia/Shanghai', sourceUpdatedAt: `${t}T01:00:00Z`,
        data: { metricKey: 'sleepMinutes', value: 450, unit: 'min', attributes: { localDate: t } },
      },
    ],
  };
  await page.getByTestId('tab-data').click();
  await page.getByTestId('exchange-file').setInputFiles({
    name: 'lifeos-exchange_shike.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exchange)),
  });
  await expect(page.getByTestId('exchange-preview')).toContainText('生息');
  await page.getByTestId('exchange-apply').click();
  await expect(page.getByTestId('data-msg')).toContainText('已收下');

  await page.getByTestId('tab-kline').click();
  await page.getByTestId('dim-chips').getByRole('button', { name: '健康' }).click();
  await expect(page.getByTestId('auto-point').first()).toBeVisible();
  await expect(page.getByTestId('kline-list')).toContainText('自动分 4');
  await expect(page.getByTestId('kline-list')).toContainText('睡眠 7小时30分');
});

test('通讯录 + 故事 @ 提及：加人 → 写故事选人 → 人物页看到这一天', async ({ page }) => {
  await page.goto('/');
  // 人物页加人
  await page.getByTestId('tab-people').click();
  await page.getByTestId('add-person').click();
  await page.getByTestId('person-name').fill('王子怡');
  await page.getByTestId('person-relation').fill('同事');
  await page.getByTestId('person-save').click();
  // 保存后进入这个人的详情页（还没被任何记录提到）
  await expect(page.getByRole('heading', { name: '王子怡' })).toBeVisible();
  await expect(page.getByText('还没有哪天的记录提到 TA')).toBeVisible();
  // 记录页写故事，打 @ 弹出选人条，点选插入
  await page.getByTestId('tab-record').click();
  const story = page.getByTestId('story');
  await story.click();
  await story.pressSequentially('下午跟 @王');
  await expect(page.getByTestId('mention-list')).toBeVisible();
  await page.getByTestId('mention-王子怡').click();
  await expect(story).toHaveValue('下午跟 @王子怡 ');
  await story.pressSequentially('去吃火锅，锅底很香');
  await page.getByTestId('save-btn').click();
  await expect(page.getByTestId('save-msg')).toContainText('已保存');
  // 回到人物页：王子怡显示「1 天有关」，点开能看到这条故事
  await page.getByTestId('tab-people').click();
  await expect(page.getByTestId('person-王子怡')).toContainText('1 天有关');
  await page.getByTestId('person-王子怡').click();
  await expect(page.getByTestId('related-day').first()).toContainText('去吃火锅');
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
