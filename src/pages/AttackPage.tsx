import { useMemo, useState } from 'react';
import { CheckCircle2, Download, Loader2, Swords, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import FileDrop, { type DroppedFile } from '@/components/wm/FileDrop';
import { KeyInput } from '@/components/wm/controls';
import PayloadView, { CarrierPreview } from '@/components/wm/PayloadView';
import {
  ATTACK_DEFS,
  applyAudioAttacks,
  applyImageAttacks,
  applyVideoAttacks,
  attackedImageBlob,
  type AttackId,
  type AttackParams,
} from '@/lib/wm/attacks';
import { decodeAudioFile, encodeWav, extractFromAudio } from '@/lib/wm/audio';
import { extractFromImage } from '@/lib/wm/image';
import { extractFromVideo } from '@/lib/wm/video';
import { downloadBlob, fileToImageData, formatBytes, withSuffix } from '@/lib/wm/media';
import type { WatermarkPayload } from '@/lib/wm/types';

interface AttackTask {
  id: string;
  name: string;
  carrier: 'image' | 'audio' | 'video';
  status: 'processing' | 'done' | 'error';
  progress: number;
  attacked?: Blob;
  attackedName?: string;
  robust?: boolean;
  payload?: WatermarkPayload;
  message?: string;
}

const ACCEPT = 'image/*,audio/*,video/*';
const EXT: Record<'image' | 'audio' | 'video', string> = {
  image: '.png',
  audio: '.wav',
  video: '.webm',
};

export default function AttackPage() {
  const [files, setFiles] = useState<DroppedFile[]>([]);
  const [selected, setSelected] = useState<AttackId[]>(['noise']);
  const [params, setParams] = useState<Record<AttackId, AttackParams>>(() => {
    const init = {} as Record<AttackId, AttackParams>;
    for (const def of ATTACK_DEFS) {
      init[def.id] = {};
      for (const p of def.params) init[def.id][p.key] = p.defaultValue;
    }
    return init;
  });
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [tasks, setTasks] = useState<AttackTask[]>([]);

  const carrierSet = useMemo(
    () => new Set(files.map((f) => f.carrier).filter(Boolean) as ('image' | 'audio' | 'video')[]),
    [files],
  );

  const toggle = (id: AttackId) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const run = async () => {
    const valid = files.filter((f) => f.carrier !== null);
    if (valid.length === 0) {
      toast.error('请先上传含水印文件');
      return;
    }
    if (selected.length === 0) {
      toast.error('请至少选择一种攻击方式');
      return;
    }
    const k = key.trim() || undefined;
    setBusy(true);
    setTasks(
      valid.map((f) => ({
        id: f.id,
        name: f.file.name,
        carrier: f.carrier as 'image' | 'audio' | 'video',
        status: 'processing',
        progress: 0,
      })),
    );
    for (const f of valid) {
      const carrier = f.carrier as 'image' | 'audio' | 'video';
      const applicable = selected.filter((id) => ATTACK_DEFS.find((d) => d.id === id)?.carriers.includes(carrier));
      const chain = applicable.map((id) => ({ id, params: params[id] }));
      try {
        let attacked: Blob;
        let payload: WatermarkPayload | undefined;
        let message = '水印仍可提取，通过攻击测试';
        if (carrier === 'image') {
          const img = await fileToImageData(f.file);
          const out = await applyImageAttacks(img, chain);
          attacked = await attackedImageBlob(out);
          try {
            payload = extractFromImage(out, k);
          } catch (e) {
            message = e instanceof Error ? e.message : '提取失败';
          }
        } else if (carrier === 'audio') {
          const { samples, sampleRate } = await decodeAudioFile(f.file);
          const out = applyAudioAttacks(samples, chain);
          attacked = encodeWav(out, sampleRate);
          try {
            payload = extractFromAudio(out, k);
          } catch (e) {
            message = e instanceof Error ? e.message : '提取失败';
          }
        } else {
          attacked = await applyVideoAttacks(f.file, chain, (r) => {
            setTasks((prev) => prev.map((t) => (t.id === f.id ? { ...t, progress: r * 0.7 } : t)));
          });
          try {
            payload = await extractFromVideo(attacked, k, (r) => {
              setTasks((prev) => prev.map((t) => (t.id === f.id ? { ...t, progress: 0.7 + r * 0.3 } : t)));
            });
          } catch (e) {
            message = e instanceof Error ? e.message : '提取失败';
          }
        }
        setTasks((prev) =>
          prev.map((t) =>
            t.id === f.id
              ? {
                  ...t,
                  status: 'done',
                  progress: 1,
                  attacked,
                  attackedName: withSuffix(f.file.name, '_attacked', EXT[carrier]),
                  robust: !!payload,
                  payload,
                  message,
                }
              : t,
          ),
        );
      } catch (e) {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === f.id
              ? { ...t, status: 'error', message: e instanceof Error ? e.message : '攻击处理失败' }
              : t,
          ),
        );
      }
    }
    setBusy(false);
    toast.success('攻击模拟完成');
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <p className="bp-typing text-xs text-muted-foreground">
        FIG 3.0 // 模拟格式转换、裁剪、噪声等攻击，自动验证水印鲁棒性
      </p>

      <Card className="bp-bracket rounded-none border-border bg-card">
        <CardHeader>
          <CardTitle className="text-sm tracking-wider">STEP 1 // 上传含水印文件</CardTitle>
        </CardHeader>
        <CardContent>
          <FileDrop files={files} onChange={setFiles} accept={ACCEPT} disabled={busy} />
        </CardContent>
      </Card>

      <Card className="bp-bracket rounded-none border-border bg-card">
        <CardHeader>
          <CardTitle className="text-sm tracking-wider">STEP 2 // 选择攻击方式与参数</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {ATTACK_DEFS.map((def) => {
            const usable = carrierSet.size === 0 || [...carrierSet].some((c) => def.carriers.includes(c));
            const checked = selected.includes(def.id);
            return (
              <div
                key={def.id}
                className={`border p-3 ${checked ? 'border-accent' : 'border-border'} ${usable ? '' : 'opacity-40'}`}
              >
                <label className="flex min-h-12 cursor-pointer items-start gap-3">
                  <Checkbox
                    checked={checked}
                    disabled={busy || !usable}
                    onCheckedChange={() => toggle(def.id)}
                    className="mt-1"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{def.label}</span>
                    <span className="block text-xs text-muted-foreground">
                      {def.desc} // 适用: {def.carriers.map((c) => ({ image: '图', audio: '音', video: '视' })[c]).join('/')}
                    </span>
                  </span>
                </label>
                {checked &&
                  def.params.map((p) => (
                    <div key={p.key} className="mt-3 space-y-2 pl-7">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{p.label}</span>
                        <span className="text-accent">
                          {params[def.id][p.key]}
                          {p.unit ?? ''}
                        </span>
                      </div>
                      <Slider
                        min={p.min}
                        max={p.max}
                        step={p.step}
                        value={[params[def.id][p.key]]}
                        disabled={busy}
                        onValueChange={(v) =>
                          setParams((prev) => ({
                            ...prev,
                            [def.id]: { ...prev[def.id], [p.key]: v[0] },
                          }))
                        }
                      />
                    </div>
                  ))}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card className="bp-bracket rounded-none border-border bg-card">
        <CardHeader>
          <CardTitle className="text-sm tracking-wider">STEP 3 // 执行攻击并验证</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <KeyInput value={key} onChange={setKey} disabled={busy} mode="decrypt" />
          <Button onClick={run} disabled={busy} variant="default" className="w-full bg-accent text-accent-foreground hover:bg-accent/90 md:w-auto">
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Swords className="mr-2 h-4 w-4" />}
            {busy ? '攻击执行中…' : `开始攻击（${files.filter((f) => f.carrier).length} 个文件）`}
          </Button>
          <p className="text-xs text-muted-foreground">
            攻击完成后系统将自动从受损文件中尝试提取水印：成功即判定水印对该攻击具备鲁棒性。
          </p>
        </CardContent>
      </Card>

      {tasks.length > 0 && (
        <Card className="bp-bracket rounded-none border-border bg-card">
          <CardHeader>
            <CardTitle className="text-sm tracking-wider">REPORT // 鲁棒性测试报告</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {tasks.map((t) => (
              <div key={t.id} className="space-y-3 border border-border p-3">
                <div className="flex items-center gap-3">
                  <span
                    className={`h-2 w-2 shrink-0 ${
                      t.status === 'done'
                        ? t.robust
                          ? 'bg-chart-5'
                          : 'bg-destructive'
                        : t.status === 'error'
                          ? 'bg-destructive'
                          : 'bg-primary'
                    }`}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">{t.name}</span>
                  {t.status === 'done' && (
                    <span
                      className={`flex shrink-0 items-center gap-1 border px-2 py-0.5 text-xs ${
                        t.robust ? 'border-chart-5 text-chart-5' : 'border-destructive text-destructive'
                      }`}
                    >
                      {t.robust ? (
                        <>
                          <CheckCircle2 className="h-3 w-3" /> 鲁棒 // 通过
                        </>
                      ) : (
                        <>
                          <XCircle className="h-3 w-3" /> 失效 // 未通过
                        </>
                      )}
                    </span>
                  )}
                  {t.status === 'processing' && (
                    <span className="shrink-0 text-xs text-muted-foreground">{Math.round(t.progress * 100)}%</span>
                  )}
                </div>
                {t.status === 'processing' && <Progress value={t.progress * 100} className="h-1.5 rounded-none" />}
                {t.status === 'error' && <p className="text-xs text-destructive">{t.message}</p>}
                {t.status === 'done' && t.attacked && (
                  <>
                    <CarrierPreview blob={t.attacked} type={t.carrier} />
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        {t.attackedName} // {formatBytes(t.attacked.size)} // {t.message}
                      </span>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => t.attacked && t.attackedName && downloadBlob(t.attacked, t.attackedName)}
                      >
                        <Download className="mr-2 h-4 w-4" />
                        下载攻击后文件
                      </Button>
                    </div>
                    {t.payload && <PayloadView payload={t.payload} />}
                  </>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
