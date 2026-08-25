import { useEffect, useMemo, useState } from 'react';
import { Download, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { bytesToString } from '@/lib/wm/bits';
import { sniffMime } from '@/lib/wm/codec';
import { downloadBlob } from '@/lib/wm/media';
import { WATERMARK_TYPE_LABEL, type WatermarkPayload } from '@/lib/wm/types';

interface PayloadViewProps {
  payload: WatermarkPayload;
  encrypted?: boolean;
}

/** 渲染提取出的水印内容（文字/图片/音频/视频）并提供下载 */
export default function PayloadView({ payload, encrypted }: PayloadViewProps) {
  const mime = useMemo(
    () => (payload.type === 'text' ? 'text/plain' : sniffMime(payload.data)),
    [payload],
  );
  const url = useMemo(
    () => (payload.type === 'text' ? '' : URL.createObjectURL(new Blob([payload.data.slice()], { type: mime }))),
    [payload, mime],
  );
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);

  const fileName =
    payload.fileName ??
    (payload.type === 'text'
      ? 'watermark.txt'
      : `watermark.${mime.split('/')[1]?.replace('mpeg', 'mp3') ?? 'bin'}`);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="border border-primary px-2 py-0.5 text-primary">
          {WATERMARK_TYPE_LABEL[payload.type]}水印
        </span>
        {encrypted && (
          <span className="flex items-center gap-1 border border-border px-2 py-0.5 text-muted-foreground">
            <Lock className="h-3 w-3" /> 已加密
          </span>
        )}
        <span className="text-muted-foreground">{payload.data.length} 字节</span>
      </div>

      {payload.type === 'text' && (
        <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words border border-border bg-muted/40 p-3 text-sm">
          {bytesToString(payload.data)}
        </pre>
      )}
      {payload.type === 'image' && (
        <div className="border border-border bg-muted/40 p-3">
          <img src={url} alt="提取出的图片水印" className="max-h-40 w-auto object-contain" />
        </div>
      )}
      {payload.type === 'audio' && (
        <div className="border border-border bg-muted/40 p-3">
          <audio controls src={url} className="w-full" />
        </div>
      )}
      {payload.type === 'video' && (
        <div className="border border-border bg-muted/40 p-3">
          <video controls src={url} className="max-h-48 w-full" />
        </div>
      )}

      <Button variant="secondary" size="sm" onClick={() => downloadBlob(new Blob([payload.data.slice()], { type: mime }), fileName)}>
        <Download className="mr-2 h-4 w-4" />
        下载水印文件
      </Button>
    </div>
  );
}

/** 已嵌入水印的载体文件预览（图片/音频/视频） */
export function CarrierPreview({ blob, type }: { blob: Blob; type: 'image' | 'audio' | 'video' }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  if (!url) return null;
  if (type === 'image') {
    return (
      <div className="border border-border bg-muted/40 p-2">
        <img src={url} alt="处理后的图片" className="mx-auto max-h-56 w-auto object-contain" />
      </div>
    );
  }
  if (type === 'audio') {
    return (
      <div className="border border-border bg-muted/40 p-2">
        <audio controls src={url} className="w-full" />
      </div>
    );
  }
  return (
    <div className="border border-border bg-muted/40 p-2">
      <video controls src={url} className="max-h-56 w-full" />
    </div>
  );
}
