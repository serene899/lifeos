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

const pick = async (page: import('@playwright/test').Page, tid: string, n: number) => {
  await page.getByTestId(tid).getByRole('radio').nth(n - 1).click();
};
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

test('首页即K线（只有两个一级入口）→ 记录今天 → 保存回首页 → 点日期看故事', async ({ page }) => {
  // v0.4.0 结构：底部只有 首页 / 人物
  await expect(page.getByTestId('tab-home')).toBeVisible();
  await expect(page.getByTestId('tab-people')).toBeVisible();
  await expect(page.getByTestId('tab-record')).toHaveCount(0);
  await expect(page.getByTestId('tab-kline')).toHaveCount(0);
  await expect(page.getByTestId('tab-timeline')).toHaveCount(0);
  await expect(page.getByTestId('tab-data')).toHaveCount(0);
  await expect(page.getByTestId('kline-chart')).toBeVisible();

  await page.getByTestId('record-today').click();
  // 快速模式默认：只有「今晚整体」，晨/最好/最差不可见
  await expect(page.getByTestId('health-evening')).toBeVisible();
  await expect(page.getByTestId('health-morning')).toHaveCount(0);
  await page.getByTestId('toggle-detail').click();

  // 健康维度填齐四值：晨3 晚4 最好5 最差2
  await pick(page, 'health-morning', 3);
  await pick(page, 'health-evening', 4);
  await pick(page, 'health-best', 5);
  await pick(page, 'health-worst', 2);
  await page.getByTestId('fact-sleepMinutes').fill('420');
  await page.getByTestId('story').fill('e2e 测试故事：今天把K线记上了');
  await page.getByTestId('save-btn').click();

  // 保存后回到首页，健康维度出现标准蜡烛
  await expect(page.getByTestId('kline-chart')).toBeVisible();
  await expect(page.getByTestId('candle').first()).toBeVisible();
  await expect(page.getByTestId('kline-list')).toContainText('开 3 · 高 5 · 低 2 · 收 4');

  // 刷新后数据仍在（IndexedDB 持久化）
  await page.reload();
  await expect(page.getByTestId('candle').first()).toBeVisible();

  // 点开今天这一行 → 详情里能看到故事
  await page.locator(`[data-testid="day-row"][data-date="${todayStr()}"]`).click();
  await expect(page.getByTestId('day-detail')).toContainText('e2e 测试故事');
});

test('只有晚间值的一天只画点不画蜡烛；约束错误被表单拦下', async ({ page }) => {
  await page.getByTestId('record-today').click();
  // 先制造约束错误：晚4、最好3 → 保存应被拦（最好在「记更细」里），且停留在记录页
  await pick(page, 'emotion-evening', 4);
  await page.getByTestId('toggle-detail').click();
  await pick(page, 'emotion-best', 3);
  await page.getByTestId('save-btn').click();
  await expect(page.getByTestId('form-errors')).toContainText('最好状态不能低于晚间状态');
  // 取消最好，只留晚间值 → 保存成功并回首页
  await pick(page, 'emotion-best', 3);
  await page.getByTestId('save-btn').click();
  await expect(page.getByTestId('kline-chart')).toBeVisible();
  await page.getByTestId('dim-seg').getByRole('button', { name: '情绪' }).click();
  await expect(page.getByTestId('point').first()).toBeVisible();
  await expect(page.getByTestId('candle')).toHaveCount(0);
  await expect(page.getByTestId('kline-list')).toContainText('点位 4');
});

test('收数据（设置页）：导入生息交换文件 → 日K自动分 + 周K也纳入自动分', async ({ page }) => {
  const t = todayStr();
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
  await page.getByTestId('open-settings').click();
  await page.getByTestId('exchange-file').setInputFiles({
    name: 'lifeos-exchange_shike.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exchange)),
  });
  await expect(page.getByTestId('exchange-preview')).toContainText('生息');
  await page.getByTestId('exchange-apply').click();
  await expect(page.getByTestId('data-msg')).toContainText('已收下');

  await page.getByTestId('back-home').click();
  await page.getByTestId('dim-seg').getByRole('button', { name: '健康' }).click();
  await expect(page.getByTestId('auto-point').first()).toBeVisible();
  await expect(page.getByTestId('kline-list')).toContainText('自动分 4');
  await expect(page.getByTestId('kline-list')).toContainText('睡眠 7小时30分');

  // v0.4.0 修复点：切到周K，本周应按有效评分口径纳入这条自动分
  await page.getByTestId('period-seg').getByRole('button', { name: '周K' }).click();
  await expect(page.getByTestId('kline-list')).toContainText('含自动分 1 天');
  await expect(page.getByTestId('kline-list')).toContainText('只有一条有效评分 4');
});

test('通讯录 + 故事 @ 提及：加人 → 写故事选人 → 人物页看到这一天', async ({ page }) => {
  // 人物页加人（联系方式/生日在折叠区里）
  await page.getByTestId('tab-people').click();
  await page.getByTestId('add-person').click();
  await page.getByTestId('person-name').fill('张三');
  await page.getByTestId('person-relation').fill('同事');
  await page.getByTestId('person-more-toggle').click();
  await page.getByTestId('person-phone').fill('13800000000');
  await page.getByTestId('person-birthday').fill('1995-11-25');
  await page.getByTestId('person-save').click();
  // 保存后进入这个人的详情页（还没被任何记录提到），联系方式与生日都在
  await expect(page.getByRole('heading', { name: '张三' })).toBeVisible();
  await expect(page.getByText('还没有哪天的记录提到 TA')).toBeVisible();
  await expect(page.getByTestId('contact-info')).toContainText('13800000000');
  await expect(page.getByTestId('important-days')).toContainText('11月25日');
  // 首页记录：写故事，打 @ 弹出选人条，点选插入
  await page.getByTestId('tab-home').click();
  await page.getByTestId('record-today').click();
  const story = page.getByTestId('story');
  await story.click();
  await story.pressSequentially('下午跟 @张');
  await expect(page.getByTestId('mention-list')).toBeVisible();
  await page.getByTestId('mention-张三').click();
  await expect(story).toHaveValue('下午跟 @张三 ');
  await story.pressSequentially('去吃火锅，锅底很香');
  await page.getByTestId('save-btn').click();
  await expect(page.getByTestId('kline-chart')).toBeVisible();
  // 回到人物页：张三显示「1 天有关」，点开能看到这条故事
  await page.getByTestId('tab-people').click();
  await expect(page.getByTestId('person-张三')).toContainText('1 天有关');
  await page.getByTestId('person-张三').click();
  await expect(page.getByTestId('related-day').first()).toContainText('去吃火锅');
});

test('首页日期详情里加事件 + 设置页导出 lifeos-export-v1 + 示例数据', async ({ page }) => {
  await page.locator(`[data-testid="day-row"][data-date="${todayStr()}"]`).click();
  await expect(page.getByTestId('day-detail')).toBeVisible();
  await page.getByTestId('add-event-btn').click();
  await page.getByTestId('event-title').fill('e2e 事件：搬家');
  await page.getByTestId('event-save').click();
  await expect(page.getByTestId('day-detail')).toContainText('e2e 事件：搬家');

  await page.getByTestId('open-settings').click();
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
