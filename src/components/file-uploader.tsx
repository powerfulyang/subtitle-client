'use client';

import { ChangeEvent, useState } from 'react';
import { motion } from 'framer-motion';
import { Upload, FileVideo } from 'lucide-react';

interface FileUploaderProps {
  onFileSelect: (file: File) => void;
}

export default function FileUploader({ onFileSelect }: FileUploaderProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0]);
      e.target.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileSelect(e.dataTransfer.files[0]);
      e.dataTransfer.clearData();
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  return (
    <div className="relative">
      <input 
        id="video-upload" 
        type="file" 
        className="hidden" 
        accept="video/*,audio/*" 
        onChange={handleFileChange} 
      />
      
      <motion.label 
        htmlFor="video-upload" 
        className={`
          cursor-pointer inline-flex items-center space-x-2 px-6 py-3 rounded-lg font-semibold transition-all duration-200
          ${isDragOver 
            ? 'bg-blue-500 text-white scale-105' 
            : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white'
          }
          shadow-lg hover:shadow-xl
        `}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <Upload className="w-4 h-4" />
        <span>上传视频</span>
      </motion.label>
      
      {/* 拖拽提示 */}
      {isDragOver && (
        <motion.div
          className="absolute -inset-2 border-2 border-dashed border-blue-400 rounded-lg bg-blue-400/10 flex items-center justify-center"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
        >
          <div className="flex flex-col items-center text-blue-400">
            <FileVideo className="w-8 h-8 mb-2" />
            <span className="text-sm font-medium">松开以上传</span>
          </div>
        </motion.div>
      )}
    </div>
  );
}
