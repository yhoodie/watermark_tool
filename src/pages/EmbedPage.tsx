import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Loader2, Play } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import FileDrop, { type DroppedFile } from '@/components/wm/FileDrop';
import { KeyInput, StrengthSlider } from '@/components/wm/controls';
import { CarrierPreview } from '@/components/wm/PayloadView';
import {
  buildWatermarkPayload,
  downloadBlob,
  formatBytes,
} from '@/lib/wm/media';
import { embedCarrier, estimateCapacity, type EmbeddedFile } from '@/lib/wm/pipeline';
import {
  CARRIER_RULES,
  WATERMARK_TYPE_LABEL,
  type WatermarkPayload,
  type WatermarkType,
} from '@/lib/wm/types';

interface EmbedTask {
  id: string;
  name: string;
  status: 'processing' | 'done' | 'error';
  progress: number;
  message?: string;
  output?: EmbeddedFile;
}

const ACCEPT = 'image/*,audio/*,video/*';

export default function EmbedPage() {
  const [files, setFiles] = useState<DroppedFile[]>([]);
  const [wmType, setWmType] = useState<WatermarkType>('text');
  const [wmText, setWmText] = useState('');
  const [wmFile, setWmFile] = useState<File | null>(null);
  const [strength, setStrength] = useState(5);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [tasks, setTasks] = useState<EmbedTask[]>([]);
  const [capacity, setCapacity] = useState<number | null>(null);
  const wmFileRef = useRef<HTMLInputElement>(null);

  // 依据已上传载体计算允许的水印类型（取交集）
  const allowedTypes = useMemo(() => {
    const carriers = files.map((f) => f.carrier).filter((c): c is NonNullable<typeof c> => !!c);
    if (carriers.length === 0) return ['text', 'image', 'audio', 'video'] as WatermarkType[];
    let allowed = CARRIER_RULES[carriers[0]];
    for (const c of carriers.slice(1)) {
      allowed = allowed.filter((t) => CARRIER_RULES[c].includes(t));
    }
    return allowed;
  }, [files]);

  useEffect(() => {
    if (!allowedTypes.includes(wmType)) setWmType(allowedTypes[0] ?? 'text');
  }, [allowedTypes, wmType]);

  // 估算最小容量
  useEffect(() => {
    let cancelled = false;
    const valid = files.filter((f) => f.carrier);
    if (valid.length === 0) {
      setCapacity(null);
      return;
    }
    (async () => {
      try {
        let min = Infinity;
        for (const f of valid) {
          const c = await estimateCapacity(f.file, f.carrier as NonNullable<typeof f.carrier>);
          min = Math.min(min, c);
        }
        if (!cancelled) setCapacity(min === Infinity ? null : min);
      } catch {
        if (!cancelled) setCapacity(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [files]);

  const run = async () => {
    const valid = files.filter((f) => f.carrier !== null);
    if (valid.length === 0) {
      toast.error('请先上传有效的载体文件');
      return;
    }
    let payload: WatermarkPayload;
    try {
      payload = await buildWatermarkPayload(wmType, { text: wmText, file: wmFile ?? undefined });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '水印内容无效');
      return;
    }
    setBusy(true);
    setTasks(valid.map((f) => ({ id: f.id, name: f.file.name, status: 'processing', progress: 0 })));
    const opts = { strength, key: key.trim() || undefined };
    for (const f of valid) {
      try {
        const out = await embedCarrier(f.file, f.carrier as NonNullable<typeof f.carrier>, payload, opts, (r) => {
          setTasks((prev) => prev.map((t) => (t.id === f.id ? { ...t, progress: r } : t)));
        });
        setTasks((prev) =>
          prev.map((t) => (t.id === f.id ? { ...t, status: 'done', progress: 1, output: out } : t)),
        );
      } catch (e) {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === f.id
              ? { ...t, status: 'error', message: e instanceof Error ? e.message : '嵌入失败' }
              : t,
          ),
        );
      }
    }
    setBusy(false);
    toast.success('批量嵌入处理完成');
  };

  const downloadAll = () => {
    const outs = tasks.filter((t) => t.output);
    outs.forEach((t, i) => {
      setTimeout(() => t.output && downloadBlob(t.output.blob, t.output.name), i * 350);
    });
    toast.success(`开始下载 ${outs.length} 个文件`);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <p className="bp-typing text-xs text-muted-foreground">
        FIG 1.0 // 在图片、音频、视频载体中嵌入文字 / 图片 / 音频 / 视频水印
      </p>

      <Card className="bp-bracket rounded-none border-border bg-card">
        <CardHeader>
          <CardTitle className="text-sm tracking-wider">
            STEP 1 // 上传载体文件
            {capacity !== null && (
              <span className="ml-3 text-xs font-normal text-muted-foreground">
                当前最小容量约 {formatBytes(capacity)}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FileDrop files={files} onChange={setFiles} accept={ACCEPT} disabled={busy} />
        </CardContent>
      </Card>

      <Card className="bp-bracket rounded-none border-border bg-card">
        <CardHeader>
          <CardTitle className="text-sm tracking-wider">STEP 2 // 设置水印内容</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={wmType} onValueChange={(v) => setWmType(v as WatermarkType)}>
            <TabsList className="rounded-none">
              {(['text', 'image', 'audio', 'video'] as WatermarkType[]).map((t) => (
                <TabsTrigger key={t} value={t} disabled={busy || !allowedTypes.includes(t)}>
                  {WATERMARK_TYPE_LABEL[t]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {wmType === 'text' ? (
            <Input
              value={wmText}
              onChange={(e) => setWmText(e.target.value)}
              disabled={busy}
              placeholder="输入要嵌入的文字，例如：版权所有 © 2026"
              className="px-2"
            />
          ) : (
            <div className="flex items-center gap-3">
              <Button variant="secondary" disabled={busy} onClick={() => wmFileRef.current?.click()}>
                选择{WATERMARK_TYPE_LABEL[wmType]}水印文件
              </Button>
              <span className="truncate text-sm text-muted-foreground">
                {wmFile ? `${wmFile.name}（${formatBytes(wmFile.size)}）` : '未选择文件'}
              </span>
              <input
                ref={wmFileRef}
                type="file"
                className="hidden"
                accept={wmType === 'image' ? 'image/*' : wmType === 'audio' ? 'audio/*' : 'video/*'}
                onChange={(e) => setWmFile(e.target.files?.[0] ?? null)}
              />
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            匹配规则：图片载体 ← 文字/图片；音频载体 ← 文字/音频；视频载体 ← 全部类型。
            图片水印将被缩放至 40px 内，音视频水印受载体容量限制。
          </p>
        </CardContent>
      </Card>

      <Card className="bp-bracket rounded-none border-border bg-card">
        <CardHeader>
          <CardTitle className="text-sm tracking-wider">STEP 3 // 嵌入参数</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <StrengthSlider value={strength} onChange={setStrength} disabled={busy} />
          <KeyInput value={key} onChange={setKey} disabled={busy} mode="encrypt" />
          <Button onClick={run} disabled={busy} className="w-full md:w-auto">
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
            {busy ? '嵌入处理中…' : `开始嵌入（${files.filter((f) => f.carrier).length} 个文件）`}
          </Button>
        </CardContent>
      </Card>

      {tasks.length > 0 && (
        <Card className="bp-bracket rounded-none border-border bg-card">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="min-w-0 flex-1 truncate text-sm tracking-wider">
                OUTPUT // 嵌入结果
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                disabled={!tasks.some((t) => t.output)}
                onClick={downloadAll}
              >
                <Download className="mr-2 h-4 w-4" />
                批量下载全部
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {tasks.map((t) => (
              <div key={t.id} className="space-y-2 border border-border p-3">
                <div className="flex items-center gap-3">
                  <span
                    className={`h-2 w-2 shrink-0 ${
                      t.status === 'done'
                        ? 'bg-chart-5'
                        : t.status === 'error'
                          ? 'bg-destructive'
                          : 'bg-primary'
                    }`}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">{t.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {t.status === 'done' ? '完成' : t.status === 'error' ? '失败' : `${Math.round(t.progress * 100)}%`}
                  </span>
                </div>
                {t.status === 'processing' && <Progress value={t.progress * 100} className="h-1.5 rounded-none" />}
                {t.status === 'error' && <p className="text-xs text-destructive">{t.message}</p>}
                {t.output && (
                  <div className="space-y-2">
                    <CarrierPreview blob={t.output.blob} type={t.output.carrier} />
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        {t.output.name} // {formatBytes(t.output.blob.size)}
                      </span>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => t.output && downloadBlob(t.output.blob, t.output.name)}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        下载
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
