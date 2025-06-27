'use client';

import {useState, useRef, useCallback} from 'react';
import {motion, AnimatePresence} from 'framer-motion';
import {
  Video,
  Upload,
  Zap,
  CheckCircle,
  FileVideo,
  Wand2,
  Edit3,
  Play,
  Loader2,
  Music
} from 'lucide-react';
import FileUploader from '@/components/file-uploader';
import VideoPlayer, {VideoPlayerRef} from '@/components/video-player';
import SubtitleEditor from '@/components/subtitle-editor';
import {extractAudio} from '@/lib/ffmpeg';
import {parseSrt, Subtitle} from '@/lib/srt-parser';
import {toast} from 'react-toastify';
import ky from "ky";
import {BACKUP_TRANSCRIBE_API_URL} from "@/constants";

export default function Home() {
  const [videoUrl, setVideoUrl] = useState('');
  const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [enableVocalSeparation, setEnableVocalSeparation] = useState(false);
  const videoRef = useRef<VideoPlayerRef>(null);

  const handleFileSelect = (file: File) => {
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
      // 清空字幕
      setSubtitles([]);
      setCurrentTime(0);
    }
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
  };

  const handleGenerateSubtitles = async (file: File) => {
    setIsGenerating(true);
    try {
      const audioBlob = await extractAudio(file);
      console.log(`文件大小, ${(audioBlob.size / 1000 / 1000).toFixed(2)}MB`)
      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.mp3');
      formData.append('enable_vocal_separation', enableVocalSeparation.toString());

      let response = await ky<any>('/api/transcribe', {
        method: 'POST',
        body: formData,
        timeout: false,
        throwHttpErrors: false
      });

      if (!response.ok) {
        toast.warn('GPU 服务器暂时不可用，回退到 CPU 服务器，速度可能很慢')
        response = await ky<any>(BACKUP_TRANSCRIBE_API_URL, {
          method: 'POST',
          body: formData,
          timeout: false
        })
      }

      const data = await response.json();
      const parsedSubtitles = parseSrt(data.srt_content);
      setSubtitles(parsedSubtitles);
      toast.success('字幕生成成功');
    } catch (error) {
      console.error('字幕生成失败:', error);
      toast.error('字幕生成失败');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSubtitleChange = (index: number, text: string) => {
    const newSubtitles = [...subtitles];
    newSubtitles[index].text = text;
    setSubtitles(newSubtitles);
  };

  const handleSubtitleClick = useCallback((startTime: string) => {
    const time = srtTimeToSeconds(startTime);
    videoRef.current?.seekTo(time);
  }, []);

  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  const srtTimeToSeconds = (time: string) => {
    const [hours, minutes, seconds] = time.split(':');
    const [secs, millis] = seconds.split(',');
    return parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(secs) + parseInt(millis) / 1000;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-slate-800">
      {/* 装饰性背景元素 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
        <motion.div
          className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl"
          animate={{
            scale: [1.2, 1, 1.2],
            opacity: [0.5, 0.3, 0.5],
          }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 2
          }}
        />
      </div>

      {/* 头部 */}
      <motion.header
        className="relative z-10 flex justify-between items-center p-6 bg-gray-900/50"
        style={{backdropFilter: 'blur(4px)'}}
        initial={{y: -100, opacity: 0}}
        animate={{y: 0, opacity: 1}}
        transition={{duration: 0.5}}
      >
        <div className="flex items-center space-x-4">
          <motion.div
            className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center"
            whileHover={{scale: 1.1, rotate: 10}}
            whileTap={{scale: 0.9}}
          >
            <FileVideo className="w-6 h-6 text-white"/>
          </motion.div>
          <div>
            <h1
              className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              AI字幕编辑器
            </h1>
            <p className="text-gray-400 text-sm">智能语音识别 · 实时编辑 · 专业工具</p>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <FileUploader onFileSelect={handleFileSelect}/>
          <div className="text-sm text-gray-400 flex items-center space-x-2">
            <Upload className="w-4 h-4"/>
            <span>支持 MP4, AVI, MOV 等格式</span>
          </div>
        </div>
      </motion.header>

      {/* 主内容区域 */}
      <main className="relative z-10 p-6">
        <div className="max-w-7xl mx-auto">
          <AnimatePresence mode="wait">
            {!videoUrl ? (
              // 欢迎界面
              <motion.div
                key="welcome"
                className="text-center py-20"
                initial={{opacity: 0, y: 20}}
                animate={{opacity: 1, y: 0}}
                exit={{opacity: 0, y: -20}}
                transition={{duration: 0.6}}
              >
                <div className="glass-card max-w-2xl mx-auto p-12">
                  <motion.div
                    className="w-24 h-24 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full mx-auto mb-8 flex items-center justify-center"
                    animate={{
                      y: [0, -10, 0],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                  >
                    <Video className="w-12 h-12 text-white"/>
                  </motion.div>
                  <motion.h2
                    className="text-4xl font-bold text-white mb-4"
                    initial={{opacity: 0, y: 20}}
                    animate={{opacity: 1, y: 0}}
                    transition={{delay: 0.2}}
                  >
                    开始您的字幕创作之旅
                  </motion.h2>
                  <motion.p
                    className="text-xl text-gray-300 mb-8"
                    initial={{opacity: 0, y: 20}}
                    animate={{opacity: 1, y: 0}}
                    transition={{delay: 0.3}}
                  >
                    上传视频文件，AI将自动为您生成准确的字幕，您可以实时编辑和调整
                  </motion.p>
                  <motion.div
                    className="flex flex-col sm:flex-row gap-4 justify-center items-center"
                    initial={{opacity: 0, y: 20}}
                    animate={{opacity: 1, y: 0}}
                    transition={{delay: 0.4}}
                  >
                    <motion.div
                      className="flex items-center space-x-2 text-green-400"
                      whileHover={{scale: 1.05}}
                    >
                      <CheckCircle className="w-5 h-5"/>
                      <span>AI语音识别</span>
                    </motion.div>
                    <motion.div
                      className="flex items-center space-x-2 text-green-400"
                      whileHover={{scale: 1.05}}
                    >
                      <CheckCircle className="w-5 h-5"/>
                      <span>实时编辑</span>
                    </motion.div>
                    <motion.div
                      className="flex items-center space-x-2 text-green-400"
                      whileHover={{scale: 1.05}}
                    >
                      <CheckCircle className="w-5 h-5"/>
                      <span>多格式支持</span>
                    </motion.div>
                  </motion.div>
                </div>
              </motion.div>
            ) : (
              // 工作界面
              <motion.div
                key="workspace"
                className="grid grid-cols-1 xl:grid-cols-3 gap-6"
                initial={{opacity: 0, scale: 0.95}}
                animate={{opacity: 1, scale: 1}}
                exit={{opacity: 0, scale: 0.95}}
                transition={{duration: 0.5}}
              >
                {/* 视频播放器区域 */}
                <motion.div
                  className="xl:col-span-2"
                  initial={{x: -50, opacity: 0}}
                  animate={{x: 0, opacity: 1}}
                  transition={{delay: 0.1}}
                >
                  <div className="glass-card p-6">
                    <div className="flex justify-between items-center mb-6">
                      <h2 className="text-2xl font-bold text-white flex items-center space-x-3">
                        <span>视频播放器</span>
                      </h2>
                      {videoUrl && (
                        <div className="flex items-center space-x-4">
                          {/* 人声分离开关 */}
                          <motion.div
                            className="flex items-center space-x-3 text-sm"
                            initial={{opacity: 0, x: 20}}
                            animate={{opacity: 1, x: 0}}
                            transition={{delay: 0.1}}
                          >
                            <div className="flex items-center space-x-2 text-gray-300">
                              <Music className="w-4 h-4"/>
                              <span>人声分离</span>
                            </div>
                            <motion.label
                              className="relative inline-flex items-center cursor-pointer"
                              whileHover={{scale: 1.05}}
                              whileTap={{scale: 0.95}}
                            >
                              <input
                                type="checkbox"
                                checked={enableVocalSeparation}
                                onChange={(e) => setEnableVocalSeparation(e.target.checked)}
                                className="sr-only peer"
                                disabled={isGenerating}
                              />
                              <div
                                className={`relative w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer transition-all duration-200 ${
                                  enableVocalSeparation
                                    ? 'peer-checked:bg-gradient-to-r peer-checked:from-blue-500 peer-checked:to-purple-500'
                                    : ''
                                } ${isGenerating ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                <motion.div
                                  className="absolute top-[2px] left-[2px] bg-white rounded-full h-5 w-5 transition-all duration-200 shadow-lg"
                                  animate={{
                                    x: enableVocalSeparation ? 20 : 0,
                                  }}
                                  transition={{type: "spring", stiffness: 300, damping: 30}}
                                />
                              </div>
                            </motion.label>
                            <div className="text-xs text-gray-400">
                              {enableVocalSeparation ? '开启' : '关闭'}
                            </div>
                          </motion.div>

                          {/* AI生成字幕按钮 */}
                          <motion.button
                            onClick={() => {
                              fetch(videoUrl)
                                .then(res => res.blob())
                                .then(blob => new File([blob], "video.mp4", {type: blob.type}))
                                .then(file => handleGenerateSubtitles(file));
                            }}
                            disabled={isGenerating}
                            className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all duration-200 cursor-pointer ${
                              isGenerating
                                ? 'bg-gray-600 cursor-not-allowed opacity-50'
                                : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 transform hover:scale-105'
                            } text-white font-semibold shadow-lg`}
                            whileHover={!isGenerating ? {scale: 1.05} : {}}
                            whileTap={!isGenerating ? {scale: 0.95} : {}}
                          >
                            {isGenerating ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin"/>
                                <span>生成中...</span>
                              </>
                            ) : (
                              <>
                                <Wand2 className="w-4 h-4"/>
                                <span>AI生成字幕</span>
                              </>
                            )}
                          </motion.button>
                        </div>
                      )}
                    </div>
                    <motion.div
                      className="rounded-xl overflow-hidden"
                      initial={{scale: 0.9, opacity: 0}}
                      animate={{scale: 1, opacity: 1}}
                      transition={{delay: 0.2}}
                    >
                      <VideoPlayer
                        ref={videoRef}
                        videoUrl={videoUrl}
                        onTimeUpdate={handleTimeUpdate}
                        subtitles={subtitles}
                      />
                    </motion.div>
                  </div>
                </motion.div>

                {/* 字幕编辑器区域 */}
                <motion.div
                  className="xl:col-span-1"
                  initial={{x: 50, opacity: 0}}
                  animate={{x: 0, opacity: 1}}
                  transition={{delay: 0.2}}
                >
                  <div className="glass-card p-6 h-full flex flex-col">
                    <div className="flex justify-between items-center mb-4">
                      <h2 className="text-2xl font-bold text-white flex items-center space-x-3">
                        <Edit3 className="w-6 h-6 text-purple-400"/>
                        <span>字幕编辑器</span>
                      </h2>
                      <AnimatePresence>
                        {subtitles.length > 0 && (
                          <motion.div
                            className="text-sm text-gray-400 bg-gray-800/60 px-3 py-1 rounded-full backdrop-blur-sm"
                            initial={{scale: 0, opacity: 0}}
                            animate={{scale: 1, opacity: 1}}
                            exit={{scale: 0, opacity: 0}}
                          >
                            {subtitles.length} 条字幕
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <AnimatePresence mode="wait">
                      {subtitles.length === 0 ? (
                        <motion.div
                          key="empty"
                          className="text-center py-12"
                          initial={{opacity: 0, y: 20}}
                          animate={{opacity: 1, y: 0}}
                          exit={{opacity: 0, y: -20}}
                        >
                          <motion.div
                            className="w-16 h-16 bg-gray-700/50 rounded-full mx-auto mb-4 flex items-center justify-center backdrop-blur-sm"
                            animate={{
                              scale: [1, 1.1, 1],
                            }}
                            transition={{
                              duration: 2,
                              repeat: Infinity,
                              ease: "easeInOut"
                            }}
                          >
                            <FileVideo className="w-8 h-8 text-gray-400"/>
                          </motion.div>
                          <p className="text-gray-400 mb-2">还没有字幕</p>
                          <p className="text-sm text-gray-500">上传视频后点击"AI生成字幕"开始</p>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="editor"
                          className="flex-1"
                          initial={{opacity: 0}}
                          animate={{opacity: 1}}
                          transition={{delay: 0.3}}
                        >
                          <SubtitleEditor
                            subtitles={subtitles}
                            onSubtitleChange={handleSubtitleChange}
                            onSubtitleClick={handleSubtitleClick}
                            currentTime={currentTime}
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
