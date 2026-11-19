/** @type {import('tailwindcss').Config} */
export default {
  // v0.3.0：深色模式跟随系统（prefers-color-scheme），由 CSS 变量令牌驱动
  darkMode: 'media',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // paper / ink 走 CSS 变量：浅色为 iOS 分组灰 + 标准标签色，深色自动翻转（见 index.css）
        paper: 'rgb(var(--c-paper) / <alpha-value>)',
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        // 强调色 = iOS 系统蓝（类名沿用 sage，token 为系统蓝，与钱在哪同标准）
        sage: { 50: '#f0f7ff', 100: '#e0efff', 300: '#99c9ff', 500: '#3395ff', 600: '#007aff', 700: '#0062cc' },
        // 四类记录的 iOS 系统色：饮食红、睡眠靛蓝、运动绿、身体紫
        meal: '#ff3b30', sleep: '#5856d6', exercise: '#34c759', body: '#af52de',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"PingFang SC"', '"Hiragino Sans GB"', '"Noto Sans CJK SC"', '"Microsoft YaHei"', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
