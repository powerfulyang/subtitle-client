import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { codeInspectorPlugin } from 'code-inspector-plugin'
import { defineConfig, loadEnv } from 'vite'

function prefetchAllChunks() {
  let base = '/'
  return {
    name: 'prefetch-all-chunks',
    configResolved(config: any) {
      base = config.base || '/'
    },
    transformIndexHtml(html: string, ctx: any) {
      if (!ctx.bundle)
        return html

      const tags: any[] = []
      for (const chunk of Object.values(ctx.bundle) as any[]) {
        if (chunk.type === 'chunk' && !chunk.isEntry) {
          tags.push({
            tag: 'link',
            attrs: {
              rel: 'prefetch',
              href: base + chunk.fileName,
              as: 'script',
              crossorigin: 'anonymous',
            },
            injectTo: 'head',
          })
        }
        else if (chunk.type === 'asset' && chunk.fileName.endsWith('.css')) {
          tags.push({
            tag: 'link',
            attrs: {
              rel: 'prefetch',
              href: base + chunk.fileName,
              as: 'style',
            },
            injectTo: 'head',
          })
        }
      }
      return tags
    },
  }
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      codeInspectorPlugin({
        bundler: 'vite',
      }),
      react(),
      prefetchAllChunks(),
    ],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('react') || id.includes('react-dom') || id.includes('scheduler'))
                return 'vendor-react'
              if (id.includes('antd') || id.includes('@ant-design') || id.includes('rc-'))
                return 'vendor-antd'
              if (id.includes('framer-motion'))
                return 'vendor-motion'
              if (id.includes('lucide-react'))
                return 'vendor-icons'
              if (id.includes('mathlive'))
                return 'vendor-mathlive'
              if (id.includes('@tiptap'))
                return 'vendor-tiptap'
              if (id.includes('@ffmpeg') || id.includes('jassub'))
                return 'vendor-ffmpeg'
              if (id.includes('@tanstack') || id.includes('zustand') || id.includes('use-debounce'))
                return 'vendor-utils'
              return 'vendor-others'
            }
          },
        },
      },
      chunkSizeWarningLimit: 1000,
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
      proxy: {
        '/api': {
          target: env.VITE_PROXY_API_URL,
          changeOrigin: true,
        },
      },
    },
  }
})
