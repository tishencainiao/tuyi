import type { ThemeConfig } from 'antd';

/** Ant Design 主题令牌：天蓝主色（呼应小忆·小云朵精灵），点缀暖橙（太阳）。 */
export const theme: ThemeConfig = {
  token: {
    colorPrimary: '#0EA5E9',
    colorInfo: '#0EA5E9',
    colorSuccess: '#10B981',
    colorWarning: '#F59E0B',
    colorError: '#EF4444',
    colorLink: '#0284C7',
    colorTextBase: '#0F172A',
    colorBgBase: '#F0F9FF',
    colorBgLayout: '#F0F9FF',
    colorBorder: '#BAE6FD',
    colorBorderSecondary: '#E0F2FE',
    borderRadius: 12,
    fontFamily:
      "-apple-system, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
  },
  components: {
    Layout: { headerBg: '#FFFFFF', siderBg: '#FFFFFF' },
    Card: { borderRadiusLG: 16 },
  },
};

/** 自绘样式用的语义令牌（与主题保持一致）。 */
export const tokens = {
  sky: '#0EA5E9',
  skyDeep: '#0284C7',
  skySoft: '#E0F2FE',
  cloud: '#FFFFFF',
  sun: '#FB923C',
  text: '#0F172A',
  textSoft: '#475569',
  bg: '#F0F9FF',
  line: '#BAE6FD',
};
