'use client';

import {useState, useRef, useCallback} from 'react';
import {motion, AnimatePresence} from 'framer-motion';
import {
  Video,
  Upload,
  CheckCircle,
  FileVideo,
  Wand2,
  Edit3,
  Loader2,
  Music
} from 'lucide-react';
import dynamic from 'next/dynamic';
import FileUploader from '@/components/file-uploader';
import SubtitleEditor from '@/components/subtitle-editor';
import {extractAudio, burnSubtitles} from '@/lib/ffmpeg';
import {parseSrt, stringifySrt, Subtitle} from '@/lib/srt-parser';
import {AssStyles, DEFAULT_ASS_STYLES} from '@/lib/ass-utils';
import {toast} from 'react-toastify';
import ky from "ky";
import type {VideoPlayerRef} from '@/components/video-player';

// Dynamically import VideoPlayer with SSR disabled
const VideoPlayer = dynamic(() => import('@/components/video-player'), {
  ssr: false,
  loading: () => <div className="w-full aspect-video bg-gray-100 animate-pulse" />
});

export default function Home() {
  const [videoUrl, setVideoUrl] = useState('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isBurning, setIsBurning] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [enableVocalSeparation, setEnableVocalSeparation] = useState(false);
  const [selectedFont, setSelectedFont] = useState<{ blob: Blob; name: string; fileName: string } | null>(null);
  const [assStyles, setAssStyles] = useState<AssStyles>(DEFAULT_ASS_STYLES);
  
  const videoRef = useRef<VideoPlayerRef>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (file: File) => {
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
      setSubtitles([]);
      setCurrentTime(0);
    }
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    setVideoFile(file);
  };

  const handleTriggerUpload = () => {
    fileInputRef.current?.click();
  };

  const handleGenerateSubtitles = async () => {
    if (!videoFile) return;
    
    setIsGenerating(true);
    try {
      const audioBlob = await extractAudio(videoFile);
      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.mp3');
      formData.append('enable_vocal_separation', enableVocalSeparation.toString());

      let response = await ky<any>('/api/transcribe', {
        method: 'POST',
        body: formData,
        timeout: false,
        throwHttpErrors: false
      });

      const data = await response.json();
      const parsedSubtitles = parseSrt(data.srt_content);
      setSubtitles(parsedSubtitles);
      toast.success('Subtitles generated successfully');
    } catch (error) {
      console.error('Failed to generate subtitles:', error);
      toast.error('Failed to generate subtitles');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleBurn = async () => {
    if (!videoFile || subtitles.length === 0) return;

    setIsBurning(true);
    const toastId = toast.loading('Initializing burn process...');

    try {
      const srtContent = stringifySrt(subtitles);
      
      const burnedVideoBlob = await burnSubtitles(
        videoFile, 
        srtContent, 
        (progress) => {
          toast.update(toastId, { 
            render: `Burning video: ${progress}%`,
            type: "info",
            isLoading: true 
          });
        },
        selectedFont || undefined,
        assStyles
      );

      // Trigger download
      const url = URL.createObjectURL(burnedVideoBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `subtitled_${videoFile.name}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.update(toastId, { 
        render: 'Video burned successfully!', 
        type: "success", 
        isLoading: false,
        autoClose: 3000
      });
    } catch (error) {
      console.error('Burn failed:', error);
      toast.update(toastId, { 
        render: 'Failed to burn video', 
        type: "error", 
        isLoading: false,
        autoClose: 3000 
      });
    } finally {
      setIsBurning(false);
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
    <div className="min-h-screen bg-gray-50 text-gray-900 overflow-hidden flex flex-col">
      {/* Hidden Global Input */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
        accept="video/*,audio/*" 
        className="hidden" 
      />

      {/* Header */}
      <header className="sticky top-0 z-50 bg-white border-b border-gray-200 shrink-0">
        <div className="mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-7 h-7 bg-black rounded-md flex items-center justify-center">
              <FileVideo className="w-4 h-4 text-white"/>
            </div>
            <h1 className="text-lg font-bold text-gray-900 tracking-tight">
              Subtitle AI
            </h1>
          </div>
          <div className="flex items-center space-x-6">
            <div className="hidden sm:flex text-xs text-gray-500 items-center space-x-2">
              <Upload className="w-3.5 h-3.5"/>
              <span>MP4, AVI, MOV</span>
            </div>
            <FileUploader onFileSelect={handleFileSelect}/>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-4 mx-auto w-full flex-1 flex flex-col justify-center overflow-hidden">
        <AnimatePresence mode="wait">
          {!videoUrl ? (
            // Welcome Screen
            <motion.div
              key="welcome"
              className="flex flex-col items-center justify-center py-12"
              initial={{opacity: 0, y: 5}}
              animate={{opacity: 1, y: 0}}
              exit={{opacity: 0, y: -5}}
              transition={{duration: 0.3}}
            >
              <div className="bg-white p-12 rounded-md border border-gray-200 max-w-2xl text-center shadow-sm">
                <div className="w-14 h-14 bg-gray-50 text-gray-900 rounded-md mx-auto mb-6 flex items-center justify-center border border-gray-100">
                  <Video className="w-7 h-7"/>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-3">
                  Video Subtitle Generator
                </h2>
                <p className="text-base text-gray-600 mb-8 max-w-lg mx-auto leading-relaxed">
                  Upload your video, let AI transcribe the audio, and edit subtitles in real-time. Fast, private, and simple.
                </p>
                
                <div className="mb-8">
                  <button 
                    onClick={handleTriggerUpload}
                    className="btn-primary text-sm py-3 px-8 shadow-sm hover:shadow-md transition-all transform hover:-translate-y-0.5 cursor-pointer"
                  >
                    Start Project
                  </button>
                </div>

                <div className="flex gap-6 justify-center text-xs font-medium text-gray-500">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5 text-black"/>
                    <span>Smart Recognition</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5 text-black"/>
                    <span>Instant Edit</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle className="w-3.5 h-3.5 text-black"/>
                    <span>Export SRT</span>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : (
            // Workspace
            <motion.div
              key="workspace"
              className="grid grid-cols-1 xl:grid-cols-3 gap-4 h-[calc(100vh-8rem)] w-full"
              initial={{opacity: 0}}
              animate={{opacity: 1}}
              transition={{duration: 0.3}}
            >
              {/* Left Column: Video Player */}
              <div className="xl:col-span-2 h-full flex flex-col overflow-hidden">
                <div className="card-base p-4 h-full flex flex-col">
                  <div className="flex justify-between items-center mb-2 shrink-0">
                    <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2 uppercase tracking-wider">
                      Preview
                    </h2>
                    
                    {videoUrl && (
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <label className="text-xs font-medium text-gray-600 cursor-pointer select-none flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={enableVocalSeparation}
                              onChange={(e) => setEnableVocalSeparation(e.target.checked)}
                              disabled={isGenerating}
                              className="rounded-sm border-gray-300 text-black focus:ring-black disabled:opacity-50"
                            />
                            Vocal Isolation
                          </label>
                        </div>

                        <button
                          onClick={handleGenerateSubtitles}
                          disabled={isGenerating}
                          className={`btn-primary text-xs flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed ${isGenerating ? 'opacity-75' : ''}`}
                        >
                          {isGenerating ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin"/>
                              Processing...
                            </>
                          ) : (
                            <>
                              <Wand2 className="w-3.5 h-3.5"/>
                              Generate Subtitles
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-1 bg-transparent rounded-md overflow-hidden relative flex items-center justify-center aspect-video">
                    <VideoPlayer
                      ref={videoRef}
                      videoUrl={videoUrl}
                      onTimeUpdate={handleTimeUpdate}
                      subtitles={subtitles}
                      styles={assStyles}
                      customFont={selectedFont || undefined}
                    />
                  </div>
                </div>
              </div>

              {/* Right Column: Editor */}
              <div className="xl:col-span-1 h-full flex flex-col overflow-hidden">
                <div className="card-base p-4 h-full flex flex-col overflow-hidden">
                  <div className="flex justify-between items-center mb-2 pb-2 border-b border-gray-100 shrink-0">
                    <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">
                      Editor
                    </h2>
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-gray-100 text-gray-600 rounded-sm">
                      {subtitles.length} LINES
                    </span>
                  </div>

                  {subtitles.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8 text-center border border-dashed border-gray-200 rounded-md bg-gray-50/30">
                      <FileVideo className="w-8 h-8 mb-3 opacity-20 text-black"/>
                      <p className="text-xs font-medium">No subtitles yet</p>
                    </div>
                  ) : (
                    <div className="flex-1 overflow-hidden relative flex flex-col">
                       <SubtitleEditor
                          subtitles={subtitles}
                          onSubtitleChange={handleSubtitleChange}
                          onSubtitleClick={handleSubtitleClick}
                          onBurn={handleBurn}
                          isBurning={isBurning}
                          onFontSelect={setSelectedFont}
                          currentTime={currentTime}
                          styles={assStyles}
                          onStylesChange={setAssStyles}
                        />
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}