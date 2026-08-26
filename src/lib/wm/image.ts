/**
 * 图片水印：8x8 分块 DCT 中频系数对比较嵌入（盲提取）
 * 嵌入位置由密钥派生种子置乱（分存），每个比特经 R 个块冗余投票
 */
import { forwardDCT, inverseDCT } from './dct';
import { permSeed, shuffledIndices } from './crypto';
import { HEADER_BITS, decodePayload, encodePayload, parseFrameLength } from './codec';
import { bytesToBits, bitsToBytes } from './bits';
import type { EmbedOptions, WatermarkPayload } from './types';

/** 中频系数对（行优先线性下标） */
const COEF_A = 3 * 8 + 2;
const COEF_B = 2 * 8 + 3;
const MAX_REDUNDANCY = 8;

function blockCount(w: number, h: number): number {
  return Math.floor(w / 8) * Math.floor(h / 8);
}

/** 帧头冗余度：容量充裕时才提高冗余，避免小载体被帧头占满 */
function headerRedundancy(n: number): number {
  return Math.max(1, Math.min(MAX_REDUNDANCY, Math.floor(n / (HEADER_BITS * 4))));
}

/** 估算图片载体可嵌入的最大负载字节数 */
export function imageCapacityBytes(w: number, h: number): number {
  const n = blockCount(w, h);
  const rh = headerRedundancy(n);
  const dataBits = n - HEADER_BITS * rh;
  return Math.max(0, Math.floor(dataBits / 8) - 12);
}

interface Layout {
  n: number;
  perm: Uint32Array;
  rh: number;
  rd: number;
  dataBits: number;
}

function buildLayout(n: number, dataBits: number, key?: string): Layout {
  const rh = headerRedundancy(n);
  const rest = n - HEADER_BITS * rh;
  if (rest < dataBits) throw new Error('CAPACITY');
  const rd = Math.max(1, Math.min(MAX_REDUNDANCY, Math.floor(rest / dataBits)));
  return { n, perm: shuffledIndices(n, permSeed(key)), rh, rd, dataBits };
}

/** 从 RGBA 像素读取一个 8x8 亮度块 */
function readLuma(data: Uint8ClampedArray, w: number, bx: number, by: number, out: Float64Array) {
  for (let x = 0; x < 8; x++) {
    for (let y = 0; y < 8; y++) {
      const p = ((by + x) * w + (bx + y)) * 4;
      out[x * 8 + y] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
    }
  }
}

/** 将亮度差写回 RGB 三通道 */
function writeLumaDiff(
  data: Uint8ClampedArray,
  w: number,
  bx: number,
  by: number,
  before: Float64Array,
  after: Float64Array,
) {
  for (let x = 0; x < 8; x++) {
    for (let y = 0; y < 8; y++) {
      const d = after[x * 8 + y] - before[x * 8 + y];
      if (Math.abs(d) < 0.01) continue;
      const p = ((by + x) * w + (bx + y)) * 4;
      data[p] = Math.max(0, Math.min(255, data[p] + d));
      data[p + 1] = Math.max(0, Math.min(255, data[p + 1] + d));
      data[p + 2] = Math.max(0, Math.min(255, data[p + 2] + d));
    }
  }
}

/** 向单个块嵌入 1 比特 */
function embedBitIntoBlock(
  data: Uint8ClampedArray,
  w: number,
  blockIdx: number,
  bw: number,
  bit: number,
  delta: number,
  luma: Float64Array,
  coef: Float64Array,
) {
  const bx = (blockIdx % bw) * 8;
  const by = Math.floor(blockIdx / bw) * 8;
  readLuma(data, w, bx, by, luma);
  forwardDCT(luma, coef);
  const m = (coef[COEF_A] + coef[COEF_B]) / 2;
  if (bit === 1) {
    coef[COEF_A] = m + delta / 2;
    coef[COEF_B] = m - delta / 2;
  } else {
    coef[COEF_A] = m - delta / 2;
    coef[COEF_B] = m + delta / 2;
  }
  const rebuilt = new Float64Array(64);
  inverseDCT(coef, rebuilt);
  writeLumaDiff(data, w, bx, by, luma, rebuilt);
}

/** 从单个块读取 1 比特投票 */
function voteFromBlock(
  data: Uint8ClampedArray,
  w: number,
  blockIdx: number,
  bw: number,
  luma: Float64Array,
  coef: Float64Array,
): number {
  const bx = (blockIdx % bw) * 8;
  const by = Math.floor(blockIdx / bw) * 8;
  readLuma(data, w, bx, by, luma);
  forwardDCT(luma, coef);
  return coef[COEF_A] > coef[COEF_B] ? 1 : 0;
}

/** 将水印嵌入 ImageData，返回新的 ImageData */
export function embedIntoImage(
  img: ImageData,
  payload: WatermarkPayload,
  opts: EmbedOptions,
): ImageData {
  const frame = encodePayload(payload, opts.key);
  const bits = bytesToBits(frame);
  const n = blockCount(img.width, img.height);
  let layout: Layout;
  try {
    layout = buildLayout(n, bits.length - HEADER_BITS, opts.key);
  } catch {
    throw new Error(
      `载体容量不足：该图片最多容纳约 ${imageCapacityBytes(img.width, img.height)} 字节水印数据`,
    );
  }
  const out = new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
  const bw = Math.floor(img.width / 8);
  const delta = 6 + opts.strength * 6;
  const luma = new Float64Array(64);
  const coef = new Float64Array(64);
  const d = out.data;
  for (let i = 0; i < bits.length; i++) {
    const isHeader = i < HEADER_BITS;
    const r = isHeader ? layout.rh : layout.rd;
    const base = isHeader ? 0 : HEADER_BITS * layout.rh;
    const idx = isHeader ? i : i - HEADER_BITS;
    for (let k = 0; k < r; k++) {
      embedBitIntoBlock(d, img.width, layout.perm[base + idx * r + k], bw, bits[i], delta, luma, coef);
    }
  }
  return out;
}

/** 按布局读取 bitCount 个比特（多数投票） */
function readBits(
  data: Uint8ClampedArray,
  w: number,
  layout: Layout,
  bitCount: number,
): number[] {
  const bw = Math.floor(w / 8);
  const luma = new Float64Array(64);
  const coef = new Float64Array(64);
  const bits = new Array<number>(bitCount);
  const total = Math.min(bitCount, HEADER_BITS + layout.dataBits);
  for (let i = 0; i < total; i++) {
    const isHeader = i < HEADER_BITS;
    const r = isHeader ? layout.rh : layout.rd;
    const base = isHeader ? 0 : HEADER_BITS * layout.rh;
    const idx = isHeader ? i : i - HEADER_BITS;
    let votes = 0;
    for (let k = 0; k < r; k++) {
      votes += voteFromBlock(data, w, layout.perm[base + idx * r + k], bw, luma, coef);
    }
    bits[i] = votes * 2 > r ? 1 : 0;
  }
  return bits.slice(0, total);
}

/** 读取原始帧比特（不做 CRC 校验），供视频跨帧投票使用 */
export function extractRawBitsFromImage(
  img: ImageData,
  key?: string,
): { frameLen: number; bits: number[] } | null {
  const n = blockCount(img.width, img.height);
  const rh = headerRedundancy(n);
  const headerLayout: Layout = {
    n,
    perm: shuffledIndices(n, permSeed(key)),
    rh,
    rd: 1,
    dataBits: 0,
  };
  const headerBytes = bitsToBytes(readBits(img.data, img.width, headerLayout, HEADER_BITS));
  const frameLen = parseFrameLength(headerBytes);
  if (frameLen < 0) return null;
  const dataBits = frameLen * 8 - HEADER_BITS;
  if (n - HEADER_BITS * rh < dataBits) return null;
  const layout = buildLayout(n, dataBits, key);
  return { frameLen, bits: readBits(img.data, img.width, layout, HEADER_BITS + dataBits) };
}

/** 从 ImageData 提取水印（两阶段：先读帧头，再读数据段） */
export function extractFromImage(img: ImageData, key?: string): WatermarkPayload {
  const n = blockCount(img.width, img.height);
  const rh = headerRedundancy(n);
  // 阶段一：读取帧头
  const headerLayout: Layout = {
    n,
    perm: shuffledIndices(n, permSeed(key)),
    rh,
    rd: 1,
    dataBits: 0,
  };
  const headerBits = readBits(img.data, img.width, headerLayout, HEADER_BITS);
  const headerBytes = bitsToBytes(headerBits);
  const frameLen = parseFrameLength(headerBytes);
  if (frameLen < 0) throw new Error('未检测到有效水印，或密钥不正确');
  const dataBits = frameLen * 8 - HEADER_BITS;
  const rest = n - HEADER_BITS * rh;
  if (rest < dataBits) throw new Error('水印数据超出载体容量，文件可能已被裁剪或损坏');
  // 阶段二：读取数据段
  const layout = buildLayout(n, dataBits, key);
  const bits = readBits(img.data, img.width, layout, HEADER_BITS + dataBits);
  const frame = bitsToBytes(bits);
  return decodePayload(frame, key).payload;
}
