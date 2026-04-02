/**
 * Multimedia Tools - Audio and Video manipulation using FFmpeg
 * Provides tools for processing audio and video files
 */

import type { Tool } from './index.js';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

// Lazy load ffmpeg
let ffmpeg: typeof import('fluent-ffmpeg') | null = null;
let ffmpegPath: string | null = null;

async function getFFmpeg() {
  if (!ffmpeg) {
    ffmpeg = (await import('fluent-ffmpeg')).default;
    try {
      const ffmpegInstaller = await import('@ffmpeg-installer/ffmpeg');
      ffmpegPath = ffmpegInstaller.path;
      ffmpeg.setFfmpegPath(ffmpegPath);
    } catch {
      // FFmpeg installer not available, assume ffmpeg is in PATH
    }
  }
  return ffmpeg;
}

/**
 * Get media file information using ffprobe
 */
async function getMediaInfo(filePath: string): Promise<any> {
  const ff = await getFFmpeg();
  return new Promise((resolve, reject) => {
    ff.ffprobe(filePath, (err, metadata) => {
      if (err) reject(err);
      else resolve(metadata);
    });
  });
}

/**
 * Parse time string (HH:MM:SS or seconds) to seconds
 */
function parseTime(time: string | number): number {
  if (typeof time === 'number') return time;

  const parts = time.split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return parseFloat(time) || 0;
}

/**
 * Format seconds to HH:MM:SS
 */
function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export const multimediaTools: Tool[] = [
  // ============================================================
  // Audio Tools
  // ============================================================

  {
    name: 'audio_info',
    description: 'Get detailed information about an audio file including duration, bitrate, sample rate, channels, and codec',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the audio file',
        },
      },
      required: ['path'],
    },
    handler: async ({ path: filePath }) => {
      try {
        const resolvedPath = path.resolve(filePath);
        await fs.access(resolvedPath);

        const metadata = await getMediaInfo(resolvedPath);
        const audioStream = metadata.streams?.find((s: any) => s.codec_type === 'audio');

        if (!audioStream) {
          return { error: 'No audio stream found in file' };
        }

        return {
          success: true,
          info: {
            format: metadata.format?.format_name,
            duration: metadata.format?.duration,
            durationFormatted: formatTime(metadata.format?.duration || 0),
            bitrate: metadata.format?.bit_rate,
            size: metadata.format?.size,
            codec: audioStream.codec_name,
            codecLong: audioStream.codec_long_name,
            sampleRate: audioStream.sample_rate,
            channels: audioStream.channels,
            channelLayout: audioStream.channel_layout,
            bitDepth: audioStream.bits_per_sample,
          },
        };
      } catch (error) {
        return { error: `Failed to get audio info: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'audio_convert',
    description: 'Convert audio file to different format (MP3, WAV, OGG, FLAC, AAC, M4A)',
    inputSchema: {
      type: 'object',
      properties: {
        input: {
          type: 'string',
          description: 'Path to the input audio file',
        },
        output: {
          type: 'string',
          description: 'Path for the output file (format determined by extension)',
        },
        bitrate: {
          type: 'string',
          description: 'Output bitrate (e.g., "128k", "320k")',
        },
        sampleRate: {
          type: 'number',
          description: 'Output sample rate in Hz (e.g., 44100, 48000)',
        },
      },
      required: ['input', 'output'],
    },
    handler: async ({ input, output, bitrate, sampleRate }) => {
      try {
        const ff = await getFFmpeg();
        const inputPath = path.resolve(input);
        const outputPath = path.resolve(output);

        await fs.access(inputPath);
        await fs.mkdir(path.dirname(outputPath), { recursive: true });

        return new Promise((resolve) => {
          let command = ff(inputPath);

          if (bitrate) {
            command = command.audioBitrate(bitrate);
          }
          if (sampleRate) {
            command = command.audioFrequency(sampleRate);
          }

          command
            .output(outputPath)
            .on('end', () => {
              resolve({
                success: true,
                output: outputPath,
                message: `Audio converted successfully`,
              });
            })
            .on('error', (err: Error) => {
              resolve({ error: `Conversion failed: ${err.message}` });
            })
            .run();
        });
      } catch (error) {
        return { error: `Failed to convert audio: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'audio_trim',
    description: 'Trim audio file to a specific time range',
    inputSchema: {
      type: 'object',
      properties: {
        input: {
          type: 'string',
          description: 'Path to the input audio file',
        },
        output: {
          type: 'string',
          description: 'Path for the output file',
        },
        start: {
          type: 'string',
          description: 'Start time (HH:MM:SS or seconds)',
        },
        end: {
          type: 'string',
          description: 'End time (HH:MM:SS or seconds)',
        },
        duration: {
          type: 'string',
          description: 'Duration instead of end time (HH:MM:SS or seconds)',
        },
      },
      required: ['input', 'output', 'start'],
    },
    handler: async ({ input, output, start, end, duration }) => {
      try {
        const ff = await getFFmpeg();
        const inputPath = path.resolve(input);
        const outputPath = path.resolve(output);

        await fs.access(inputPath);
        await fs.mkdir(path.dirname(outputPath), { recursive: true });

        return new Promise((resolve) => {
          let command = ff(inputPath).setStartTime(parseTime(start));

          if (duration) {
            command = command.setDuration(parseTime(duration));
          } else if (end) {
            const durationSecs = parseTime(end) - parseTime(start);
            command = command.setDuration(durationSecs);
          }

          command
            .output(outputPath)
            .on('end', () => {
              resolve({
                success: true,
                output: outputPath,
                message: `Audio trimmed successfully`,
              });
            })
            .on('error', (err: Error) => {
              resolve({ error: `Trim failed: ${err.message}` });
            })
            .run();
        });
      } catch (error) {
        return { error: `Failed to trim audio: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'audio_merge',
    description: 'Concatenate multiple audio files into one',
    inputSchema: {
      type: 'object',
      properties: {
        inputs: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of paths to audio files to merge (in order)',
        },
        output: {
          type: 'string',
          description: 'Path for the output file',
        },
      },
      required: ['inputs', 'output'],
    },
    handler: async ({ inputs, output }) => {
      try {
        const ff = await getFFmpeg();
        const outputPath = path.resolve(output);

        // Verify all inputs exist
        const resolvedInputs: string[] = [];
        for (const input of inputs) {
          const resolved = path.resolve(input);
          await fs.access(resolved);
          resolvedInputs.push(resolved);
        }

        await fs.mkdir(path.dirname(outputPath), { recursive: true });

        // Create a concat list file
        const listFile = path.join(os.tmpdir(), `ffmpeg-concat-${Date.now()}.txt`);
        const listContent = resolvedInputs.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join('\n');
        await fs.writeFile(listFile, listContent);

        return new Promise((resolve) => {
          ff()
            .input(listFile)
            .inputOptions(['-f', 'concat', '-safe', '0'])
            .outputOptions(['-c', 'copy'])
            .output(outputPath)
            .on('end', async () => {
              await fs.unlink(listFile).catch(() => {});
              resolve({
                success: true,
                output: outputPath,
                filesmerged: resolvedInputs.length,
                message: `Merged ${resolvedInputs.length} audio files`,
              });
            })
            .on('error', async (err: Error) => {
              await fs.unlink(listFile).catch(() => {});
              resolve({ error: `Merge failed: ${err.message}` });
            })
            .run();
        });
      } catch (error) {
        return { error: `Failed to merge audio: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'audio_volume',
    description: 'Adjust the volume of an audio file',
    inputSchema: {
      type: 'object',
      properties: {
        input: {
          type: 'string',
          description: 'Path to the input audio file',
        },
        output: {
          type: 'string',
          description: 'Path for the output file',
        },
        volume: {
          type: 'number',
          description: 'Volume multiplier (0.5 = half, 2.0 = double) or dB value if negative',
        },
      },
      required: ['input', 'output', 'volume'],
    },
    handler: async ({ input, output, volume }) => {
      try {
        const ff = await getFFmpeg();
        const inputPath = path.resolve(input);
        const outputPath = path.resolve(output);

        await fs.access(inputPath);
        await fs.mkdir(path.dirname(outputPath), { recursive: true });

        // If volume is negative, treat as dB, otherwise as multiplier
        const volumeFilter = volume < 0 ? `volume=${volume}dB` : `volume=${volume}`;

        return new Promise((resolve) => {
          ff(inputPath)
            .audioFilters(volumeFilter)
            .output(outputPath)
            .on('end', () => {
              resolve({
                success: true,
                output: outputPath,
                volumeApplied: volume,
                message: `Volume adjusted to ${volume < 0 ? volume + 'dB' : volume + 'x'}`,
              });
            })
            .on('error', (err: Error) => {
              resolve({ error: `Volume adjustment failed: ${err.message}` });
            })
            .run();
        });
      } catch (error) {
        return { error: `Failed to adjust volume: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'audio_extract',
    description: 'Extract audio track from a video file',
    inputSchema: {
      type: 'object',
      properties: {
        input: {
          type: 'string',
          description: 'Path to the input video file',
        },
        output: {
          type: 'string',
          description: 'Path for the output audio file (format by extension)',
        },
        bitrate: {
          type: 'string',
          description: 'Output bitrate (e.g., "128k", "320k")',
        },
      },
      required: ['input', 'output'],
    },
    handler: async ({ input, output, bitrate }) => {
      try {
        const ff = await getFFmpeg();
        const inputPath = path.resolve(input);
        const outputPath = path.resolve(output);

        await fs.access(inputPath);
        await fs.mkdir(path.dirname(outputPath), { recursive: true });

        return new Promise((resolve) => {
          let command = ff(inputPath).noVideo();

          if (bitrate) {
            command = command.audioBitrate(bitrate);
          }

          command
            .output(outputPath)
            .on('end', () => {
              resolve({
                success: true,
                output: outputPath,
                message: `Audio extracted successfully`,
              });
            })
            .on('error', (err: Error) => {
              resolve({ error: `Extraction failed: ${err.message}` });
            })
            .run();
        });
      } catch (error) {
        return { error: `Failed to extract audio: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  // ============================================================
  // Video Tools
  // ============================================================

  {
    name: 'video_info',
    description: 'Get detailed information about a video file including resolution, duration, codec, framerate, and audio tracks',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the video file',
        },
      },
      required: ['path'],
    },
    handler: async ({ path: filePath }) => {
      try {
        const resolvedPath = path.resolve(filePath);
        await fs.access(resolvedPath);

        const metadata = await getMediaInfo(resolvedPath);
        const videoStream = metadata.streams?.find((s: any) => s.codec_type === 'video');
        const audioStream = metadata.streams?.find((s: any) => s.codec_type === 'audio');

        if (!videoStream) {
          return { error: 'No video stream found in file' };
        }

        return {
          success: true,
          info: {
            format: metadata.format?.format_name,
            duration: metadata.format?.duration,
            durationFormatted: formatTime(metadata.format?.duration || 0),
            bitrate: metadata.format?.bit_rate,
            size: metadata.format?.size,
            video: {
              codec: videoStream.codec_name,
              codecLong: videoStream.codec_long_name,
              width: videoStream.width,
              height: videoStream.height,
              aspectRatio: videoStream.display_aspect_ratio,
              frameRate: videoStream.r_frame_rate,
              bitrate: videoStream.bit_rate,
            },
            audio: audioStream ? {
              codec: audioStream.codec_name,
              sampleRate: audioStream.sample_rate,
              channels: audioStream.channels,
              bitrate: audioStream.bit_rate,
            } : null,
          },
        };
      } catch (error) {
        return { error: `Failed to get video info: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'video_thumbnail',
    description: 'Extract a thumbnail/frame from a video at a specific time',
    inputSchema: {
      type: 'object',
      properties: {
        input: {
          type: 'string',
          description: 'Path to the input video file',
        },
        output: {
          type: 'string',
          description: 'Path for the output image file (PNG/JPG)',
        },
        time: {
          type: 'string',
          description: 'Time to capture (HH:MM:SS or seconds). Default: "00:00:01"',
        },
        width: {
          type: 'number',
          description: 'Output width (height auto-scaled)',
        },
        height: {
          type: 'number',
          description: 'Output height (width auto-scaled)',
        },
      },
      required: ['input', 'output'],
    },
    handler: async ({ input, output, time = '00:00:01', width, height }) => {
      try {
        const ff = await getFFmpeg();
        const inputPath = path.resolve(input);
        const outputPath = path.resolve(output);

        await fs.access(inputPath);
        await fs.mkdir(path.dirname(outputPath), { recursive: true });

        return new Promise((resolve) => {
          let command = ff(inputPath)
            .setStartTime(parseTime(time))
            .frames(1);

          if (width && height) {
            command = command.size(`${width}x${height}`);
          } else if (width) {
            command = command.size(`${width}x?`);
          } else if (height) {
            command = command.size(`?x${height}`);
          }

          command
            .output(outputPath)
            .on('end', () => {
              resolve({
                success: true,
                output: outputPath,
                capturedAt: time,
                message: `Thumbnail captured at ${time}`,
              });
            })
            .on('error', (err: Error) => {
              resolve({ error: `Thumbnail extraction failed: ${err.message}` });
            })
            .run();
        });
      } catch (error) {
        return { error: `Failed to extract thumbnail: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'video_extract_frames',
    description: 'Extract multiple frames from a video as images',
    inputSchema: {
      type: 'object',
      properties: {
        input: {
          type: 'string',
          description: 'Path to the input video file',
        },
        outputDir: {
          type: 'string',
          description: 'Directory to save extracted frames',
        },
        fps: {
          type: 'number',
          description: 'Frames per second to extract (e.g., 1 = 1 frame/sec)',
        },
        start: {
          type: 'string',
          description: 'Start time (HH:MM:SS or seconds)',
        },
        duration: {
          type: 'string',
          description: 'Duration to extract (HH:MM:SS or seconds)',
        },
        format: {
          type: 'string',
          enum: ['png', 'jpg'],
          description: 'Output image format. Default: png',
        },
      },
      required: ['input', 'outputDir'],
    },
    handler: async ({ input, outputDir, fps = 1, start, duration, format = 'png' }) => {
      try {
        const ff = await getFFmpeg();
        const inputPath = path.resolve(input);
        const outputDirPath = path.resolve(outputDir);

        await fs.access(inputPath);
        await fs.mkdir(outputDirPath, { recursive: true });

        const outputPattern = path.join(outputDirPath, `frame-%04d.${format}`);

        return new Promise((resolve) => {
          let command = ff(inputPath);

          if (start) {
            command = command.setStartTime(parseTime(start));
          }
          if (duration) {
            command = command.setDuration(parseTime(duration));
          }

          command
            .outputOptions(['-vf', `fps=${fps}`])
            .output(outputPattern)
            .on('end', async () => {
              // Count extracted frames
              const files = await fs.readdir(outputDirPath);
              const frameFiles = files.filter(f => f.startsWith('frame-') && f.endsWith(`.${format}`));

              resolve({
                success: true,
                outputDir: outputDirPath,
                framesExtracted: frameFiles.length,
                fps: fps,
                message: `Extracted ${frameFiles.length} frames`,
              });
            })
            .on('error', (err: Error) => {
              resolve({ error: `Frame extraction failed: ${err.message}` });
            })
            .run();
        });
      } catch (error) {
        return { error: `Failed to extract frames: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'video_trim',
    description: 'Trim video to a specific time range',
    inputSchema: {
      type: 'object',
      properties: {
        input: {
          type: 'string',
          description: 'Path to the input video file',
        },
        output: {
          type: 'string',
          description: 'Path for the output file',
        },
        start: {
          type: 'string',
          description: 'Start time (HH:MM:SS or seconds)',
        },
        end: {
          type: 'string',
          description: 'End time (HH:MM:SS or seconds)',
        },
        duration: {
          type: 'string',
          description: 'Duration instead of end time (HH:MM:SS or seconds)',
        },
      },
      required: ['input', 'output', 'start'],
    },
    handler: async ({ input, output, start, end, duration }) => {
      try {
        const ff = await getFFmpeg();
        const inputPath = path.resolve(input);
        const outputPath = path.resolve(output);

        await fs.access(inputPath);
        await fs.mkdir(path.dirname(outputPath), { recursive: true });

        return new Promise((resolve) => {
          let command = ff(inputPath)
            .setStartTime(parseTime(start))
            .outputOptions(['-c', 'copy']); // Copy streams for fast trimming

          if (duration) {
            command = command.setDuration(parseTime(duration));
          } else if (end) {
            const durationSecs = parseTime(end) - parseTime(start);
            command = command.setDuration(durationSecs);
          }

          command
            .output(outputPath)
            .on('end', () => {
              resolve({
                success: true,
                output: outputPath,
                message: `Video trimmed successfully`,
              });
            })
            .on('error', (err: Error) => {
              resolve({ error: `Trim failed: ${err.message}` });
            })
            .run();
        });
      } catch (error) {
        return { error: `Failed to trim video: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'video_convert',
    description: 'Convert video to different format (MP4, WebM, MKV, AVI, MOV)',
    inputSchema: {
      type: 'object',
      properties: {
        input: {
          type: 'string',
          description: 'Path to the input video file',
        },
        output: {
          type: 'string',
          description: 'Path for the output file (format determined by extension)',
        },
        videoBitrate: {
          type: 'string',
          description: 'Video bitrate (e.g., "1000k", "2M")',
        },
        audioBitrate: {
          type: 'string',
          description: 'Audio bitrate (e.g., "128k", "192k")',
        },
        codec: {
          type: 'string',
          description: 'Video codec (e.g., "libx264", "libx265", "vp9")',
        },
      },
      required: ['input', 'output'],
    },
    handler: async ({ input, output, videoBitrate, audioBitrate, codec }) => {
      try {
        const ff = await getFFmpeg();
        const inputPath = path.resolve(input);
        const outputPath = path.resolve(output);

        await fs.access(inputPath);
        await fs.mkdir(path.dirname(outputPath), { recursive: true });

        return new Promise((resolve) => {
          let command = ff(inputPath);

          if (codec) {
            command = command.videoCodec(codec);
          }
          if (videoBitrate) {
            command = command.videoBitrate(videoBitrate);
          }
          if (audioBitrate) {
            command = command.audioBitrate(audioBitrate);
          }

          command
            .output(outputPath)
            .on('end', () => {
              resolve({
                success: true,
                output: outputPath,
                message: `Video converted successfully`,
              });
            })
            .on('error', (err: Error) => {
              resolve({ error: `Conversion failed: ${err.message}` });
            })
            .run();
        });
      } catch (error) {
        return { error: `Failed to convert video: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'video_resize',
    description: 'Resize/scale video to different resolution',
    inputSchema: {
      type: 'object',
      properties: {
        input: {
          type: 'string',
          description: 'Path to the input video file',
        },
        output: {
          type: 'string',
          description: 'Path for the output file',
        },
        width: {
          type: 'number',
          description: 'Output width in pixels (use -1 to maintain aspect ratio)',
        },
        height: {
          type: 'number',
          description: 'Output height in pixels (use -1 to maintain aspect ratio)',
        },
        preset: {
          type: 'string',
          enum: ['720p', '1080p', '480p', '360p', '4k'],
          description: 'Preset resolution instead of width/height',
        },
      },
      required: ['input', 'output'],
    },
    handler: async ({ input, output, width, height, preset }) => {
      try {
        const ff = await getFFmpeg();
        const inputPath = path.resolve(input);
        const outputPath = path.resolve(output);

        await fs.access(inputPath);
        await fs.mkdir(path.dirname(outputPath), { recursive: true });

        // Handle presets
        let targetWidth = width;
        let targetHeight = height;

        if (preset) {
          const presets: Record<string, { w: number; h: number }> = {
            '360p': { w: 640, h: 360 },
            '480p': { w: 854, h: 480 },
            '720p': { w: 1280, h: 720 },
            '1080p': { w: 1920, h: 1080 },
            '4k': { w: 3840, h: 2160 },
          };
          const p = presets[preset];
          if (p) {
            targetWidth = p.w;
            targetHeight = p.h;
          }
        }

        if (!targetWidth && !targetHeight) {
          return { error: 'Either width, height, or preset must be specified' };
        }

        // Use -2 to ensure even numbers (required by many codecs)
        const scaleWidth = targetWidth || -2;
        const scaleHeight = targetHeight || -2;

        return new Promise((resolve) => {
          ff(inputPath)
            .outputOptions(['-vf', `scale=${scaleWidth}:${scaleHeight}`])
            .output(outputPath)
            .on('end', () => {
              resolve({
                success: true,
                output: outputPath,
                resolution: preset || `${targetWidth || 'auto'}x${targetHeight || 'auto'}`,
                message: `Video resized successfully`,
              });
            })
            .on('error', (err: Error) => {
              resolve({ error: `Resize failed: ${err.message}` });
            })
            .run();
        });
      } catch (error) {
        return { error: `Failed to resize video: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'video_to_gif',
    description: 'Convert a video clip to animated GIF',
    inputSchema: {
      type: 'object',
      properties: {
        input: {
          type: 'string',
          description: 'Path to the input video file',
        },
        output: {
          type: 'string',
          description: 'Path for the output GIF file',
        },
        start: {
          type: 'string',
          description: 'Start time (HH:MM:SS or seconds)',
        },
        duration: {
          type: 'number',
          description: 'Duration in seconds (default: 5, max recommended: 10)',
        },
        width: {
          type: 'number',
          description: 'Output width (default: 480)',
        },
        fps: {
          type: 'number',
          description: 'Frames per second (default: 10)',
        },
      },
      required: ['input', 'output'],
    },
    handler: async ({ input, output, start, duration = 5, width = 480, fps = 10 }) => {
      try {
        const ff = await getFFmpeg();
        const inputPath = path.resolve(input);
        const outputPath = path.resolve(output);

        await fs.access(inputPath);
        await fs.mkdir(path.dirname(outputPath), { recursive: true });

        // Use two-pass for better quality GIF
        const paletteFile = path.join(os.tmpdir(), `palette-${Date.now()}.png`);

        // Generate palette
        await new Promise<void>((resolve, reject) => {
          let command = ff(inputPath);

          if (start) {
            command = command.setStartTime(parseTime(start));
          }
          command = command.setDuration(duration);

          command
            .outputOptions([
              '-vf', `fps=${fps},scale=${width}:-1:flags=lanczos,palettegen`
            ])
            .output(paletteFile)
            .on('end', () => resolve())
            .on('error', (err: Error) => reject(err))
            .run();
        });

        // Generate GIF using palette
        return new Promise((resolve) => {
          let command = ff(inputPath);

          if (start) {
            command = command.setStartTime(parseTime(start));
          }
          command = command.setDuration(duration);

          command
            .input(paletteFile)
            .complexFilter([
              `fps=${fps},scale=${width}:-1:flags=lanczos[x];[x][1:v]paletteuse`
            ])
            .output(outputPath)
            .on('end', async () => {
              await fs.unlink(paletteFile).catch(() => {});
              const stat = await fs.stat(outputPath);
              resolve({
                success: true,
                output: outputPath,
                duration: duration,
                fps: fps,
                width: width,
                size: stat.size,
                message: `GIF created successfully`,
              });
            })
            .on('error', async (err: Error) => {
              await fs.unlink(paletteFile).catch(() => {});
              resolve({ error: `GIF creation failed: ${err.message}` });
            })
            .run();
        });
      } catch (error) {
        return { error: `Failed to create GIF: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'video_add_audio',
    description: 'Add or replace audio track in a video file',
    inputSchema: {
      type: 'object',
      properties: {
        videoInput: {
          type: 'string',
          description: 'Path to the input video file',
        },
        audioInput: {
          type: 'string',
          description: 'Path to the audio file to add',
        },
        output: {
          type: 'string',
          description: 'Path for the output file',
        },
        replace: {
          type: 'boolean',
          description: 'Replace existing audio (true) or mix with it (false). Default: true',
        },
      },
      required: ['videoInput', 'audioInput', 'output'],
    },
    handler: async ({ videoInput, audioInput, output, replace = true }) => {
      try {
        const ff = await getFFmpeg();
        const videoPath = path.resolve(videoInput);
        const audioPath = path.resolve(audioInput);
        const outputPath = path.resolve(output);

        await fs.access(videoPath);
        await fs.access(audioPath);
        await fs.mkdir(path.dirname(outputPath), { recursive: true });

        return new Promise((resolve) => {
          let command = ff()
            .input(videoPath)
            .input(audioPath);

          if (replace) {
            command = command
              .outputOptions([
                '-c:v', 'copy',
                '-map', '0:v:0',
                '-map', '1:a:0',
                '-shortest'
              ]);
          } else {
            // Mix audio tracks
            command = command
              .complexFilter([
                '[0:a][1:a]amerge=inputs=2[a]'
              ])
              .outputOptions([
                '-c:v', 'copy',
                '-map', '0:v',
                '-map', '[a]',
                '-shortest'
              ]);
          }

          command
            .output(outputPath)
            .on('end', () => {
              resolve({
                success: true,
                output: outputPath,
                audioReplaced: replace,
                message: `Audio ${replace ? 'replaced' : 'mixed'} successfully`,
              });
            })
            .on('error', (err: Error) => {
              resolve({ error: `Audio addition failed: ${err.message}` });
            })
            .run();
        });
      } catch (error) {
        return { error: `Failed to add audio: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'video_rotate',
    description: 'Rotate video by 90, 180, or 270 degrees',
    inputSchema: {
      type: 'object',
      properties: {
        input: {
          type: 'string',
          description: 'Path to the input video file',
        },
        output: {
          type: 'string',
          description: 'Path for the output file',
        },
        degrees: {
          type: 'number',
          enum: [90, 180, 270],
          description: 'Rotation angle in degrees (clockwise)',
        },
      },
      required: ['input', 'output', 'degrees'],
    },
    handler: async ({ input, output, degrees }) => {
      try {
        const ff = await getFFmpeg();
        const inputPath = path.resolve(input);
        const outputPath = path.resolve(output);

        await fs.access(inputPath);
        await fs.mkdir(path.dirname(outputPath), { recursive: true });

        // FFmpeg transpose values:
        // 0 = 90° counter-clockwise and flip vertical
        // 1 = 90° clockwise
        // 2 = 90° counter-clockwise
        // 3 = 90° clockwise and flip vertical
        const transposeMap: Record<number, string> = {
          90: 'transpose=1',
          180: 'transpose=1,transpose=1',
          270: 'transpose=2',
        };

        const filter = transposeMap[degrees];
        if (!filter) {
          return { error: 'Degrees must be 90, 180, or 270' };
        }

        return new Promise((resolve) => {
          ff(inputPath)
            .outputOptions(['-vf', filter])
            .output(outputPath)
            .on('end', () => {
              resolve({
                success: true,
                output: outputPath,
                rotation: degrees,
                message: `Video rotated ${degrees} degrees`,
              });
            })
            .on('error', (err: Error) => {
              resolve({ error: `Rotation failed: ${err.message}` });
            })
            .run();
        });
      } catch (error) {
        return { error: `Failed to rotate video: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },

  {
    name: 'video_speed',
    description: 'Change video playback speed (speed up or slow down)',
    inputSchema: {
      type: 'object',
      properties: {
        input: {
          type: 'string',
          description: 'Path to the input video file',
        },
        output: {
          type: 'string',
          description: 'Path for the output file',
        },
        speed: {
          type: 'number',
          description: 'Speed multiplier (0.5 = half speed, 2.0 = double speed). Range: 0.25-4.0',
        },
        adjustAudio: {
          type: 'boolean',
          description: 'Adjust audio speed to match video. Default: true',
        },
      },
      required: ['input', 'output', 'speed'],
    },
    handler: async ({ input, output, speed, adjustAudio = true }) => {
      try {
        const ff = await getFFmpeg();
        const inputPath = path.resolve(input);
        const outputPath = path.resolve(output);

        await fs.access(inputPath);
        await fs.mkdir(path.dirname(outputPath), { recursive: true });

        // Validate speed range
        if (speed < 0.25 || speed > 4.0) {
          return { error: 'Speed must be between 0.25 and 4.0' };
        }

        // Video filter: setpts (presentation timestamp)
        // For 2x speed, we use setpts=0.5*PTS
        const videoPts = 1 / speed;
        const videoFilter = `setpts=${videoPts}*PTS`;

        // Audio filter: atempo (can only handle 0.5-2.0, chain for other values)
        let audioFilter = '';
        if (adjustAudio) {
          let tempSpeed = speed;
          const atempoFilters: string[] = [];
          while (tempSpeed > 2.0) {
            atempoFilters.push('atempo=2.0');
            tempSpeed /= 2.0;
          }
          while (tempSpeed < 0.5) {
            atempoFilters.push('atempo=0.5');
            tempSpeed *= 2.0;
          }
          atempoFilters.push(`atempo=${tempSpeed}`);
          audioFilter = atempoFilters.join(',');
        }

        return new Promise((resolve) => {
          let command = ff(inputPath);

          if (adjustAudio && audioFilter) {
            command = command.outputOptions([
              '-filter_complex', `[0:v]${videoFilter}[v];[0:a]${audioFilter}[a]`,
              '-map', '[v]',
              '-map', '[a]'
            ]);
          } else {
            command = command.outputOptions(['-vf', videoFilter, '-an']);
          }

          command
            .output(outputPath)
            .on('end', () => {
              resolve({
                success: true,
                output: outputPath,
                speed: speed,
                audioAdjusted: adjustAudio,
                message: `Video speed changed to ${speed}x`,
              });
            })
            .on('error', (err: Error) => {
              resolve({ error: `Speed change failed: ${err.message}` });
            })
            .run();
        });
      } catch (error) {
        return { error: `Failed to change speed: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
  },
];
