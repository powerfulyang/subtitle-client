import type { AssStyles } from '@/lib/ass'
import type { CustomFont } from '@/lib/ffmpeg'
import {
  Button,
  ColorPicker,
  Flex,
  InputNumber,
  Segmented,
  Select,
  Spin,
  Typography,
  Upload,
} from 'antd'
import { motion } from 'framer-motion'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Brush,
  MoveVertical,
  Palette,
  RotateCcw,
  Settings2,
  Type,
  UploadCloud,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { DEFAULT_ASS_STYLES } from '@/lib/ass'

const { Text } = Typography

interface LocalFontData {
  family: string
  fullName: string
  postscriptName: string
  blob: () => Promise<Blob>
}

declare global {
  interface Window {
    queryLocalFonts?: () => Promise<LocalFontData[]>
  }
}

interface StylePanelProps {
  styles: AssStyles
  customFont: CustomFont | null
  onStylesChange: (styles: AssStyles) => void
  onFontChange: (font: CustomFont | null) => void
}

export function StylePanel({ styles, customFont, onStylesChange, onFontChange }: StylePanelProps) {
  const [localFonts, setLocalFonts] = useState<LocalFontData[]>([])
  const [isLoadingFonts, setIsLoadingFonts] = useState(false)

  const patch = <K extends keyof AssStyles>(key: K, value: AssStyles[K]) => {
    onStylesChange({ ...styles, [key]: value })
  }

  const isLocalFontsSupported = typeof window !== 'undefined' && typeof window.queryLocalFonts === 'function'

  const loadLocalFonts = async () => {
    if (!window.queryLocalFonts)
      return

    setIsLoadingFonts(true)
    try {
      const fonts = await window.queryLocalFonts()
      const uniqueFonts = fonts
        .filter((font, index, array) =>
          index === array.findIndex(candidate => candidate.family === font.family),
        )
        .sort((left, right) => getFontLabel(left).localeCompare(getFontLabel(right), 'zh-Hans-CN'))

      setLocalFonts(uniqueFonts)
    }
    catch (error) {
      console.error('读取本机字体失败', error)
    }
    finally {
      setIsLoadingFonts(false)
    }
  }

  useEffect(() => {
    if (!isLocalFontsSupported)
      return

    void loadLocalFonts()
  }, [isLocalFontsSupported])

  const handleFontUpload = async (file: File) => {
    const extension = file.name.split('.').pop()?.toLowerCase()
    if (!extension || !['ttf', 'otf', 'woff', 'woff2'].includes(extension))
      return false

    const fontName = file.name.replace(/\.[^/.]+$/, '')
    patch('fontName', fontName)
    onFontChange({
      blob: file,
      name: fontName,
      fileName: file.name,
    })

    return false
  }

  const localFontOptions = useMemo(() => {
    return localFonts.map((font) => {
      const label = getFontLabel(font)
      return {
        label: (
          <span style={{ fontFamily: font.family }}>
            {label}
          </span>
        ),
        value: font.family,
        filterLabel: label,
      }
    })
  }, [localFonts])

  const selectedLocalFont = localFonts.some(font => font.family === styles.fontName)

  const handleLocalFontSelect = async (fontFamily: string) => {
    const selectedFont = localFonts.find(font => font.family === fontFamily)
    if (!selectedFont)
      return

    patch('fontName', selectedFont.family)

    try {
      const blob = await selectedFont.blob()
      onFontChange({
        blob,
        name: selectedFont.family,
        fileName: `${selectedFont.postscriptName || selectedFont.family}.ttf`,
      })
    }
    catch (error) {
      console.error('加载本机字体失败', error)
    }
  }

  return (
    <motion.div
      className="style-popover-panel"
      initial={{ opacity: 0, scale: 0.98, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      <Flex vertical gap={12}>
        <div className="style-panel-header">
          <div>
            <Text className="panel-kicker">Appearance</Text>
            <h3 className="panel-title flex items-center gap-1.5 text-[16px] mb-0 leading-tight">
              <Brush size={16} className="text-blue-500" />
              字幕样式
            </h3>
            <Text className="style-panel-subtitle">字体、位置和颜色会即时同步到预览区域</Text>
          </div>
          <div className="style-panel-badge">{styles.fontName}</div>
        </div>

        <Flex vertical gap={6} className="style-section">
          <Text className="field-label">
            <Type size={12} />
            字体名称
          </Text>
          <Select
            showSearch
            value={selectedLocalFont ? styles.fontName : undefined}
            onChange={value => void handleLocalFontSelect(value)}
            options={localFontOptions}
            placeholder={isLocalFontsSupported ? (styles.fontName || '请选择本机字体') : '当前浏览器不支持本机字体 API'}
            optionFilterProp="filterLabel"
            disabled={!isLocalFontsSupported || isLoadingFonts}
            suffixIcon={isLoadingFonts ? <Spin size="small" /> : undefined}
            className="style-font-select"
            popupMatchSelectWidth={false}
            notFoundContent={isLoadingFonts ? '正在读取字体...' : '未读取到本机字体'}
          />
          <Text className="style-helper-text">
            {isLocalFontsSupported ? '使用本机字体 API 读取系统字体，下拉选择后会自动附带字体文件。' : '请改用下方上传字体文件。'}
          </Text>
        </Flex>

        <div className="style-grid">
          <div className="style-grid-item">
            <Text className="field-label">
              <Type size={12} />
              {' '}
              字号
            </Text>
            <InputNumber
              style={{ width: '100%' }}
              min={12}
              max={200}
              value={styles.fontSize}
              onChange={value => patch('fontSize', value || 54)}
            />
          </div>
          <div className="style-grid-item">
            <Text className="field-label">
              <MoveVertical size={12} />
              {' '}
              底部边距
            </Text>
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              max={300}
              value={styles.marginV}
              onChange={value => patch('marginV', value || 36)}
            />
          </div>
        </div>

        <div className="style-color-grid">
          {([
            ['primaryColor', '文字色', Palette],
            ['outlineColor', '描边色', Brush],
            ['backgroundColor', '底色', Settings2],
          ] as const).map(([key, label, Icon]) => (
            <div key={key} className="style-color-card">
              <Text className="field-label">
                <Icon size={12} />
                {' '}
                {label}
              </Text>
              <ColorPicker
                value={styles[key]}
                onChange={color => patch(key, color.toHexString())}
                showText
              />
            </div>
          ))}
        </div>

        <div className="style-align-card">
          <Text className="field-label">
            <AlignLeft size={12} />
            {' '}
            文本对齐
          </Text>
          <Segmented
            block
            value={styles.alignment}
            onChange={value => patch('alignment', Number(value) || 2)}
            options={[
              { label: (
                <div className="flex items-center justify-center gap-1.5">
                  <AlignLeft size={14} />
                  {' '}
                  左对齐
                </div>
              ), value: 1 },
              { label: (
                <div className="flex items-center justify-center gap-1.5">
                  <AlignCenter size={14} />
                  {' '}
                  居中
                </div>
              ), value: 2 },
              { label: (
                <div className="flex items-center justify-center gap-1.5">
                  <AlignRight size={14} />
                  {' '}
                  右对齐
                </div>
              ), value: 3 },
            ]}
          />
        </div>

        <Flex vertical gap={8} className="px-1 pb-1">
          <Upload
            accept=".ttf,.otf,.woff,.woff2"
            showUploadList={false}
            beforeUpload={handleFontUpload}
          >
            <Button block icon={<UploadCloud size={14} />} type={customFont ? 'primary' : 'default'} className={customFont ? 'style-action-button' : 'style-default-font-button'}>
              {customFont ? `已加载：${customFont.name}` : '上传并使用自定义字体'}
            </Button>
          </Upload>

          {customFont && (
            <Button block onClick={() => onFontChange(null)} className="style-default-font-button">
              取消使用自定义字体
            </Button>
          )}

          <Button
            block
            type="text"
            icon={<RotateCcw size={14} />}
            className="style-reset-button mt-1"
            onClick={() => {
              onStylesChange(DEFAULT_ASS_STYLES)
              onFontChange(null)
            }}
          >
            重置恢复默认样式
          </Button>
        </Flex>
      </Flex>
    </motion.div>
  )
}

function getFontLabel(font: LocalFontData) {
  return font.fullName || font.family || font.postscriptName || 'Unknown Font'
}
