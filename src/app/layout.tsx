import type { Metadata } from 'next'
import './globals.css'
import { ToastContainer } from 'react-toastify'

export const metadata: Metadata = {
  title: 'AI字幕编辑器 - Subtitle Editor',
  description: '专业的AI字幕生成与编辑工具，支持多种视频格式，智能语音识别，实时编辑',
  keywords: '字幕编辑器,AI字幕,语音识别,视频字幕,字幕生成',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <body className="antialiased min-h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-slate-800">
        {children}
        <ToastContainer/>
      </body>
    </html>
  )
}
