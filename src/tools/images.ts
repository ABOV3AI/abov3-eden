/**
 * ABOV3 Eden - Image Tools
 * Image manipulation, effects, and generation using Sharp
 */

import fs from 'fs/promises';
import path from 'path';
import type { MCPTool, ToolResult } from './index.js';
import { jsonResult, textResult, errorResult } from './index.js';

// ============================================================
// Image Information Tools
// ============================================================

const imageInfoTool: MCPTool = {
  name: 'image_info',
  description: 'Get detailed information about an image file.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the image file',
      },
    },
    required: ['path'],
  },
  async execute(args, context): Promise<ToolResult> {
    const { path: filePath } = args as { path: string };

    try {
      const sharp = (await import('sharp')).default;
      const resolvedPath = path.resolve(context.workingDirectory, filePath);
      const metadata = await sharp(resolvedPath).metadata();
      const stats = await fs.stat(resolvedPath);

      return jsonResult({
        fileName: path.basename(filePath),
        filePath: resolvedPath,
        fileSize: stats.size,
        format: metadata.format,
        width: metadata.width,
        height: metadata.height,
        channels: metadata.channels,
        depth: metadata.depth,
        density: metadata.density,
        hasAlpha: metadata.hasAlpha,
        orientation: metadata.orientation,
        space: metadata.space,
        isProgressive: metadata.isProgressive,
      });
    } catch (error) {
      return errorResult(`Failed to get image info: ${(error as Error).message}`);
    }
  },
};

// ============================================================
// Image Manipulation Tools
// ============================================================

const imageResizeTool: MCPTool = {
  name: 'image_resize',
  description: 'Resize an image to specified dimensions.',
  inputSchema: {
    type: 'object',
    properties: {
      input: {
        type: 'string',
        description: 'Input image path',
      },
      output: {
        type: 'string',
        description: 'Output image path',
      },
      width: {
        type: 'number',
        description: 'Target width in pixels',
      },
      height: {
        type: 'number',
        description: 'Target height in pixels',
      },
      fit: {
        type: 'string',
        description: 'Fit mode: cover, contain, fill, inside, outside',
        enum: ['cover', 'contain', 'fill', 'inside', 'outside'],
        default: 'cover',
      },
    },
    required: ['input', 'output'],
  },
  async execute(args, context): Promise<ToolResult> {
    const { input, output, width, height, fit = 'cover' } = args as {
      input: string;
      output: string;
      width?: number;
      height?: number;
      fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
    };

    try {
      const sharp = (await import('sharp')).default;
      const inputPath = path.resolve(context.workingDirectory, input);
      const outputPath = path.resolve(context.workingDirectory, output);

      await sharp(inputPath)
        .resize(width, height, { fit })
        .toFile(outputPath);

      const metadata = await sharp(outputPath).metadata();

      return jsonResult({
        success: true,
        input: inputPath,
        output: outputPath,
        width: metadata.width,
        height: metadata.height,
      });
    } catch (error) {
      return errorResult(`Failed to resize image: ${(error as Error).message}`);
    }
  },
};

const imageCropTool: MCPTool = {
  name: 'image_crop',
  description: 'Crop an image to a specified region.',
  inputSchema: {
    type: 'object',
    properties: {
      input: {
        type: 'string',
        description: 'Input image path',
      },
      output: {
        type: 'string',
        description: 'Output image path',
      },
      left: {
        type: 'number',
        description: 'Left offset in pixels',
      },
      top: {
        type: 'number',
        description: 'Top offset in pixels',
      },
      width: {
        type: 'number',
        description: 'Width of crop region',
      },
      height: {
        type: 'number',
        description: 'Height of crop region',
      },
    },
    required: ['input', 'output', 'left', 'top', 'width', 'height'],
  },
  async execute(args, context): Promise<ToolResult> {
    const { input, output, left, top, width, height } = args as {
      input: string;
      output: string;
      left: number;
      top: number;
      width: number;
      height: number;
    };

    try {
      const sharp = (await import('sharp')).default;
      const inputPath = path.resolve(context.workingDirectory, input);
      const outputPath = path.resolve(context.workingDirectory, output);

      await sharp(inputPath)
        .extract({ left, top, width, height })
        .toFile(outputPath);

      return jsonResult({
        success: true,
        output: outputPath,
        cropRegion: { left, top, width, height },
      });
    } catch (error) {
      return errorResult(`Failed to crop image: ${(error as Error).message}`);
    }
  },
};

const imageRotateTool: MCPTool = {
  name: 'image_rotate',
  description: 'Rotate an image by a specified angle.',
  inputSchema: {
    type: 'object',
    properties: {
      input: {
        type: 'string',
        description: 'Input image path',
      },
      output: {
        type: 'string',
        description: 'Output image path',
      },
      angle: {
        type: 'number',
        description: 'Rotation angle in degrees (positive = clockwise)',
      },
      background: {
        type: 'string',
        description: 'Background color for uncovered areas (hex or name)',
        default: '#ffffff',
      },
    },
    required: ['input', 'output', 'angle'],
  },
  async execute(args, context): Promise<ToolResult> {
    const { input, output, angle, background = '#ffffff' } = args as {
      input: string;
      output: string;
      angle: number;
      background?: string;
    };

    try {
      const sharp = (await import('sharp')).default;
      const inputPath = path.resolve(context.workingDirectory, input);
      const outputPath = path.resolve(context.workingDirectory, output);

      await sharp(inputPath)
        .rotate(angle, { background })
        .toFile(outputPath);

      return jsonResult({
        success: true,
        output: outputPath,
        angle,
      });
    } catch (error) {
      return errorResult(`Failed to rotate image: ${(error as Error).message}`);
    }
  },
};

const imageFlipTool: MCPTool = {
  name: 'image_flip',
  description: 'Flip an image horizontally or vertically.',
  inputSchema: {
    type: 'object',
    properties: {
      input: {
        type: 'string',
        description: 'Input image path',
      },
      output: {
        type: 'string',
        description: 'Output image path',
      },
      direction: {
        type: 'string',
        description: 'Flip direction: horizontal or vertical',
        enum: ['horizontal', 'vertical'],
      },
    },
    required: ['input', 'output', 'direction'],
  },
  async execute(args, context): Promise<ToolResult> {
    const { input, output, direction } = args as {
      input: string;
      output: string;
      direction: 'horizontal' | 'vertical';
    };

    try {
      const sharp = (await import('sharp')).default;
      const inputPath = path.resolve(context.workingDirectory, input);
      const outputPath = path.resolve(context.workingDirectory, output);

      let image = sharp(inputPath);
      if (direction === 'horizontal') {
        image = image.flop();
      } else {
        image = image.flip();
      }
      await image.toFile(outputPath);

      return jsonResult({
        success: true,
        output: outputPath,
        direction,
      });
    } catch (error) {
      return errorResult(`Failed to flip image: ${(error as Error).message}`);
    }
  },
};

const imageConvertTool: MCPTool = {
  name: 'image_convert',
  description: 'Convert an image to a different format.',
  inputSchema: {
    type: 'object',
    properties: {
      input: {
        type: 'string',
        description: 'Input image path',
      },
      output: {
        type: 'string',
        description: 'Output image path (extension determines format)',
      },
      quality: {
        type: 'number',
        description: 'Quality for JPEG/WebP (1-100)',
        default: 80,
      },
    },
    required: ['input', 'output'],
  },
  async execute(args, context): Promise<ToolResult> {
    const { input, output, quality = 80 } = args as {
      input: string;
      output: string;
      quality?: number;
    };

    try {
      const sharp = (await import('sharp')).default;
      const inputPath = path.resolve(context.workingDirectory, input);
      const outputPath = path.resolve(context.workingDirectory, output);
      const ext = path.extname(output).toLowerCase().slice(1);

      let image = sharp(inputPath);

      switch (ext) {
        case 'jpg':
        case 'jpeg':
          image = image.jpeg({ quality });
          break;
        case 'png':
          image = image.png();
          break;
        case 'webp':
          image = image.webp({ quality });
          break;
        case 'gif':
          image = image.gif();
          break;
        case 'tiff':
          image = image.tiff();
          break;
        case 'avif':
          image = image.avif({ quality });
          break;
        default:
          return errorResult(`Unsupported format: ${ext}`);
      }

      await image.toFile(outputPath);

      return jsonResult({
        success: true,
        output: outputPath,
        format: ext,
      });
    } catch (error) {
      return errorResult(`Failed to convert image: ${(error as Error).message}`);
    }
  },
};

const imageCompressTool: MCPTool = {
  name: 'image_compress',
  description: 'Compress/optimize an image to reduce file size.',
  inputSchema: {
    type: 'object',
    properties: {
      input: {
        type: 'string',
        description: 'Input image path',
      },
      output: {
        type: 'string',
        description: 'Output image path',
      },
      quality: {
        type: 'number',
        description: 'Quality level (1-100)',
        default: 70,
      },
    },
    required: ['input', 'output'],
  },
  async execute(args, context): Promise<ToolResult> {
    const { input, output, quality = 70 } = args as {
      input: string;
      output: string;
      quality?: number;
    };

    try {
      const sharp = (await import('sharp')).default;
      const inputPath = path.resolve(context.workingDirectory, input);
      const outputPath = path.resolve(context.workingDirectory, output);

      const inputStats = await fs.stat(inputPath);
      const metadata = await sharp(inputPath).metadata();

      let image = sharp(inputPath);

      if (metadata.format === 'jpeg' || metadata.format === 'jpg') {
        image = image.jpeg({ quality, mozjpeg: true });
      } else if (metadata.format === 'png') {
        image = image.png({ compressionLevel: 9 });
      } else if (metadata.format === 'webp') {
        image = image.webp({ quality });
      } else {
        image = image.jpeg({ quality, mozjpeg: true });
      }

      await image.toFile(outputPath);
      const outputStats = await fs.stat(outputPath);

      return jsonResult({
        success: true,
        output: outputPath,
        originalSize: inputStats.size,
        compressedSize: outputStats.size,
        reduction: `${((1 - outputStats.size / inputStats.size) * 100).toFixed(1)}%`,
      });
    } catch (error) {
      return errorResult(`Failed to compress image: ${(error as Error).message}`);
    }
  },
};

const imageThumbnailTool: MCPTool = {
  name: 'image_thumbnail',
  description: 'Generate a thumbnail from an image.',
  inputSchema: {
    type: 'object',
    properties: {
      input: {
        type: 'string',
        description: 'Input image path',
      },
      output: {
        type: 'string',
        description: 'Output thumbnail path',
      },
      size: {
        type: 'number',
        description: 'Thumbnail size (max dimension)',
        default: 150,
      },
    },
    required: ['input', 'output'],
  },
  async execute(args, context): Promise<ToolResult> {
    const { input, output, size = 150 } = args as {
      input: string;
      output: string;
      size?: number;
    };

    try {
      const sharp = (await import('sharp')).default;
      const inputPath = path.resolve(context.workingDirectory, input);
      const outputPath = path.resolve(context.workingDirectory, output);

      await sharp(inputPath)
        .resize(size, size, { fit: 'inside' })
        .toFile(outputPath);

      const metadata = await sharp(outputPath).metadata();

      return jsonResult({
        success: true,
        output: outputPath,
        width: metadata.width,
        height: metadata.height,
      });
    } catch (error) {
      return errorResult(`Failed to create thumbnail: ${(error as Error).message}`);
    }
  },
};

// ============================================================
// Image Effects Tools
// ============================================================

const imageGrayscaleTool: MCPTool = {
  name: 'image_grayscale',
  description: 'Convert an image to grayscale.',
  inputSchema: {
    type: 'object',
    properties: {
      input: {
        type: 'string',
        description: 'Input image path',
      },
      output: {
        type: 'string',
        description: 'Output image path',
      },
    },
    required: ['input', 'output'],
  },
  async execute(args, context): Promise<ToolResult> {
    const { input, output } = args as { input: string; output: string };

    try {
      const sharp = (await import('sharp')).default;
      const inputPath = path.resolve(context.workingDirectory, input);
      const outputPath = path.resolve(context.workingDirectory, output);

      await sharp(inputPath).grayscale().toFile(outputPath);

      return jsonResult({
        success: true,
        output: outputPath,
      });
    } catch (error) {
      return errorResult(`Failed to convert to grayscale: ${(error as Error).message}`);
    }
  },
};

const imageBlurTool: MCPTool = {
  name: 'image_blur',
  description: 'Apply blur effect to an image.',
  inputSchema: {
    type: 'object',
    properties: {
      input: {
        type: 'string',
        description: 'Input image path',
      },
      output: {
        type: 'string',
        description: 'Output image path',
      },
      sigma: {
        type: 'number',
        description: 'Blur sigma (0.3-1000, higher = more blur)',
        default: 5,
      },
    },
    required: ['input', 'output'],
  },
  async execute(args, context): Promise<ToolResult> {
    const { input, output, sigma = 5 } = args as {
      input: string;
      output: string;
      sigma?: number;
    };

    try {
      const sharp = (await import('sharp')).default;
      const inputPath = path.resolve(context.workingDirectory, input);
      const outputPath = path.resolve(context.workingDirectory, output);

      await sharp(inputPath).blur(sigma).toFile(outputPath);

      return jsonResult({
        success: true,
        output: outputPath,
        sigma,
      });
    } catch (error) {
      return errorResult(`Failed to blur image: ${(error as Error).message}`);
    }
  },
};

const imageSharpenTool: MCPTool = {
  name: 'image_sharpen',
  description: 'Sharpen an image.',
  inputSchema: {
    type: 'object',
    properties: {
      input: {
        type: 'string',
        description: 'Input image path',
      },
      output: {
        type: 'string',
        description: 'Output image path',
      },
      sigma: {
        type: 'number',
        description: 'Sharpening sigma (0.5-2 is typical)',
        default: 1,
      },
    },
    required: ['input', 'output'],
  },
  async execute(args, context): Promise<ToolResult> {
    const { input, output, sigma = 1 } = args as {
      input: string;
      output: string;
      sigma?: number;
    };

    try {
      const sharp = (await import('sharp')).default;
      const inputPath = path.resolve(context.workingDirectory, input);
      const outputPath = path.resolve(context.workingDirectory, output);

      await sharp(inputPath).sharpen(sigma).toFile(outputPath);

      return jsonResult({
        success: true,
        output: outputPath,
        sigma,
      });
    } catch (error) {
      return errorResult(`Failed to sharpen image: ${(error as Error).message}`);
    }
  },
};

const imageBrightnessTool: MCPTool = {
  name: 'image_brightness',
  description: 'Adjust brightness and contrast of an image.',
  inputSchema: {
    type: 'object',
    properties: {
      input: {
        type: 'string',
        description: 'Input image path',
      },
      output: {
        type: 'string',
        description: 'Output image path',
      },
      brightness: {
        type: 'number',
        description: 'Brightness multiplier (1 = no change, >1 = brighter, <1 = darker)',
        default: 1,
      },
      saturation: {
        type: 'number',
        description: 'Saturation multiplier (1 = no change)',
        default: 1,
      },
    },
    required: ['input', 'output'],
  },
  async execute(args, context): Promise<ToolResult> {
    const { input, output, brightness = 1, saturation = 1 } = args as {
      input: string;
      output: string;
      brightness?: number;
      saturation?: number;
    };

    try {
      const sharp = (await import('sharp')).default;
      const inputPath = path.resolve(context.workingDirectory, input);
      const outputPath = path.resolve(context.workingDirectory, output);

      await sharp(inputPath)
        .modulate({ brightness, saturation })
        .toFile(outputPath);

      return jsonResult({
        success: true,
        output: outputPath,
        brightness,
        saturation,
      });
    } catch (error) {
      return errorResult(`Failed to adjust brightness: ${(error as Error).message}`);
    }
  },
};

// ============================================================
// Image Generation Tools
// ============================================================

const imageCreateTool: MCPTool = {
  name: 'image_create',
  description: 'Create a blank image with a solid color.',
  inputSchema: {
    type: 'object',
    properties: {
      output: {
        type: 'string',
        description: 'Output image path',
      },
      width: {
        type: 'number',
        description: 'Image width in pixels',
      },
      height: {
        type: 'number',
        description: 'Image height in pixels',
      },
      color: {
        type: 'string',
        description: 'Background color (hex like #ff0000 or name like red)',
        default: '#ffffff',
      },
    },
    required: ['output', 'width', 'height'],
  },
  async execute(args, context): Promise<ToolResult> {
    const { output, width, height, color = '#ffffff' } = args as {
      output: string;
      width: number;
      height: number;
      color?: string;
    };

    try {
      const sharp = (await import('sharp')).default;
      const outputPath = path.resolve(context.workingDirectory, output);

      // Parse color
      const rgba = parseColor(color);

      // Create a blank image with the specified color
      const sharpModule = sharp as any;
      await sharpModule({
        create: {
          width,
          height,
          channels: 4,
          background: rgba,
        },
      }).toFile(outputPath);

      return jsonResult({
        success: true,
        output: outputPath,
        width,
        height,
        color,
      });
    } catch (error) {
      return errorResult(`Failed to create image: ${(error as Error).message}`);
    }
  },
};

const imageQrcodeTool: MCPTool = {
  name: 'image_qrcode',
  description: 'Generate a QR code image.',
  inputSchema: {
    type: 'object',
    properties: {
      output: {
        type: 'string',
        description: 'Output image path',
      },
      data: {
        type: 'string',
        description: 'Data to encode in the QR code (URL, text, etc.)',
      },
      size: {
        type: 'number',
        description: 'Size of the QR code in pixels',
        default: 200,
      },
      margin: {
        type: 'number',
        description: 'Margin around QR code (modules)',
        default: 2,
      },
    },
    required: ['output', 'data'],
  },
  async execute(args, context): Promise<ToolResult> {
    const { output, data, size = 200, margin = 2 } = args as {
      output: string;
      data: string;
      size?: number;
      margin?: number;
    };

    try {
      const QRCode = await import('qrcode');
      const outputPath = path.resolve(context.workingDirectory, output);

      await QRCode.toFile(outputPath, data, {
        width: size,
        margin,
        type: 'png',
      });

      return jsonResult({
        success: true,
        output: outputPath,
        data,
        size,
      });
    } catch (error) {
      return errorResult(`Failed to generate QR code: ${(error as Error).message}`);
    }
  },
};

const imageBarcodeTool: MCPTool = {
  name: 'image_barcode',
  description: 'Generate a barcode image.',
  inputSchema: {
    type: 'object',
    properties: {
      output: {
        type: 'string',
        description: 'Output image path',
      },
      data: {
        type: 'string',
        description: 'Data to encode in the barcode',
      },
      type: {
        type: 'string',
        description: 'Barcode type',
        enum: ['code128', 'code39', 'ean13', 'ean8', 'upca', 'upce', 'itf14', 'qrcode'],
        default: 'code128',
      },
      height: {
        type: 'number',
        description: 'Barcode height in pixels',
        default: 100,
      },
    },
    required: ['output', 'data'],
  },
  async execute(args, context): Promise<ToolResult> {
    const { output, data, type = 'code128', height = 100 } = args as {
      output: string;
      data: string;
      type?: string;
      height?: number;
    };

    try {
      const bwipjs = await import('bwip-js');
      const outputPath = path.resolve(context.workingDirectory, output);

      const png = await bwipjs.toBuffer({
        bcid: type,
        text: data,
        scale: 3,
        height: height / 10,
        includetext: true,
        textxalign: 'center',
      });

      await fs.writeFile(outputPath, png);

      return jsonResult({
        success: true,
        output: outputPath,
        data,
        type,
      });
    } catch (error) {
      return errorResult(`Failed to generate barcode: ${(error as Error).message}`);
    }
  },
};

// ============================================================
// OCR Tool
// ============================================================

const imageOcrTool: MCPTool = {
  name: 'image_ocr',
  description: 'Extract text from an image using OCR (Tesseract).',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the image file',
      },
      language: {
        type: 'string',
        description: 'Language code (eng, chi_sim, jpn, etc.)',
        default: 'eng',
      },
    },
    required: ['path'],
  },
  async execute(args, context): Promise<ToolResult> {
    const { path: filePath, language = 'eng' } = args as {
      path: string;
      language?: string;
    };

    try {
      const Tesseract = await import('tesseract.js') as any;
      const resolvedPath = path.resolve(context.workingDirectory, filePath);

      const { data } = await Tesseract.recognize(resolvedPath, language, {
        logger: () => {}, // Suppress progress logs
      });

      return jsonResult({
        text: data.text,
        confidence: data.confidence,
        words: data.words?.length || 0,
        lines: data.lines?.length || 0,
      });
    } catch (error) {
      return errorResult(`OCR failed: ${(error as Error).message}`);
    }
  },
};

// ============================================================
// Screenshot Tool
// ============================================================

const screenshotTool: MCPTool = {
  name: 'screenshot',
  description: 'Capture a screenshot of the screen or a window.',
  inputSchema: {
    type: 'object',
    properties: {
      output: {
        type: 'string',
        description: 'Output image path',
      },
      region: {
        type: 'object',
        description: 'Screen region to capture (optional)',
        properties: {
          x: { type: 'number' },
          y: { type: 'number' },
          width: { type: 'number' },
          height: { type: 'number' },
        },
      },
    },
    required: ['output'],
  },
  async execute(args, context): Promise<ToolResult> {
    const { output, region } = args as {
      output: string;
      region?: { x: number; y: number; width: number; height: number };
    };

    try {
      // Use platform-specific screenshot tools
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      const outputPath = path.resolve(context.workingDirectory, output);
      const platform = process.platform;

      if (platform === 'win32') {
        // PowerShell screenshot
        const ps = `
          Add-Type -AssemblyName System.Windows.Forms
          [System.Windows.Forms.Screen]::PrimaryScreen | ForEach-Object {
            $bitmap = New-Object System.Drawing.Bitmap($_.Bounds.Width, $_.Bounds.Height)
            $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
            $graphics.CopyFromScreen($_.Bounds.Location, [System.Drawing.Point]::Empty, $_.Bounds.Size)
            $bitmap.Save('${outputPath.replace(/\\/g, '\\\\')}')
          }
        `;
        await execAsync(`powershell -command "${ps.replace(/\n/g, ' ')}"`);
      } else if (platform === 'darwin') {
        await execAsync(`screencapture -x "${outputPath}"`);
      } else {
        // Linux with scrot or gnome-screenshot
        await execAsync(`scrot "${outputPath}" || gnome-screenshot -f "${outputPath}"`);
      }

      return jsonResult({
        success: true,
        output: outputPath,
      });
    } catch (error) {
      return errorResult(`Screenshot failed: ${(error as Error).message}`);
    }
  },
};

// ============================================================
// Helper Functions
// ============================================================

function parseColor(color: string): { r: number; g: number; b: number; alpha: number } {
  // Handle hex colors
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
        alpha: 1,
      };
    } else if (hex.length === 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        alpha: 1,
      };
    }
  }

  // Handle named colors (basic set)
  const namedColors: Record<string, { r: number; g: number; b: number }> = {
    white: { r: 255, g: 255, b: 255 },
    black: { r: 0, g: 0, b: 0 },
    red: { r: 255, g: 0, b: 0 },
    green: { r: 0, g: 255, b: 0 },
    blue: { r: 0, g: 0, b: 255 },
    yellow: { r: 255, g: 255, b: 0 },
    cyan: { r: 0, g: 255, b: 255 },
    magenta: { r: 255, g: 0, b: 255 },
    gray: { r: 128, g: 128, b: 128 },
    transparent: { r: 0, g: 0, b: 0 },
  };

  const named = namedColors[color.toLowerCase()];
  if (named) {
    return { ...named, alpha: color.toLowerCase() === 'transparent' ? 0 : 1 };
  }

  // Default to white
  return { r: 255, g: 255, b: 255, alpha: 1 };
}

// ============================================================
// Export all image tools
// ============================================================
export const imageTools: MCPTool[] = [
  imageInfoTool,
  imageResizeTool,
  imageCropTool,
  imageRotateTool,
  imageFlipTool,
  imageConvertTool,
  imageCompressTool,
  imageThumbnailTool,
  imageGrayscaleTool,
  imageBlurTool,
  imageSharpenTool,
  imageBrightnessTool,
  imageCreateTool,
  imageQrcodeTool,
  imageBarcodeTool,
  imageOcrTool,
  screenshotTool,
];
