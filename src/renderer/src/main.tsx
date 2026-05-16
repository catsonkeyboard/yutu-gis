import './i18n'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider, theme } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import App from './App'
import './assets/main.css'
import 'maplibre-gl/dist/maplibre-gl.css'

/**
 * 企业级 Ant Design 主题配置
 * 消除互联网风格：大圆角、渐变色、过度阴影
 * 使用紧凑算法 + 专业配色
 */
const enterpriseTheme = {
  algorithm: [theme.defaultAlgorithm, theme.compactAlgorithm],
  token: {
    // 主色调 — 沉稳专业蓝
    colorPrimary: '#1a6fb5',
    colorSuccess: '#2e8b57',
    colorWarning: '#d4880f',
    colorError: '#c5382c',
    colorInfo: '#1a6fb5',

    // 圆角 — 极小化
    borderRadius: 2,
    borderRadiusLG: 4,
    borderRadiusSM: 2,
    borderRadiusXS: 1,

    // 字体
    fontFamily: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif`,
    fontSize: 13,

    // 边框
    colorBorder: '#d9dce0',
    colorBorderSecondary: '#e5e7eb',

    // 背景
    colorBgContainer: '#ffffff',
    colorBgLayout: '#f5f6f8',
    colorBgElevated: '#ffffff',

    // 文字
    colorText: '#1f2329',
    colorTextSecondary: '#646a73',
    colorTextTertiary: '#8f959e',
    colorTextDisabled: '#bbbfc4',

    // 阴影 — 极简
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.06)',
    boxShadowSecondary: '0 2px 8px rgba(0, 0, 0, 0.08)',

    // 控件尺寸
    controlHeight: 30,
    controlHeightLG: 34,
    controlHeightSM: 24,
  },
  components: {
    Button: {
      borderRadius: 2,
      borderRadiusLG: 2,
      controlHeight: 28,
      controlHeightLG: 32,
      controlHeightSM: 22,
      primaryShadow: 'none',
      defaultShadow: 'none',
      dangerShadow: 'none',
    },
    Modal: {
      borderRadiusLG: 4,
      paddingContentHorizontalLG: 20,
    },
    Table: {
      headerBg: '#f5f6f8',
      headerColor: '#646a73',
      rowHoverBg: '#eef0f3',
      borderColor: '#e5e7eb',
      cellFontSize: 12,
      cellPaddingBlock: 5,
      cellPaddingInline: 8,
      headerBorderRadius: 0,
    },
    Input: {
      borderRadius: 2,
      controlHeight: 30,
    },
    Select: {
      borderRadius: 2,
      controlHeight: 30,
    },
    Tag: {
      borderRadiusSM: 2,
    },
    Divider: {
      colorSplit: '#ebebeb',
    },
    Form: {
      labelFontSize: 12,
      itemMarginBottom: 16,
    },
  },
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider locale={zhCN} theme={enterpriseTheme}>
      <App />
    </ConfigProvider>
  </React.StrictMode>
)
