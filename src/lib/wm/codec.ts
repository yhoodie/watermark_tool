/**
 * 水印负载编解码
 * 帧格式：MAGIC(4B) | 类型(1B) | 加密标志(1B) | 数据长度(4B) | CRC16(2B) | 数据(nB)
 */
import {
  bytesToString,
  concatBytes,
  crc16,
  stringToBytes,
  u16ToBytes,
  u32ToBytes,
  bytesToU32,
} from './bits';
import { xorCipher } from './crypto';
import type { WatermarkPayload, WatermarkType } from './types';

const MAGIC = stringToBytes('DWM1');
const TYPE_CODE: Record<WatermarkType, number> = { text: 0, image: 1, audio: 2, video: 3 };
const CODE_TYPE: WatermarkType[] = ['text', 'image', 'audio', 'video'];

/** 固定帧头字节数（magic + 类型 + 加密标志 + 长度 + CRC） */
export const HEADER_BYTES = 12;
export const HEADER_BITS = HEADER_BYTES * 8;

/** 将水印负载编码为待嵌入的字节序列；提供 key 时对数据段加密 */
export function encodePayload(payload: WatermarkPayload, key?: string): Uint8Array {
  const encrypted = !!key;
  const body = encrypted ? xorCipher(payload.data, key as string) : payload.data;
  const header = concatBytes(
    MAGIC,
    new Uint8Array([TYPE_CODE[payload.type], encrypted ? 1 : 0]),
    u32ToBytes(body.length),
  );
  const crc = u16ToBytes(crc16(concatBytes(header.subarray(4), body)));
  return concatBytes(header, crc, body);
}

export interface DecodedFrame {
  payload: WatermarkPayload;
  encrypted: boolean;
  /** 整个帧占用的字节数（含帧头） */
  frameBytes: number;
}

/** 仅从帧头解析出总帧长（用于分阶段提取） */
export function parseFrameLength(header: Uint8Array): number {
  if (header.length < HEADER_BYTES) return -1;
  for (let i = 0; i < 4; i++) if (header[i] !== MAGIC[i]) return -1;
  const len = bytesToU32(header, 6);
  if (len <= 0 || len > 8 * 1024 * 1024) return -1;
  return HEADER_BYTES + len;
}

/** 解码完整帧。抛出中文错误信息 */
export function decodePayload(frame: Uint8Array, key?: string): DecodedFrame {
  if (frame.length < HEADER_BYTES) {
    throw new Error('数据长度不足，未检测到水印');
  }
  for (let i = 0; i < 4; i++) {
    if (frame[i] !== MAGIC[i]) throw new Error('未检测到有效水印标记');
  }
  const typeCode = frame[4];
  const encrypted = frame[5] === 1;
  const len = bytesToU32(frame, 6);
  if (typeCode > 3 || len <= 0 || frame.length < HEADER_BYTES + len) {
    throw new Error('水印帧头损坏，无法解析');
  }
  const crcExpected = (frame[10] << 8) | frame[11];
  let body = frame.subarray(HEADER_BYTES, HEADER_BYTES + len);
  const crcActual = crc16(concatBytes(frame.subarray(4, 10), body));
  if (crcActual === crcExpected) {
    if (encrypted) throw new Error('水印已加密，请输入正确密钥后重试');
    return {
      payload: { type: CODE_TYPE[typeCode], data: new Uint8Array(body) },
      encrypted: false,
      frameBytes: HEADER_BYTES + len,
    };
  }
  if (!encrypted) throw new Error('水印数据校验失败（已损坏）');
  if (!key) throw new Error('水印已加密，请输入密钥');
  body = xorCipher(new Uint8Array(body), key);
  const crcDec = crc16(concatBytes(frame.subarray(4, 10), body));
  if (crcDec !== crcExpected) throw new Error('密钥错误或水印数据已损坏');
  return {
    payload: { type: CODE_TYPE[typeCode], data: body },
    encrypted: true,
    frameBytes: HEADER_BYTES + len,
  };
}

/** 依据魔数嗅探二进制数据的真实 MIME（用于还原文件预览） */
export function sniffMime(bytes: Uint8Array): string {
  const sig = (n: number) => Array.from(bytes.subarray(0, n));
  const eq = (arr: number[]) => arr.every((v, i) => bytes[i] === v);
  if (eq([0x89, 0x50, 0x4e, 0x47])) return 'image/png';
  if (eq([0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (eq([0x47, 0x49, 0x46])) return 'image/gif';
  if (eq([0x52, 0x49, 0x46, 0x46]) && bytes[8] === 0x57) return 'audio/wav';
  if (eq([0x49, 0x44, 0x33]) || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) return 'audio/mpeg';
  if (eq([0x4f, 0x67, 0x67, 0x53])) return 'audio/ogg';
  if (bytes.length > 8 && sig(8).slice(4, 8).every((v, i) => v === [0x66, 0x74, 0x79, 0x70][i]))
    return 'video/mp4';
  if (eq([0x1a, 0x45, 0xdf, 0xa3])) return 'video/webm';
  return 'application/octet-stream';
}

/** 提取结果文本预览辅助 */
export function payloadText(payload: WatermarkPayload): string {
  return payload.type === 'text' ? bytesToString(payload.data) : '';
}
