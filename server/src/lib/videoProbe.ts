import { execFile } from 'node:child_process';

/**
 * Measure container duration with ffprobe when it is installed. Returns null when ffprobe is
 * unavailable or the file can't be probed — callers then fall back to the client-reported duration.
 */
export function probeDurationSeconds(filePath: string): Promise<number | null> {
  return new Promise((resolve) => {
    execFile(
      process.env.FFPROBE_PATH || 'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath],
      { timeout: 10_000 },
      (err, stdout) => {
        if (err) return resolve(null);
        const d = Number.parseFloat(String(stdout).trim());
        resolve(Number.isFinite(d) && d > 0 ? d : null);
      },
    );
  });
}
