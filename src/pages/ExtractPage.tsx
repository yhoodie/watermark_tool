import { useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import FileDrop, { type DroppedFile } from '@/components/wm/FileDrop';
import { KeyInput } from '@/components/wm/controls';
import PayloadView from '@/components/wm/PayloadView';
import { extractCarrier } from '@/lib/wm/pipeline';
import type { ExtractOutcome } from '@/lib/wm/types';

interface ExtractTask {
  id: string;
  name: string;
  status: 'processing' | 'done' | 'error';
  progress: number;
  outcome?: ExtractOutcome;
}

const ACCEPT = 'image/*,audio/*,video/*';

export default function ExtractPage() {
  const [files, setFiles] = useState<DroppedFile[]>([]);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [tasks, setTasks] = useState<ExtractTask[]>([]);

  const run = async () => {
    const valid = files.filter((f) => f.carrier !== null);
    if (valid.length === 0) {
      toast.error('请先上传待提取的文件');
      return;
    }
    setBusy(true);
    setTasks(valid.map((f) => ({ id: f.id, name: f.file.name, status: 'processing', progress: 0 })));
    const k = key.trim() || undefined;
    for (const f of valid) {
      const outcome = await extractCarrier(
        f.file,
        f.carrier as NonNullable<typeof f.carrier>,
        k,
        (r) => setTasks((prev) => prev.map((t) => (t.id === f.id ? { ...t, progress: r } : t))),
      );
      setTasks((prev) =>
        prev.map((t) =>
          t.id === f.id
            ? { ...t, status: outcome.ok ? 'done' : 'error', progress: 1, outcome }
            : t,
        ),
      );
    }
    setBusy(false);
    toast.success('批量提取处理完成');
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <p className="bp-typing text-xs text-muted-foreground">
        FIG 2.0 // 从已嵌入水印的图片、音频、视频中盲提取水印内容
      </p>

      <Card className="bp-bracket rounded-none border-border bg-card">
        <CardHeader>
          <CardTitle className="text-sm tracking-wider">STEP 1 // 上传含水印文件</CardTitle>
        </CardHeader>
        <CardContent>
          <FileDrop
            files={files}
            onChange={setFiles}
            accept={ACCEPT}
            disabled={busy}
            hint="支持嵌入模块输出的 PNG / WAV / WebM 及其他常见格式"
          />
        </CardContent>
      </Card>

      <Card className="bp-bracket rounded-none border-border bg-card">
        <CardHeader>
          <CardTitle className="text-sm tracking-wider">STEP 2 // 解密参数</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <KeyInput value={key} onChange={setKey} disabled={busy} mode="decrypt" />
          <Button onClick={run} disabled={busy} className="w-full md:w-auto">
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
            {busy ? '提取中…' : `开始提取（${files.filter((f) => f.carrier).length} 个文件）`}
          </Button>
        </CardContent>
      </Card>

      {tasks.length > 0 && (
        <Card className="bp-bracket rounded-none border-border bg-card">
          <CardHeader>
            <CardTitle className="text-sm tracking-wider">RESULT // 提取结果</CardTitle>
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
                    {t.status === 'done'
                      ? '成功'
                      : t.status === 'error'
                        ? '失败'
                        : `${Math.round(t.progress * 100)}%`}
                  </span>
                </div>
                {t.status === 'processing' && (
                  <Progress value={t.progress * 100} className="h-1.5 rounded-none" />
                )}
                {t.outcome?.ok && t.outcome.payload && (
                  <PayloadView payload={t.outcome.payload} encrypted={t.outcome.encrypted} />
                )}
                {t.outcome && !t.outcome.ok && (
                  <p className="text-xs text-destructive">{t.outcome.message}</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
