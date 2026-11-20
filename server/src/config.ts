const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return v !== undefined && v !== '' && Number.isFinite(n) ? n : fallback;
};

export const config = {
  port: num(process.env.PORT, 8787),
  geminiApiKey: process.env.GEMINI_API_KEY?.trim() ?? '',
  geminiModel: process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-pro',
  /** Frames per second sampled by Gemini. Higher = better cut detection. 0 disables the override (Gemini default 1fps). */
  videoFps: num(process.env.GEMINI_VIDEO_FPS, 2),
  fileProcessingTimeoutMs: num(process.env.GEMINI_FILE_TIMEOUT_MS, 180_000),
  maxConcurrentAudits: num(process.env.MAX_CONCURRENT_AUDITS, 3),
  corsOrigin: process.env.CORS_ORIGIN?.trim() || '',
  isProduction: process.env.NODE_ENV === 'production',
};
