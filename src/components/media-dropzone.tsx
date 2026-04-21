import { Flex, Typography, Upload } from 'antd'
import { motion } from 'framer-motion'
import { CloudUpload, Video } from 'lucide-react'

const { Dragger } = Upload
const { Title, Text } = Typography

interface MediaDropzoneProps {
  onSelect: (file: File) => void
}

export function MediaDropzone({ onSelect }: MediaDropzoneProps) {
  return (
    <div className="media-dropzone-container">
      <Dragger
        multiple={false}
        accept="video/*"
        showUploadList={false}
        customRequest={({ file }) => {
          if (file instanceof File) {
            onSelect(file)
          }
        }}
        className="media-dropzone !bg-white/55 "
        style={{ padding: '24px 16px' }}
      >
        <motion.div
          whileHover={{ y: -4 }}
          transition={{ type: 'spring', stiffness: 300 }}
        >
          <Flex vertical align="center" gap="large">
            <div className="relative">
              <div className="flex size-16 items-center justify-center rounded-[20px] bg-blue-600 text-white shadow-lg shadow-blue-200/60">
                <Video size={28} />
              </div>
              <div className="absolute -bottom-1 -right-1 flex size-8 items-center justify-center rounded-xl bg-white shadow-lg text-blue-600">
                <CloudUpload size={16} />
              </div>
            </div>

            <Flex vertical align="center" gap="small">
              <Title level={5} className="!m-0 !font-black !tracking-tight">
                上传视频
              </Title>
              <Text type="secondary" className="text-xs text-center max-w-xs">
                将视频文件拖拽至此或点击上传，开启您的创作之旅
              </Text>
            </Flex>

            <Flex gap="small" wrap="wrap" justify="center">
              {['MP4', 'MOV', 'WebM', 'MKV'].map(ext => (
                <div key={ext} className="rounded-lg border border-slate-200 bg-white/80 px-3 py-1 shadow-sm">
                  <Text className="text-[11px] font-bold text-slate-500">{ext}</Text>
                </div>
              ))}
            </Flex>
          </Flex>
        </motion.div>
      </Dragger>
    </div>
  )
}
