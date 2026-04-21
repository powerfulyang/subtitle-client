import { App as AntdApp, ConfigProvider, theme } from 'antd'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'sonner'
import { App } from './app/app'
import { QueryProvider } from './components/query-provider'
import './index.css'
import 'mathlive/fonts.css'
import 'mathlive/static.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: '#1677ff',
          borderRadius: 6,
          colorBgContainer: 'rgba(255, 255, 255, 0.7)',
          colorBgElevated: 'rgba(255, 255, 255, 0.9)',
          colorBorder: 'rgba(226, 232, 240, 0.6)',
          fontFamily: '"Outfit", "Noto Sans SC", sans-serif',
        },
        components: {
          Card: {
            colorBgContainer: 'rgba(255, 255, 255, 0.7)',
            borderRadiusLG: 8,
            boxShadowTertiary: '0 8px 32px 0 rgba(31, 38, 135, 0.07)',
          },
          Button: {
            borderRadius: 6,
            controlHeightLG: 38,
            fontWeight: 500,
          },
        },
      }}
    >
      <QueryProvider>
        <AntdApp>
          <App />
          <Toaster richColors position="top-center" />
        </AntdApp>
      </QueryProvider>
    </ConfigProvider>
  </StrictMode>,
)
