/** 媒体文件读写与通用工具 */
import type { CarrierType, WatermarkPayload, WatermarkType } from './types';

/** 依据 MIME 判断载体类型 */
export function carrierTypeOf(file: File): CarrierType | null {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('audio/')) return 'audio';
  if (file.type.startsWith('video/')) return 'video';
  return null;
}

/** 文件 → ImageData（经 Canvas 解码） */
export async function fileToImageData(file: Blob): Promise<ImageData> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('无法创建画布上下文');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

export function imageDataToCanvas(img: ImageData): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建画布上下文');
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('图像编码失败'))), type, quality);
  });
}

export function imageDataToBlob(img: ImageData, type = 'image/png', quality?: number): Promise<Blob> {
  return canvasToBlob(imageDataToCanvas(img), type, quality);
}

/** 触发浏览器下载 */
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

/** 给文件名追加后缀（保留扩展名） */
export function withSuffix(name: string, suffix: string, newExt?: string): string {
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = newExt ?? (dot > 0 ? name.slice(dot) : '');
  return `${stem}${suffix}${ext}`;
}

const WATERMARK_IMAGE_SIZE = 40;
const MAX_AUDIO_WM_BYTES = 40 * 1024;
const MAX_VIDEO_WM_BYTES = 200 * 1024;

/** 图片水印预处理：缩放为 40px 内 PNG 字节 */
async function prepareImageWatermark(file: File): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, WATERMARK_IMAGE_SIZE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建画布上下文');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await canvasToBlob(canvas, 'image/png');
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * 构建水印负载
 * 文字 → UTF-8 字节；图片 → 缩放后 PNG；音频/视频 → 原始字节（带大小上限）
 */
export async function buildWatermarkPayload(
  type: WatermarkType,
  source: { text?: string; file?: File },
): Promise<WatermarkPayload> {
  if (type === 'text') {
    const text = source.text ?? '';
    if (!text.trim()) throw new Error('请输入水印文字内容');
    return { type, data: new TextEncoder().encode(text), fileName: 'watermark.txt' };
  }
  const file = source.file;
  if (!file) throw new Error('请上传水印文件');
  if (type === 'image') {
    if (!file.type.startsWith('image/')) throw new Error('水印文件不是有效图片');
    return { type, data: await prepareImageWatermark(file), fileName: 'watermark.png' };
  }
  if (type === 'audio') {
    if (!file.type.startsWith('audio/')) throw new Error('水印文件不是有效音频');
    if (file.size > MAX_AUDIO_WM_BYTES) {
      throw new Error(`音频水印过大（上限 ${formatBytes(MAX_AUDIO_WM_BYTES)}），请截取短片段`);
    }
    return { type, data: new Uint8Array(await file.arrayBuffer()), fileName: file.name };
  }
  if (!file.type.startsWith('video/')) throw new Error('水印文件不是有效视频');
  if (file.size > MAX_VIDEO_WM_BYTES) {
    throw new Error(`视频水印过大（上限 ${formatBytes(MAX_VIDEO_WM_BYTES)}），请截取短片段`);
  }
  return { type, data: new Uint8Array(await file.arrayBuffer()), fileName: file.name };
}

let uid = 0;
export function nextId(): string {
  return `t_${Date.now()}_${uid++}`;
}
