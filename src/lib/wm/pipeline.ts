/** 嵌入 / 提取统一调度：按载体类型分发到对应算法 */
import { embedIntoImage, extractFromImage, imageCapacityBytes } from './image';
import { decodeAudioFile, embedIntoAudio, encodeWav, extractFromAudio, audioCapacityBytes } from './audio';
import { embedIntoVideo, extractFromVideo, getVideoInfo, videoCapacityBytes } from './video';
import { fileToImageData, imageDataToBlob, withSuffix } from './media';
import type { CarrierType, EmbedOptions, ExtractOutcome, WatermarkPayload } from './types';

export interface EmbeddedFile {
  blob: Blob;
  name: string;
  carrier: CarrierType;
}

/** 估算指定载体文件的最大水印容量（字节） */
export async function estimateCapacity(file: File, carrier: CarrierType): Promise<number> {
  if (carrier === 'image') {
    const img = await fileToImageData(file);
    return imageCapacityBytes(img.width, img.height);
  }
  if (carrier === 'audio') {
    const { samples } = await decodeAudioFile(file);
    return audioCapacityBytes(samples.length);
  }
  const info = await getVideoInfo(file);
  return videoCapacityBytes(info.width, info.height);
}

/** 对单个载体文件执行嵌入 */
export async function embedCarrier(
  file: File,
  carrier: CarrierType,
  payload: WatermarkPayload,
  opts: EmbedOptions,
  onProgress?: (ratio: number) => void,
): Promise<EmbeddedFile> {
  if (carrier === 'image') {
    const img = await fileToImageData(file);
    const out = embedIntoImage(img, payload, opts);
    const blob = await imageDataToBlob(out, 'image/png');
    onProgress?.(1);
    return { blob, name: withSuffix(file.name, '_watermarked', '.png'), carrier };
  }
  if (carrier === 'audio') {
    const { samples, sampleRate } = await decodeAudioFile(file);
    embedIntoAudio(samples, payload, opts);
    const blob = encodeWav(samples, sampleRate);
    onProgress?.(1);
    return { blob, name: withSuffix(file.name, '_watermarked', '.wav'), carrier };
  }
  const blob = await embedIntoVideo(file, payload, opts, onProgress);
  return { blob, name: withSuffix(file.name, '_watermarked', '.webm'), carrier };
}

/** 对单个文件执行提取 */
export async function extractCarrier(
  file: File,
  carrier: CarrierType,
  key?: string,
  onProgress?: (ratio: number) => void,
): Promise<ExtractOutcome> {
  try {
    let payload: WatermarkPayload;
    if (carrier === 'image') {
      const img = await fileToImageData(file);
      payload = extractFromImage(img, key);
      onProgress?.(1);
    } else if (carrier === 'audio') {
      const { samples } = await decodeAudioFile(file);
      payload = extractFromAudio(samples, key);
      onProgress?.(1);
    } else {
      payload = await extractFromVideo(file, key, onProgress);
    }
    return {
      ok: true,
      message: '水印提取成功',
      payload,
      encrypted: undefined,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : '提取失败' };
  }
}
