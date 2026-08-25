/**
 * 音频水印：分块均值扩频嵌入（盲提取）
 * 每个比特映射到 R 个采样块，块内按 Hann 窗平滑抬升/压低均值
 */
import { permSeed, shuffledIndices } from './crypto';
import { HEADER_BITS, decodePayload, encodePayload, parseFrameLength } from './codec';
import { bytesToBits, bitsToBytes } from './bits';
import type { EmbedOptions, WatermarkPayload } from './types';

export const CHUNK = 2048;
const MAX_REDUNDANCY = 8;

const HANN = (() => {
  const w = new Float32Array(CHUNK);
  for (let i = 0; i < CHUNK; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (CHUNK - 1)));
  return w;
})();

/** 解码音频文件为单声道 Float32 PCM */
export async function decodeAudioFile(file: Blob): Promise<{ samples: Float32Array; sampleRate: number }> {
  const ctx = new AudioContext();
  try {
    const buf = await ctx.decodeAudioData(await file.arrayBuffer());
    const len = buf.length;
    const out = new Float32Array(len);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const ch = buf.getChannelData(c);
      for (let i = 0; i < len; i++) out[i] += ch[i] / buf.numberOfChannels;
    }
    return { samples: out, sampleRate: buf.sampleRate };
  } finally {
    void ctx.close();
  }
}

/** 估算音频载体最大负载字节数 */
export function audioCapacityBytes(sampleCount: number): number {
  const n = Math.floor(sampleCount / CHUNK);
  const rh = Math.max(1, Math.min(MAX_REDUNDANCY, Math.floor(n / HEADER_BITS)));
  const dataBits = n - HEADER_BITS * rh;
  return Math.max(0, Math.floor(dataBits / 8) - 12);
}

interface AudioLayout {
  n: number;
  perm: Uint32Array;
  rh: number;
  rd: number;
  dataBits: number;
}

function buildLayout(n: number, dataBits: number, key?: string): AudioLayout {
  const rh = Math.max(1, Math.min(MAX_REDUNDANCY, Math.floor(n / HEADER_BITS)));
  const rest = n - HEADER_BITS * rh;
  if (rest < dataBits) throw new Error('CAPACITY');
  const rd = Math.max(1, Math.min(MAX_REDUNDANCY, Math.floor(rest / dataBits)));
  return { n, perm: shuffledIndices(n, permSeed(key)), rh, rd, dataBits };
}

function embedBitIntoChunk(samples: Float32Array, chunkIdx: number, bit: number, amp: number) {
  const off = chunkIdx * CHUNK;
  let mean = 0;
  for (let i = 0; i < CHUNK; i++) mean += samples[off + i];
  mean /= CHUNK;
  const target = bit === 1 ? amp : -amp;
  const diff = target - mean;
  for (let i = 0; i < CHUNK; i++) {
    samples[off + i] = Math.max(-1, Math.min(1, samples[off + i] + diff * HANN[i]));
  }
}

function voteFromChunk(samples: Float32Array, chunkIdx: number): number {
  const off = chunkIdx * CHUNK;
  let mean = 0;
  for (let i = 0; i < CHUNK; i++) mean += samples[off + i];
  return mean > 0 ? 1 : 0;
}

/** 将水印嵌入 PCM，就地修改并返回 */
export function embedIntoAudio(
  samples: Float32Array,
  payload: WatermarkPayload,
  opts: EmbedOptions,
): Float32Array {
  const frame = encodePayload(payload, opts.key);
  const bits = bytesToBits(frame);
  const n = Math.floor(samples.length / CHUNK);
  let layout: AudioLayout;
  try {
    layout = buildLayout(n, bits.length - HEADER_BITS, opts.key);
  } catch {
    throw new Error(
      `载体容量不足：该音频最多容纳约 ${audioCapacityBytes(samples.length)} 字节水印数据，请缩短水印内容或使用更长的音频`,
    );
  }
  const amp = 0.002 + opts.strength * 0.0015;
  for (let i = 0; i < bits.length; i++) {
    const isHeader = i < HEADER_BITS;
    const r = isHeader ? layout.rh : layout.rd;
    const base = isHeader ? 0 : HEADER_BITS * layout.rh;
    const idx = isHeader ? i : i - HEADER_BITS;
    for (let k = 0; k < r; k++) {
      embedBitIntoChunk(samples, layout.perm[base + idx * r + k], bits[i], amp);
    }
  }
  return samples;
}

function readBits(samples: Float32Array, layout: AudioLayout, bitCount: number): number[] {
  const bits = new Array<number>(bitCount);
  const total = Math.min(bitCount, HEADER_BITS + layout.dataBits);
  for (let i = 0; i < total; i++) {
    const isHeader = i < HEADER_BITS;
    const r = isHeader ? layout.rh : layout.rd;
    const base = isHeader ? 0 : HEADER_BITS * layout.rh;
    const idx = isHeader ? i : i - HEADER_BITS;
    let votes = 0;
    for (let k = 0; k < r; k++) votes += voteFromChunk(samples, layout.perm[base + idx * r + k]);
    bits[i] = votes * 2 > r ? 1 : 0;
  }
  return bits.slice(0, total);
}

/** 从 PCM 提取水印 */
export function extractFromAudio(samples: Float32Array, key?: string): WatermarkPayload {
  const n = Math.floor(samples.length / CHUNK);
  const rh = Math.max(1, Math.min(MAX_REDUNDANCY, Math.floor(n / HEADER_BITS)));
  const headerLayout: AudioLayout = { n, perm: shuffledIndices(n, permSeed(key)), rh, rd: 1, dataBits: 0 };
  const headerBytes = bitsToBytes(readBits(samples, headerLayout, HEADER_BITS));
  const frameLen = parseFrameLength(headerBytes);
  if (frameLen < 0) throw new Error('未检测到有效水印，或密钥不正确');
  const dataBits = frameLen * 8 - HEADER_BITS;
  if (n - HEADER_BITS * rh < dataBits) throw new Error('水印数据超出载体容量，音频可能已被裁剪');
  const layout = buildLayout(n, dataBits, key);
  const frame = bitsToBytes(readBits(samples, layout, HEADER_BITS + dataBits));
  return decodePayload(frame, key).payload;
}

/** 编码 16-bit PCM WAV 文件 */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const dataLen = samples.length * 2;
  const buf = new ArrayBuffer(44 + dataLen);
  const v = new DataView(buf);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  v.setUint32(4, 36 + dataLen, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  writeStr(36, 'data');
  v.setUint32(40, dataLen, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, Math.round(s * 32767), true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}
