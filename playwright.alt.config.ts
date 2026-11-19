import { defineConfig, devices } from '@playwright/test';

// 本机无系统 Chrome，使用 Playwright 自带 Chromium（与生息 v0.7.0 补跑 e2e 的做法一致）。
// 在子路径 /lifeos/ 下运行，与 GitHub Pages 部署形态一致。视口为 iPhone 13，非真机、非 WebKit。
const iphone = devices['iPhone 13'];
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4311/lifeos/', trace: 'off', locale: 'zh-CN', timezoneId: 'Asia/Shanghai' },
  webServer: { command: 'node scripts/serve.mjs 4311 /lifeos', url: 'http://127.0.0.1:4311/lifeos/', reuseExistingServer: false },
  projects: [
    { name: 'iphone13-chromium', use: { ...iphone, browserName: 'chromium', defaultBrowserType: 'chromium' } },
  ],
});
