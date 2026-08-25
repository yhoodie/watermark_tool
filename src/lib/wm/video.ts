/**
 * 视频水印：逐帧图片 DCT 嵌入 + MediaRecorder 重编码为 WebM
 * 提取时跨帧多数投票，利用时间冗余抵抗重压缩
 */
import { embedIntoImage, extractRawBitsFromImage, imageCapacityBytes } from './image';
import { decodePayload, encodePayload } from './codec';
import { bytesToBits, bitsToBytes } from './bits';
import type { EmbedOptions, WatermarkPayload } from './types';

const FPS = 25;
const MAX_EMBED_FRAMES = 300; // 最多处理约 12 秒
const HEADER_SAMPLE_FRAMES = 10;
const DATA_SAMPLE_FRAMES = 30;

export interface VideoInfo {
  width: number;
  height: number;
  duration: number;
}

async function loadVideo(file: Blob): Promise<{ video: HTMLVideoElement; url: string }> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;
  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error('视频加载失败，格式可能不受支持'));
  });
  return { video, url };
}

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      resolve();
    };
    video.addEventListener('seeked', onSeeked);
    video.currentTime = Math.min(time, Math.max(0, video.duration - 0.05));
  });
}

export async function getVideoInfo(file: Blob): Promise<VideoInfo> {
  const { video, url } = await loadVideo(file);
  const info = { width: video.videoWidth, height: video.videoHeight, duration: video.duration };
  URL.revokeObjectURL(url);
  return info;
}

/** 视频载体容量（按单帧容量估算） */
export function videoCapacityBytes(w: number, h: number): number {
  return imageCapacityBytes(w, h);
}

function pickMime(): string {
  const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
  for (const m of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}

export type FrameTransform = (img: ImageData, frameIndex: number) => ImageData | void;

/**
 * 通用视频帧处理管线：解码 → 逐帧变换 → 重编码 WebM
 * frameFn 返回新的 ImageData 或就地修改后返回 void
 */
export async function transformVideo(
  file: Blob,
  frameFn: FrameTransform,
  onProgress?: (ratio: number) => void,
  maxFrames = MAX_EMBED_FRAMES,
): Promise<Blob> {
  const { video, url } = await loadVideo(file);
  try {
    const w = video.videoWidth;
    const h = video.videoHeight;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('无法创建画布上下文');
    const stream = canvas.captureStream(0);
    const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
    const mime = pickMime();
    const recorder = new MediaRecorder(
      stream,
      mime ? { mimeType: mime, videoBitsPerSecond: 8_000_000 } : { videoBitsPerSecond: 8_000_000 },
    );
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
    });
    recorder.start();

    const total = Math.max(1, Math.min(Math.floor(video.duration * FPS), maxFrames));
    for (let i = 0; i < total; i++) {
      await seekTo(video, i / FPS + 0.001);
      ctx.drawImage(video, 0, 0, w, h);
      const img = ctx.getImageData(0, 0, w, h);
      const next = frameFn(img, i);
      ctx.putImageData(next ?? img, 0, 0);
      track.requestFrame?.();
      await new Promise((r) => setTimeout(r, 40));
      onProgress?.((i + 1) / total);
    }
    await new Promise((r) => setTimeout(r, 150));
    recorder.stop();
    await stopped;
    return new Blob(chunks, { type: mime.split(';')[0] || 'video/webm' });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 将水印嵌入视频的每一帧 */
export async function embedIntoVideo(
  file: Blob,
  payload: WatermarkPayload,
  opts: EmbedOptions,
  onProgress?: (ratio: number) => void,
): Promise<Blob> {
  const info = await getVideoInfo(file);
  const frame = encodePayload(payload, opts.key);
  const bits = bytesToBits(frame);
  const capacity = videoCapacityBytes(info.width, info.height);
  if (frame.length > capacity) {
    throw new Error(`载体容量不足：该视频分辨率下单帧最多容纳约 ${capacity} 字节水印数据`);
  }
  return transformVideo(
    file,
    (img) => embedIntoImage(img, payload, opts),
    onProgress,
  );
}

interface FrameRead {
  frameLen: number;
  bits: number[];
}

async function readFrameAt(
  video: HTMLVideoElement,
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: number,
  key?: string,
): Promise<FrameRead | null> {
  await seekTo(video, time);
  ctx.drawImage(video, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  return extractRawBitsFromImage(img, key);
}

/** 从视频提取水印：跨帧多数投票 */
export async function extractFromVideo(
  file: Blob,
  key?: string,
  onProgress?: (ratio: number) => void,
): Promise<WatermarkPayload> {
  const { video, url } = await loadVideo(file);
  try {
    const w = video.videoWidth;
    const h = video.videoHeight;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('无法创建画布上下文');
    const dur = Math.min(video.duration, MAX_EMBED_FRAMES / FPS);

    // 阶段一：采样若干帧读取帧头，投票确定帧长
    const headerReads: FrameRead[] = [];
    for (let i = 0; i < HEADER_SAMPLE_FRAMES; i++) {
      const t = (i / HEADER_SAMPLE_FRAMES) * dur + 0.001;
      const r = await readFrameAt(video, ctx, w, h, t, key);
      if (r) headerReads.push(r);
      onProgress?.(((i + 1) / HEADER_SAMPLE_FRAMES) * 0.3);
    }
    if (headerReads.length === 0) throw new Error('未检测到有效水印，或密钥不正确');
    const lenCount = new Map<number, number>();
    for (const r of headerReads) lenCount.set(r.frameLen, (lenCount.get(r.frameLen) ?? 0) + 1);
    let frameLen = headerReads[0].frameLen;
    let best = 0;
    for (const [len, c] of lenCount) {
      if (c > best) {
        best = c;
        frameLen = len;
      }
    }

    // 阶段二：更多帧读取数据段并逐比特投票
    const totalBits = frameLen * 8;
    const votes = new Array<number>(totalBits).fill(0);
    const counts = new Array<number>(totalBits).fill(0);
    for (let i = 0; i < DATA_SAMPLE_FRAMES; i++) {
      const t = (i / DATA_SAMPLE_FRAMES) * dur + 0.001;
      const r = await readFrameAt(video, ctx, w, h, t, key);
      if (r && r.frameLen === frameLen) {
        for (let b = 0; b < totalBits; b++) {
          votes[b] += r.bits[b] ? 1 : 0;
          counts[b]++;
        }
      }
      onProgress?.(0.3 + ((i + 1) / DATA_SAMPLE_FRAMES) * 0.7);
    }
    const bits = new Array<number>(totalBits);
    for (let b = 0; b < totalBits; b++) {
      bits[b] = votes[b] * 2 >= (counts[b] || 1) ? 1 : 0;
    }
    return decodePayload(bitsToBytes(bits), key).payload;
  } finally {
    URL.revokeObjectURL(url);
  }
}
