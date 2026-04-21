export const API_BASE_URL = import.meta.env.VITE_BASE_URL || ''

export const API_PATHS = {
  TRANSCRIBE: '/api/asr',
  ASS_CONVERT: '/api/ass/convert-latex',
} as const
