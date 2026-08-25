/** 水印加解密：基于密钥派生伪随机流的 XOR 对称加密（演示级） */

/** FNV-1a 32 位哈希，用于从任意字符串密钥派生种子 */
export function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 伪随机数发生器 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 对称 XOR 流加密：加密与解密为同一函数 */
export function xorCipher(data: Uint8Array, key: string): Uint8Array {
  const rand = mulberry32(fnv1a(key));
  const out = new Uint8Array(data.length);
  let ks = 0;
  let ksBits = 0;
  for (let i = 0; i < data.length; i++) {
    if (ksBits === 0) {
      ks = Math.floor(rand() * 0xffffffff) >>> 0;
      ksBits = 4;
    }
    out[i] = data[i] ^ (ks & 0xff);
    ks >>>= 8;
    ksBits--;
  }
  return out;
}

/** 由密钥派生嵌入位置置乱种子（未加密时使用固定种子） */
export function permSeed(key?: string): number {
  return key ? fnv1a(`wm::${key}`) : 0x9e3779b9;
}

/** Fisher-Yates 置乱，生成 0..n-1 的确定性排列 */
export function shuffledIndices(n: number, seed: number): Uint32Array {
  const idx = new Uint32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  const rand = mulberry32(seed);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = idx[i];
    idx[i] = idx[j];
    idx[j] = t;
  }
  return idx;
}
