/** 比特 / 字节工具函数（MSB 优先） */

export function bytesToBits(bytes: Uint8Array): number[] {
  const bits = new Array<number>(bytes.length * 8);
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    for (let j = 0; j < 8; j++) {
      bits[i * 8 + j] = (b >> (7 - j)) & 1;
    }
  }
  return bits;
}

export function bitsToBytes(bits: number[] | Uint8Array): Uint8Array {
  const n = Math.floor(bits.length / 8);
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    let b = 0;
    for (let j = 0; j < 8; j++) {
      b = (b << 1) | (bits[i * 8 + j] ? 1 : 0);
    }
    out[i] = b;
  }
  return out;
}

export function stringToBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

export function bytesToString(b: Uint8Array): string {
  return new TextDecoder().decode(b);
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

export function u16ToBytes(v: number): Uint8Array {
  return new Uint8Array([(v >> 8) & 0xff, v & 0xff]);
}

export function u32ToBytes(v: number): Uint8Array {
  return new Uint8Array([
    (v >>> 24) & 0xff,
    (v >>> 16) & 0xff,
    (v >>> 8) & 0xff,
    v & 0xff,
  ]);
}

export function bytesToU32(b: Uint8Array, off = 0): number {
  return ((b[off] << 24) | (b[off + 1] << 16) | (b[off + 2] << 8) | b[off + 3]) >>> 0;
}

/** CRC16-CCITT (0xFFFF 初值)，用于负载完整性校验 */
export function crc16(data: Uint8Array): number {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i] << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc & 0xffff;
}
