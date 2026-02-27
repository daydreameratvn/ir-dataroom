import ffmpeg, { FfmpegCommand } from "fluent-ffmpeg";
import fs from "fs/promises";
import path from "path";

// Use ffmpeg-full (has drawtext/freetype support) if available
const FFMPEG_PATH = "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg";
const FFPROBE_PATH = "/opt/homebrew/opt/ffmpeg-full/bin/ffprobe";
try {
  ffmpeg.setFfmpegPath(FFMPEG_PATH);
  ffmpeg.setFfprobePath(FFPROBE_PATH);
} catch {
  // Fall back to system ffmpeg
}

const CACHE_DIR = path.join(process.cwd(), "uploads", "cache");
const WATERMARK_TIMEOUT_MS = 15_000; // 15 seconds max for video watermarking

function getCachePath(fileId: string, investorId: string, ext: string): string {
  return path.join(CACHE_DIR, `${fileId}_${investorId}${ext}`);
}

export async function watermarkVideo(
  filePath: string,
  email: string,
  fileId: string,
  investorId: string
): Promise<string> {
  const ext = path.extname(filePath);
  const cachePath = getCachePath(fileId, investorId, ext);

  // Check if cached version exists
  try {
    await fs.access(cachePath);
    return cachePath;
  } catch {
    // Cache miss, generate watermarked video
  }

  // Ensure cache directory exists
  await fs.mkdir(CACHE_DIR, { recursive: true });

  // Run ffmpeg with a timeout to prevent hanging the server
  let ffmpegProcess: FfmpegCommand | null = null;

  const encodePromise = new Promise<string>((resolve, reject) => {
    ffmpegProcess = ffmpeg(filePath)
      .videoFilters([
        {
          filter: "drawtext",
          options: {
            text: email,
            fontsize: 28,
            fontcolor: "white@0.25",
            x: "(w-tw)/2",
            y: "(h-th)/2",
            shadowcolor: "black@0.15",
            shadowx: 2,
            shadowy: 2,
          },
        },
        {
          filter: "drawtext",
          options: {
            text: "CONFIDENTIAL",
            fontsize: 20,
            fontcolor: "white@0.2",
            x: "(w-tw)/2",
            y: "(h-th)/2+40",
          },
        },
      ])
      .output(cachePath)
      .on("end", () => resolve(cachePath))
      .on("error", (err) => reject(err));

    ffmpegProcess.run();
  });

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      // Kill the ffmpeg process on timeout
      if (ffmpegProcess) {
        try {
          ffmpegProcess.kill("SIGKILL");
        } catch {
          // Process may already be dead
        }
      }
      // Clean up partial output
      fs.unlink(cachePath).catch(() => {});
      reject(new Error(`Video watermarking timed out after ${WATERMARK_TIMEOUT_MS / 1000}s`));
    }, WATERMARK_TIMEOUT_MS);
  });

  return Promise.race([encodePromise, timeoutPromise]);
}

export async function invalidateVideoCache(fileId: string): Promise<void> {
  try {
    const files = await fs.readdir(CACHE_DIR);
    const toDelete = files.filter((f) => f.startsWith(`${fileId}_`));
    await Promise.all(
      toDelete.map((f) => fs.unlink(path.join(CACHE_DIR, f)))
    );
  } catch {
    // Cache dir might not exist yet
  }
}
