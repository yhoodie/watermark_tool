/**
 * 攻击模拟：格式转换 / 裁剪 / 噪声 / 压缩 / 旋转缩放等
 * 用于验证水印鲁棒性
 */
import {
  canvasToBlob,
  fileToImageData,
  imageDataToBlob,
  imageDataToCanvas,
} from './media';
import { transformVideo } from './video';

export type AttackId =
  | 'format'
  | 'crop'
  | 'noise'
  | 'saltpepper'
  | 'rotate'
  | 'scale'
  | 'lowpass'
  | 'trim'
  | 'bitdepth';

export interface AttackDef {
  id: AttackId;
  label: string;
  desc: string;
  /** 适用的载体类型 */
  carriers: ('image' | 'audio' | 'video')[];
  /** 参数定义 */
  params: {
    key: string;
    label: string;
    min: number;
    max: number;
    step: number;
    defaultValue: number;
    unit?: string;
  }[];
}

export const ATTACK_DEFS: AttackDef[] = [
  {
    id: 'format',
    label: '格式转换 / JPEG 压缩',
    desc: '重编码为有损格式，模拟转存压缩',
    carriers: ['image', 'video', 'audio'],
    params: [
      { key: 'quality', label: '压缩质量', min: 10, max: 95, step: 5, defaultValue: 50, unit: '%' },
    ],
  },
  {
    id: 'crop',
    label: '裁剪',
    desc: '裁去边缘后拉伸回原尺寸',
    carriers: ['image', 'video', 'audio'],
    params: [
      { key: 'percent', label: '裁剪比例', min: 5, max: 40, step: 1, defaultValue: 15, unit: '%' },
    ],
  },
  {
    id: 'noise',
    label: '高斯噪声',
    desc: '叠加随机亮度噪声',
    carriers: ['image', 'video', 'audio'],
    params: [
      { key: 'sigma', label: '噪声强度', min: 2, max: 40, step: 1, defaultValue: 12 },
    ],
  },
  {
    id: 'saltpepper',
    label: '椒盐噪声',
    desc: '随机黑白像素点污染',
    carriers: ['image', 'video'],
    params: [
      { key: 'density', label: '污染密度', min: 0.5, max: 10, step: 0.5, defaultValue: 2, unit: '%' },
    ],
  },
  {
    id: 'rotate',
    label: '旋转',
    desc: '小幅旋转并裁回原始尺寸',
    carriers: ['image', 'video'],
    params: [
      { key: 'deg', label: '旋转角度', min: 1, max: 30, step: 1, defaultValue: 8, unit: '°' },
    ],
  },
  {
    id: 'scale',
    label: '缩放重采样',
    desc: '先缩小再放大回原尺寸',
    carriers: ['image', 'video'],
    params: [
      { key: 'percent', label: '缩小比例', min: 25, max: 90, step: 5, defaultValue: 50, unit: '%' },
    ],
  },
  {
    id: 'lowpass',
    label: '低通滤波',
    desc: '滤除高频成分（音频）',
    carriers: ['audio'],
    params: [
      { key: 'cutoff', label: '滤波强度', min: 10, max: 95, step: 5, defaultValue: 60, unit: '%' },
    ],
  },
  {
    id: 'trim',
    label: '首尾裁剪',
    desc: '切除音频首尾片段（音频）',
    carriers: ['audio'],
    params: [
      { key: 'percent', label: '裁剪比例', min: 5, max: 30, step: 1, defaultValue: 10, unit: '%' },
    ],
  },
  {
    id: 'bitdepth',
    label: '位深压缩',
    desc: '量化为 8 位采样（音频）',
    carriers: ['audio'],
    params: [],
  },
];

export type AttackParams = Record<string, number>;

function rand(seedRef: { s: number }): number {
  seedRef.s = (seedRef.s * 1664525 + 1013904223) >>> 0;
  return seedRef.s / 4294967296;
}

function gaussian(ref: { s: number }): number {
  const u = Math.max(1e-9, rand(ref));
  const v = rand(ref);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** 应用图片攻击链，返回攻击后的 ImageData */
export async function applyImageAttacks(
  img: ImageData,
  attacks: { id: AttackId; params: AttackParams }[],
): Promise<ImageData> {
  let cur = img;
  const ref = { s: 0x12345678 };
  for (const atk of attacks) {
    switch (atk.id) {
      case 'format': {
        const q = (atk.params.quality ?? 50) / 100;
        const blob = await imageDataToBlob(cur, 'image/jpeg', q);
        cur = await fileToImageData(blob);
        break;
      }
      case 'crop': {
        const p = (atk.params.percent ?? 15) / 100;
        const cw = Math.max(8, Math.round(cur.width * (1 - p)));
        const ch = Math.max(8, Math.round(cur.height * (1 - p)));
        const src = imageDataToCanvas(cur);
        const out = document.createElement('canvas');
        out.width = cur.width;
        out.height = cur.height;
        const ctx = out.getContext('2d');
        if (!ctx) throw new Error('无法创建画布上下文');
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(
          src,
          (cur.width - cw) / 2,
          (cur.height - ch) / 2,
          cw,
          ch,
          0,
          0,
          cur.width,
          cur.height,
        );
        cur = ctx.getImageData(0, 0, cur.width, cur.height);
        break;
      }
      case 'noise': {
        const sigma = atk.params.sigma ?? 12;
        const d = new Uint8ClampedArray(cur.data);
        for (let i = 0; i < d.length; i += 4) {
          const nz = gaussian(ref) * sigma;
          d[i] = d[i] + nz;
          d[i + 1] = d[i + 1] + nz;
          d[i + 2] = d[i + 2] + nz;
        }
        cur = new ImageData(d, cur.width, cur.height);
        break;
      }
      case 'saltpepper': {
        const density = (atk.params.density ?? 2) / 100;
        const d = new Uint8ClampedArray(cur.data);
        const pixels = cur.width * cur.height;
        const count = Math.floor(pixels * density);
        for (let i = 0; i < count; i++) {
          const p = Math.floor(rand(ref) * pixels) * 4;
          const v = rand(ref) > 0.5 ? 255 : 0;
          d[p] = d[p + 1] = d[p + 2] = v;
        }
        cur = new ImageData(d, cur.width, cur.height);
        break;
      }
      case 'rotate': {
        const deg = atk.params.deg ?? 8;
        const src = imageDataToCanvas(cur);
        const out = document.createElement('canvas');
        out.width = cur.width;
        out.height = cur.height;
        const ctx = out.getContext('2d');
        if (!ctx) throw new Error('无法创建画布上下文');
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, out.width, out.height);
        ctx.translate(cur.width / 2, cur.height / 2);
        ctx.rotate((deg * Math.PI) / 180);
        ctx.drawImage(src, -cur.width / 2, -cur.height / 2);
        cur = ctx.getImageData(0, 0, cur.width, cur.height);
        break;
      }
      case 'scale': {
        const p = (atk.params.percent ?? 50) / 100;
        const sw = Math.max(8, Math.round(cur.width * p));
        const sh = Math.max(8, Math.round(cur.height * p));
        const src = imageDataToCanvas(cur);
        const small = document.createElement('canvas');
        small.width = sw;
        small.height = sh;
        const sctx = small.getContext('2d');
        if (!sctx) throw new Error('无法创建画布上下文');
        sctx.drawImage(src, 0, 0, sw, sh);
        const out = document.createElement('canvas');
        out.width = cur.width;
        out.height = cur.height;
        const ctx = out.getContext('2d');
        if (!ctx) throw new Error('无法创建画布上下文');
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(small, 0, 0, cur.width, cur.height);
        cur = ctx.getImageData(0, 0, cur.width, cur.height);
        break;
      }
      default:
        break;
    }
  }
  return cur;
}

/** 应用音频攻击链，就地修改采样并返回 */
export function applyAudioAttacks(
  samples: Float32Array,
  attacks: { id: AttackId; params: AttackParams }[],
): Float32Array {
  let cur = samples;
  const ref = { s: 0x87654321 };
  for (const atk of attacks) {
    switch (atk.id) {
      case 'noise': {
        const sigma = (atk.params.sigma ?? 12) / 255 / 4;
        for (let i = 0; i < cur.length; i++) {
          cur[i] = Math.max(-1, Math.min(1, cur[i] + gaussian(ref) * sigma));
        }
        break;
      }
      case 'trim': {
        const p = (atk.params.percent ?? 10) / 100 / 2;
        const cut = Math.floor(cur.length * p);
        cur = cur.subarray(cut, cur.length - cut).slice();
        break;
      }
      case 'lowpass': {
        const cutoff = (atk.params.cutoff ?? 60) / 100;
        const alpha = Math.max(0.02, Math.min(0.98, cutoff));
        let prev = 0;
        for (let i = 0; i < cur.length; i++) {
          prev = prev + alpha * (cur[i] - prev);
          cur[i] = prev;
        }
        break;
      }
      case 'bitdepth': {
        for (let i = 0; i < cur.length; i++) {
          cur[i] = Math.round(cur[i] * 127) / 127;
        }
        break;
      }
      case 'format': {
        // 音频格式转换近似为有损重量化：12 位量化
        for (let i = 0; i < cur.length; i++) {
          cur[i] = Math.round(cur[i] * 2047) / 2047;
        }
        break;
      }
      default:
        break;
    }
  }
  return cur;
}

/** 应用视频攻击链：逐帧执行图片攻击（跳过 format，因重编码本身即为格式转换） */
export async function applyVideoAttacks(
  file: Blob,
  attacks: { id: AttackId; params: AttackParams }[],
  onProgress?: (ratio: number) => void,
): Promise<Blob> {
  const frameAttacks = attacks.filter((a) => a.id !== 'format');
  return transformVideo(
    file,
    (img) => {
      // 逐帧同步可执行的攻击子集（噪声/椒盐），几何类攻击经 canvas 同步完成
      let cur = img;
      const ref = { s: 0xabcdef01 };
      for (const atk of frameAttacks) {
        if (atk.id === 'noise') {
          const sigma = atk.params.sigma ?? 12;
          const d = new Uint8ClampedArray(cur.data);
          for (let i = 0; i < d.length; i += 4) {
            const nz = gaussian(ref) * sigma;
            d[i] = d[i] + nz;
            d[i + 1] = d[i + 1] + nz;
            d[i + 2] = d[i + 2] + nz;
          }
          cur = new ImageData(d, cur.width, cur.height);
        } else if (atk.id === 'crop') {
          const p = (atk.params.percent ?? 15) / 100;
          const cw = Math.max(8, Math.round(cur.width * (1 - p)));
          const ch = Math.max(8, Math.round(cur.height * (1 - p)));
          const src = imageDataToCanvas(cur);
          const out = document.createElement('canvas');
          out.width = cur.width;
          out.height = cur.height;
          const ctx = out.getContext('2d');
          if (!ctx) continue;
          ctx.drawImage(
            src,
            (cur.width - cw) / 2,
            (cur.height - ch) / 2,
            cw,
            ch,
            0,
            0,
            cur.width,
            cur.height,
          );
          cur = ctx.getImageData(0, 0, cur.width, cur.height);
        } else if (atk.id === 'scale') {
          const p = (atk.params.percent ?? 50) / 100;
          const sw = Math.max(8, Math.round(cur.width * p));
          const sh = Math.max(8, Math.round(cur.height * p));
          const src = imageDataToCanvas(cur);
          const small = document.createElement('canvas');
          small.width = sw;
          small.height = sh;
          const sctx = small.getContext('2d');
          if (!sctx) continue;
          sctx.drawImage(src, 0, 0, sw, sh);
          const out = document.createElement('canvas');
          out.width = cur.width;
          out.height = cur.height;
          const ctx = out.getContext('2d');
          if (!ctx) continue;
          ctx.drawImage(small, 0, 0, cur.width, cur.height);
          cur = ctx.getImageData(0, 0, cur.width, cur.height);
        }
      }
      return cur;
    },
    onProgress,
  );
}

/** 图片攻击结果导出为 PNG Blob */
export async function attackedImageBlob(img: ImageData): Promise<Blob> {
  return canvasToBlob(imageDataToCanvas(img), 'image/png');
}
