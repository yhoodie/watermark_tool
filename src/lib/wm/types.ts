/** 数字水印系统核心类型定义 */

/** 载体类型 */
export type CarrierType = 'image' | 'audio' | 'video';

/** 水印内容类型 */
export type WatermarkType = 'text' | 'image' | 'audio' | 'video';

/** 待嵌入的水印负载 */
export interface WatermarkPayload {
  type: WatermarkType;
  /** 原始字节（文字为 UTF-8 编码，文件为原始二进制） */
  data: Uint8Array;
  /** 原始文件名（用于还原下载） */
  fileName?: string;
}

/** 嵌入参数 */
export interface EmbedOptions {
  /** 强度 1-10，越高越鲁棒但痕迹越明显 */
  strength: number;
  /** 可选加密密钥，空字符串/未提供则不加密 */
  key?: string;
}

/** 提取结果 */
export interface ExtractOutcome {
  ok: boolean;
  message: string;
  payload?: WatermarkPayload;
  /** 水印是否经过加密 */
  encrypted?: boolean;
}

/** 批量任务中单个文件的处理状态 */
export type TaskStatus = 'pending' | 'processing' | 'done' | 'error';

export interface FileTask<T = unknown> {
  id: string;
  file: File;
  status: TaskStatus;
  message?: string;
  result?: T;
}

/** 载体与水印类型匹配规则 */
export const CARRIER_RULES: Record<CarrierType, WatermarkType[]> = {
  image: ['text', 'image'],
  audio: ['text', 'audio'],
  video: ['text', 'image', 'audio', 'video'],
};

export const WATERMARK_TYPE_LABEL: Record<WatermarkType, string> = {
  text: '文字',
  image: '图片',
  audio: '音频',
  video: '视频',
};

export const CARRIER_TYPE_LABEL: Record<CarrierType, string> = {
  image: '图片',
  audio: '音频',
  video: '视频',
};
