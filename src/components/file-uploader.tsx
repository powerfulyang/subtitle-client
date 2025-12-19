'use client';

import { ChangeEvent, useState } from 'react';
import { motion } from 'framer-motion';
import { Upload, FileUp } from 'lucide-react';

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
          cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-md font-medium text-xs transition-all duration-200 border
          ${isDragOver 
            ? 'bg-blue-50 border-blue-500 text-blue-700' 
            : 'bg-black text-white border-transparent hover:bg-gray-800'
          }
        `}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
      >
        <Upload className="w-3.5 h-3.5" />
        <span>Select Video</span>
      </motion.label>
      
      {/* Drag Overlay */}
      {isDragOver && (
        <motion.div
          className="fixed inset-0 z-[100] bg-blue-500/10 backdrop-blur-sm border-2 border-blue-500 border-dashed m-4 rounded-md flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{ pointerEvents: 'none' }}
        >
          <div className="bg-white p-8 rounded-md border border-gray-100 flex flex-col items-center text-blue-600">
            <FileUp className="w-10 h-10 mb-4" />
            <span className="text-lg font-bold">Drop video here</span>
          </div>
        </motion.div>
      )}
    </div>
  );
}