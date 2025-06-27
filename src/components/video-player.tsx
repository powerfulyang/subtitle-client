'use client';

import { Subtitle } from '@/lib/srt-parser';
import { motion } from 'framer-motion';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState, useCallback } from 'react';

interface VideoPlayerProps {
  videoUrl: string;
  onTimeUpdate?: (time: number) => void;
  subtitles?: Subtitle[];
}

export interface VideoPlayerRef {
  seekTo: (time: number) => void;
  play: () => void;
  pause: () => void;
}

// 将SRT时间格式转换为秒数
const srtTimeToSeconds = (time: string): number => {
  const [hours, minutes, seconds] = time.split(':');
  const [secs, millis] = seconds.split(',');
  return parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(secs) + parseInt(millis) / 1000;
};

const VideoPlayer = forwardRef<VideoPlayerRef, VideoPlayerProps>(({ 
  videoUrl, 
  onTimeUpdate, 
  subtitles = [] 
}, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const rafRef = useRef<number>(0);
  const lastUpdateRef = useRef<number>(0);

  // 暴露给父组件的方法
  useImperativeHandle(ref, () => ({
    seekTo: (time: number) => {
      if (videoRef.current) {
        videoRef.current.currentTime = time;
        videoRef.current.play();
      }
    },
    play: () => {
      if (videoRef.current) {
        videoRef.current.play();
      }
    },
    pause: () => {
      if (videoRef.current) {
        videoRef.current.pause();
      }
    }
  }));

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      // 取消之前的 RAF
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }

      rafRef.current = requestAnimationFrame(() => {
        const currentTime = video.currentTime;
        
        // 只在时间变化超过 0.1 秒时更新（避免过于频繁的更新）
        if (Math.abs(currentTime - lastUpdateRef.current) > 0.1) {
          lastUpdateRef.current = currentTime;
          setCurrentTime(currentTime);
          onTimeUpdate?.(currentTime);
        }
      });
    };

    video.addEventListener('timeupdate', handleTimeUpdate);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [onTimeUpdate]);

  // 优化字幕查找：使用二分查找
  const getCurrentSubtitle = useCallback((): string | null => {
    if (subtitles.length === 0) return null;
    
    let left = 0;
    let right = subtitles.length - 1;
    
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const startTime = srtTimeToSeconds(subtitles[mid].startTime);
      const endTime = srtTimeToSeconds(subtitles[mid].endTime);
      
      if (currentTime >= startTime && currentTime <= endTime) {
        return subtitles[mid].text;
      } else if (currentTime < startTime) {
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }
    
    return null;
  }, [currentTime, subtitles]);

  const currentSubtitle = getCurrentSubtitle();

  return (
    <div className="relative bg-black rounded-lg overflow-hidden">
      <video
        ref={videoRef}
        src={videoUrl}
        controls
        className="w-full h-auto"
      />

      {/* 字幕显示 */}
      {currentSubtitle && (
        <motion.div
          key={currentSubtitle}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.3 }}
          className="absolute max-w-full w-max bottom-16 left-1/2 transform -translate-x-1/2 bg-black/80 text-white px-4 py-2 rounded-lg text-center backdrop-blur-sm"
        >
          {currentSubtitle}
        </motion.div>
      )}
    </div>
  );
});

VideoPlayer.displayName = 'VideoPlayer';

export default VideoPlayer;
