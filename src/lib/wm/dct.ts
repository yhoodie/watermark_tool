/** 8x8 DCT-II / DCT-III（朴素实现 + 预计算余弦表） */

const N = 8;
const COS: number[][] = [];
const C: number[] = [];

for (let u = 0; u < N; u++) {
  COS[u] = [];
  C[u] = u === 0 ? Math.SQRT1_2 : 1;
  for (let x = 0; x < N; x++) {
    COS[u][x] = Math.cos(((2 * x + 1) * u * Math.PI) / (2 * N));
  }
}

/** 正向 DCT，输入/输出均为长度 64 的数组（行优先） */
export function forwardDCT(input: ArrayLike<number>, output: Float64Array): void {
  for (let u = 0; u < N; u++) {
    for (let v = 0; v < N; v++) {
      let sum = 0;
      for (let x = 0; x < N; x++) {
        for (let y = 0; y < N; y++) {
          sum += input[x * N + y] * COS[u][x] * COS[v][y];
        }
      }
      output[u * N + v] = 0.25 * C[u] * C[v] * sum;
    }
  }
}

/** 逆向 DCT */
export function inverseDCT(input: ArrayLike<number>, output: Float64Array): void {
  for (let x = 0; x < N; x++) {
    for (let y = 0; y < N; y++) {
      let sum = 0;
      for (let u = 0; u < N; u++) {
        for (let v = 0; v < N; v++) {
          sum += C[u] * C[v] * input[u * N + v] * COS[u][x] * COS[v][y];
        }
      }
      output[x * N + y] = 0.25 * sum;
    }
  }
}
