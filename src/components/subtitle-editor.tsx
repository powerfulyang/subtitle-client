'use client';

import {motion, AnimatePresence} from 'framer-motion';
import {Clock, Edit2, Play, Download, FileText} from 'lucide-react';
import {Subtitle} from '@/lib/srt-parser';
import {stringifySrt} from '@/lib/srt-parser';
import {useEffect, useMemo, useState} from 'react';

interface SubtitleEditorProps {
  subtitles: Subtitle[];
  onSubtitleChange: (index: number, text: string) => void;
  onSubtitleClick: (startTime: string) => void;
  currentTime?: number;
}

// 将SRT时间格式转换为秒数
const srtTimeToSeconds = (time: string): number => {
  const [hours, minutes, seconds] = time.split(':');
  const [secs, millis] = seconds.split(',');
  return parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(secs) + parseInt(millis) / 1000;
};

export default function SubtitleEditor({
                                         subtitles,
                                         onSubtitleChange,
                                         onSubtitleClick,
                                         currentTime = 0
                                       }: SubtitleEditorProps) {
  const [isExporting, setIsExporting] = useState(false);

  // 使用 useMemo 缓存 activeSubtitleIndex 的计算
  const activeSubtitleIndex = useMemo(() => {
    // 使用二分查找优化性能
    if (subtitles.length === 0) return -1;

    let left = 0;
    let right = subtitles.length - 1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const startTime = srtTimeToSeconds(subtitles[mid].startTime);
      const endTime = srtTimeToSeconds(subtitles[mid].endTime);

      if (currentTime >= startTime && currentTime <= endTime) {
        return mid;
      } else if (currentTime < startTime) {
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }

    return -1;
  }, [currentTime, subtitles]);

  useEffect(() => {
    const activeElement = document.getElementById(`subtitle-editor-item-${activeSubtitleIndex}`);
    if (activeElement) {
      activeElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'nearest'
      });
    }
  }, [activeSubtitleIndex]);

  // SRT文件导出功能
  const exportSrtFile = async () => {
    if (subtitles.length === 0) {
      alert('没有字幕内容可导出');
      return;
    }

    setIsExporting(true);

    try {
      // 使用现有的stringifySrt函数生成SRT内容
      const srtContent = stringifySrt(subtitles);

      // 创建Blob对象
      const blob = new Blob([srtContent], {
        type: 'text/plain;charset=utf-8'
      });

      // 创建下载链接
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      // 生成文件名（包含时间戳）
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      link.download = `subtitles-${timestamp}.srt`;

      // 触发下载
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // 清理URL对象
      URL.revokeObjectURL(url);

    } catch (error) {
      console.error('导出SRT文件失败:', error);
      alert('导出失败，请重试');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      <div
        className="space-y-3 subtitle-editor-container overflow-y-auto max-h-[calc(100vh-20rem)]"
      >
        <AnimatePresence>
          {subtitles.map((sub, index) => {
            const isActive = index === activeSubtitleIndex;

            return (
              <motion.div
                key={sub.id}
                id={`subtitle-editor-item-${index}`}
                initial={{opacity: 0, y: 20}}
                animate={{opacity: 1, y: 0}}
                exit={{opacity: 0, y: -20}}
                transition={{delay: index * 0.05}}
                className={`subtitle-item group ${isActive ? 'active' : ''}`}
                onClick={() => onSubtitleClick(sub.startTime)}
              >
                {/* 时间轴头部 */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2 text-sm">
                    <Clock className={`w-4 h-4 ${isActive ? 'text-blue-400' : 'text-gray-400'}`}/>
                    <span className={`font-mono ${isActive ? 'text-blue-300' : 'text-gray-300'}`}>
                    {sub.startTime}
                  </span>
                    <span className="text-gray-500">→</span>
                    <span className={`font-mono ${isActive ? 'text-blue-300' : 'text-gray-300'}`}>
                    {sub.endTime}
                  </span>
                  </div>
                </div>

                {/* 字幕内容编辑器 */}
                <div className="relative">
                  <motion.textarea
                    value={sub.text}
                    onChange={(e) => {
                      e.stopPropagation();
                      onSubtitleChange(index, e.target.value);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="subtitle-textarea"
                    placeholder="输入字幕内容..."
                    rows={Math.max(2, Math.ceil(sub.text.length / 40))}
                    style={{
                      height: 'auto',
                      minHeight: '80px',
                      maxHeight: '200px',
                      resize: 'vertical'
                    }}
                    whileFocus={{scale: 1.01}}
                  />
                </div>

                {/* 字符统计和状态指示器 */}
                <div className="flex justify-between items-center mt-2 text-xs">
                  <div className={`${isActive ? 'text-blue-400' : 'text-gray-500'}`}>
                    第 {index + 1} 条 {isActive && '• 正在播放'}
                  </div>
                  <div className="flex items-center space-x-2">
                  <span className={isActive ? 'text-blue-400' : 'text-gray-500'}>
                    {sub.text.length} 字符
                  </span>
                    {isActive && (
                      <motion.div
                        className="w-2 h-2 bg-blue-400 rounded-full"
                        animate={{scale: [1, 1.2, 1]}}
                        transition={{repeat: Infinity, duration: 1.5}}
                      />
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* 空状态提示 */}
        {subtitles.length === 0 && (
          <motion.div
            className="text-center py-8 text-gray-500"
            initial={{opacity: 0}}
            animate={{opacity: 1}}
          >
            <div className="text-sm">暂无字幕内容</div>
          </motion.div>
        )}
      </div>
      {/* 导出按钮区域 */}
      <div className="flex justify-end items-center p-2 mt-2 bg-gray-800/50 rounded-lg">
        <motion.button
          onClick={exportSrtFile}
          disabled={isExporting || subtitles.length === 0}
          className={`
            flex items-center space-x-2 px-4 py-2 rounded-md text-xs font-medium
            transition-all duration-200 ease-in-out cursor-pointer
            ${subtitles.length === 0
            ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
            : 'bg-blue-600 hover:bg-blue-700 text-white hover:shadow-lg'
          }
            ${isExporting ? 'opacity-75 cursor-wait' : ''}
          `}
          whileHover={subtitles.length > 0 ? {scale: 1.02} : {}}
          whileTap={subtitles.length > 0 ? {scale: 0.98} : {}}
        >
          <Download className={`w-4 h-4 ${isExporting ? 'animate-bounce' : ''}`}/>
          <span>
            {isExporting ? '导出中...' : '导出 SRT'}
          </span>
        </motion.button>
      </div>
    </>
  );
}
