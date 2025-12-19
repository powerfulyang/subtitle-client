'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Download, Flame, Type, Settings, Upload, Palette, MoveVertical, LayoutTemplate } from 'lucide-react';
import { Subtitle, stringifySrt } from '@/lib/srt-parser';
import { AssStyles, DEFAULT_ASS_STYLES } from '@/lib/ass-utils';
import { useEffect, useMemo, useState } from 'react';

interface FontData {
  family: string;
  fullName: string;
  postscriptName: string;
  blob: () => Promise<Blob>;
}

declare global {
  interface Window {
    queryLocalFonts?: () => Promise<FontData[]>;
  }
}

interface SubtitleEditorProps {
  subtitles: Subtitle[];
  onSubtitleChange: (index: number, text: string) => void;
  onSubtitleClick: (startTime: string) => void;
  onBurn?: () => void;
  onFontSelect?: (font: { blob: Blob; name: string; fileName: string } | null) => void;
  styles?: AssStyles;
  onStylesChange?: (styles: AssStyles) => void;
  isBurning?: boolean;
  burnProgress?: number;
  currentTime?: number;
}

// Convert SRT time string to seconds
const srtTimeToSeconds = (time: string): number => {
  const [hours, minutes, seconds] = time.split(':');
  const [secs, millis] = seconds.split(',');
  return parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(secs) + parseInt(millis) / 1000;
};

export default function SubtitleEditor({
  subtitles,
  onSubtitleChange,
  onSubtitleClick,
  onBurn,
  onFontSelect,
  styles = DEFAULT_ASS_STYLES,
  onStylesChange,
  isBurning = false,
  burnProgress = 0,
  currentTime = 0
}: SubtitleEditorProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [systemFonts, setSystemFonts] = useState<FontData[]>([]);
  const [isLoadingFonts, setIsLoadingFonts] = useState(false);

  // Check if API is supported
  const isLocalFontsSupported = typeof window !== 'undefined' && 'queryLocalFonts' in window;

  const updateStyle = (key: keyof AssStyles, value: any) => {
    if (onStylesChange) {
      onStylesChange({ ...styles, [key]: value });
    }
  };

  const loadSystemFonts = async () => {
    if (!window.queryLocalFonts) return;
    setIsLoadingFonts(true);
    try {
      const fonts = await window.queryLocalFonts();
      const uniqueFonts = fonts.filter((font, index, self) =>
        index === self.findIndex((t) => t.family === font.family)
      );
      setSystemFonts(uniqueFonts);
    } catch (err) {
      console.error('Error querying fonts:', err);
    } finally {
      setIsLoadingFonts(false);
    }
  };

  const handleSystemFontSelect = async (fontFamily: string) => {
    const font = systemFonts.find(f => f.family === fontFamily);
    if (!font) return;

    try {
      const blob = await font.blob();
      if (onFontSelect) {
        onFontSelect({
          blob,
          name: font.family,
          fileName: `${font.postscriptName}.ttf`
        });
      }
      updateStyle('fontName', font.family);
    } catch (err) {
      console.error('Error reading font blob:', err);
      alert('Failed to load selected font.');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!file.name.match(/\.(ttf|otf|woff2?)$/i)) {
        alert('Please upload a valid font file (.ttf, .otf, .woff)');
        return;
      }
      const name = file.name.replace(/\.[^/.]+$/, "");
      if (onFontSelect) {
        onFontSelect({
          blob: file,
          name: name,
          fileName: file.name
        });
      }
      updateStyle('fontName', name);
    }
  };

  // Binary search for active subtitle index
  const activeSubtitleIndex = useMemo(() => {
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
    // Only scroll if the active subtitle is not visible or just to keep it centered
    // We use a slight delay to ensure render is complete
    const timeoutId = setTimeout(() => {
      const activeElement = document.getElementById(`subtitle-editor-item-${activeSubtitleIndex}`);
      if (activeElement) {
        activeElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'nearest'
        });
      }
    }, 100);
    return () => clearTimeout(timeoutId);
  }, [activeSubtitleIndex]);

  const exportSrtFile = async () => {
    if (subtitles.length === 0) return;

    setIsExporting(true);

    try {
      const srtContent = stringifySrt(subtitles);
      const blob = new Blob([srtContent], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      link.download = `subtitles-${timestamp}.srt`;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export SRT:', error);
      alert('Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto pr-2 subtitle-editor-container">
        <AnimatePresence initial={false}>
          {subtitles.map((sub, index) => {
            const isActive = index === activeSubtitleIndex;

            return (
              <motion.div
                key={sub.id}
                id={`subtitle-editor-item-${index}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`subtitle-item group ${isActive ? 'active' : ''}`}
                onClick={() => onSubtitleClick(sub.startTime)}
              >
                {/* Time Header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-xs font-medium">
                    <div className={`flex items-center gap-1 ${isActive ? 'text-blue-600' : 'text-gray-400'}`}>
                      <Clock className="w-3 h-3" />
                      <span className="font-mono">{sub.startTime}</span>
                    </div>
                    <span className="text-gray-300">→</span>
                    <span className={`font-mono ${isActive ? 'text-blue-600' : 'text-gray-400'}`}>
                      {sub.endTime}
                    </span>
                  </div>
                  <span className={`text-xs ${isActive ? 'text-blue-500 font-semibold' : 'text-gray-300'}`}>
                    #{index + 1}
                  </span>
                </div>

                {/* Text Editor */}
                <textarea
                  value={sub.text}
                  onChange={(e) => {
                    e.stopPropagation();
                    onSubtitleChange(index, e.target.value);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="subtitle-textarea text-sm"
                  rows={Math.max(2, Math.ceil(sub.text.length / 50))}
                  style={{ height: 'auto' }}
                />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Style Settings & Actions */}
      <div className="mt-4 pt-4 border-t border-gray-100 flex flex-col gap-3">
        {/* Settings Toggle */}
        <div className="flex justify-end">
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className="text-gray-500 hover:text-gray-700 flex items-center gap-1 text-xs cursor-pointer"
          >
            <Settings className="w-3 h-3" />
            {showSettings ? 'Hide Styles' : 'Subtitle Styles'}
          </button>
        </div>

        {/* Settings Panel */}
        <AnimatePresence>
          {showSettings && (
            <motion.div
              initial={{ opacity: 0, y: 5, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: 5, height: 0 }}
              className="bg-white rounded-md border border-gray-200 p-4 mb-2 overflow-hidden shadow-sm"
            >
              <div className="space-y-4">
                {/* Font Section */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500 uppercase font-bold tracking-tight flex items-center gap-1">
                      <Type className="w-3 h-3" /> Font Family
                    </span>
                    <span className="font-medium text-gray-900 truncate max-w-[120px]">{styles.fontName}</span>
                  </div>
                  
                  <div className="flex gap-2">
                     {isLocalFontsSupported && (
                        <div className="flex-1">
                          {systemFonts.length > 0 ? (
                            <select 
                              onChange={(e) => handleSystemFontSelect(e.target.value)}
                              className="w-full text-xs border border-gray-200 rounded-sm p-1.5 bg-gray-50 outline-none focus:border-black cursor-pointer h-full"
                              value={systemFonts.find(f => f.family === styles.fontName)?.family || ""}
                            >
                              <option value="">System Fonts...</option>
                              {systemFonts.map((f, i) => (
                                <option key={`${f.family}-${i}`} value={f.family}>{f.fullName}</option>
                              ))}
                            </select>
                          ) : (
                            <button
                              onClick={loadSystemFonts}
                              disabled={isLoadingFonts}
                              className="w-full h-full btn-secondary text-[10px] py-1.5 flex items-center justify-center gap-1 uppercase tracking-wide cursor-pointer disabled:cursor-not-allowed"
                            >
                              {isLoadingFonts ? 'Loading...' : 'Load System'}
                            </button>
                          )}
                        </div>
                      )}
                      
                      <div className="flex-1 relative">
                        <input
                          type="file"
                          id="font-upload"
                          className="hidden"
                          accept=".ttf,.otf,.woff,.woff2"
                          onChange={handleFileUpload}
                        />
                        <label
                          htmlFor="font-upload"
                          className="w-full h-full btn-secondary text-[10px] py-1.5 flex items-center justify-center gap-1 cursor-pointer uppercase tracking-wide"
                        >
                          <Upload className="w-3 h-3" />
                          Upload File
                        </label>
                      </div>
                  </div>
                </div>

                {/* Appearance Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] text-gray-500 uppercase font-bold tracking-tight">Size</label>
                    <input 
                      type="number" 
                      value={styles.fontSize}
                      onChange={(e) => updateStyle('fontSize', parseInt(e.target.value))}
                      className="w-full text-xs border border-gray-200 rounded-sm p-1.5 bg-gray-50 outline-none focus:border-black"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-gray-500 uppercase font-bold tracking-tight">V-Margin</label>
                    <input 
                      type="number" 
                      value={styles.marginV}
                      onChange={(e) => updateStyle('marginV', parseInt(e.target.value))}
                      className="w-full text-xs border border-gray-200 rounded-sm p-1.5 bg-gray-50 outline-none focus:border-black"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-gray-500 uppercase font-bold tracking-tight flex items-center gap-1">
                      <Palette className="w-3 h-3" /> Color
                    </label>
                    <div className="flex items-center gap-2">
                       <input 
                        type="color" 
                        value={styles.primaryColor}
                        onChange={(e) => updateStyle('primaryColor', e.target.value)}
                        className="w-8 h-6 p-0 border-0 rounded-sm cursor-pointer"
                      />
                      <span className="text-xs text-gray-400">{styles.primaryColor}</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-gray-500 uppercase font-bold tracking-tight">Outline</label>
                    <div className="flex items-center gap-2">
                       <input 
                        type="color" 
                        value={styles.outlineColor}
                        onChange={(e) => updateStyle('outlineColor', e.target.value)}
                        className="w-8 h-6 p-0 border-0 rounded-sm cursor-pointer"
                      />
                      <span className="text-xs text-gray-400">{styles.outlineColor}</span>
                    </div>
                  </div>
                </div>

                {/* Alignment */}
                <div className="space-y-2">
                  <label className="text-[10px] text-gray-500 uppercase font-bold tracking-tight flex items-center gap-1">
                    <LayoutTemplate className="w-3 h-3" /> Alignment
                  </label>
                  <div className="flex gap-2">
                    {[1, 2, 3].map(align => (
                       <button
                        key={align}
                        onClick={() => updateStyle('alignment', align)}
                        className={`flex-1 py-1.5 rounded-sm text-xs font-medium border transition-colors
                          ${styles.alignment === align 
                            ? 'bg-black text-white border-black' 
                            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                          }
                        `}
                       >
                         {align === 1 ? 'Left' : align === 2 ? 'Center' : 'Right'}
                       </button>
                    ))}
                  </div>
                </div>

              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex gap-2">
          {onBurn && (
            <button
              onClick={onBurn}
              disabled={isBurning || subtitles.length === 0}
              className={`
              flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md font-bold text-[11px] uppercase tracking-widest transition-all border relative overflow-hidden
              ${subtitles.length === 0 || isBurning
                ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
                : 'bg-orange-500 text-white border-orange-600 hover:bg-orange-600 cursor-pointer'
              }
            `}
            >
              {/* Progress bar background */}
              {isBurning && burnProgress > 0 && (
                <div 
                  className="absolute inset-0 bg-orange-600 transition-all duration-300"
                  style={{ width: `${burnProgress}%` }}
                />
              )}
              <span className="relative z-10 flex items-center gap-2">
                <Flame className={`w-3.5 h-3.5 ${isBurning ? 'animate-pulse' : ''}`}/>
                {isBurning ? `Burning... ${burnProgress}%` : 'Burn Video'}
              </span>
            </button>
          )}
          
          <button
            onClick={exportSrtFile}
            disabled={isExporting || subtitles.length === 0}
            className={`
              flex-1 flex items-center justify-center gap-2 py-2.5 rounded-md font-bold text-[11px] uppercase tracking-widest transition-all border
              ${subtitles.length === 0
                ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
                : 'bg-black text-white border-black hover:bg-gray-900 cursor-pointer'
              }
            `}
          >
            <Download className={`w-3.5 h-3.5 ${isExporting ? 'animate-bounce' : ''}`}/>
            {isExporting ? 'Exporting...' : 'Export SRT'}
          </button>
        </div>
      </div>
    </div>
  );
}
      