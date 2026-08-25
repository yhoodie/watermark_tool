import { useCallback, useRef, useState } from 'react';
import { FileAudio, FileImage, FileVideo, File as FileIcon, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatBytes } from '@/lib/wm/media';
import type { CarrierType } from '@/lib/wm/types';

export interface DroppedFile {
  id: string;
  file: File;
  carrier: CarrierType | null;
}

interface FileDropProps {
  files: DroppedFile[];
  onChange: (files: DroppedFile[]) => void;
  accept: string;
  disabled?: boolean;
  hint?: string;
}

let seq = 0;

export function carrierIcon(carrier: CarrierType | null) {
  if (carrier === 'image') return FileImage;
  if (carrier === 'audio') return FileAudio;
  if (carrier === 'video') return FileVideo;
  return FileIcon;
}

export default function FileDrop({ files, onChange, accept, disabled, hint }: FileDropProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const addFiles = useCallback(
    (list: FileList | null) => {
      if (!list) return;
      const next = [...files];
      for (const f of Array.from(list)) {
        const carrier: CarrierType | null = f.type.startsWith('image/')
          ? 'image'
          : f.type.startsWith('audio/')
            ? 'audio'
            : f.type.startsWith('video/')
              ? 'video'
            : null;
        next.push({ id: `f_${Date.now()}_${seq++}`, file: f, carrier });
      }
      onChange(next);
    },
    [files, onChange],
  );

  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          addFiles(e.dataTransfer.files);
        }}
        className={`flex w-full flex-col items-center justify-center gap-2 border border-dashed px-4 py-8 text-center transition-none ${
          dragOver ? 'border-primary bg-primary/10' : 'border-input hover:border-primary/60'
        } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
      >
        <Upload className="h-6 w-6 text-primary" />
        <div className="text-sm">点击选择或拖拽文件到此处（支持批量）</div>
        <div className="text-xs text-muted-foreground">{hint ?? '支持图片 / 音频 / 视频载体'}</div>
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept}
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = '';
        }}
      />
      {files.length > 0 && (
        <ul className="divide-y divide-border border border-border bg-card">
          {files.map((f, i) => {
            const Icon = carrierIcon(f.carrier);
            return (
              <li key={f.id} className="flex min-h-12 items-center gap-3 px-3 py-2">
                <Icon className={`h-4 w-4 shrink-0 ${f.carrier ? 'text-primary' : 'text-destructive'}`} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{f.file.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatBytes(f.file.size)}
                    {f.carrier === null && <span className="text-destructive"> // 不支持的格式</span>}
                  </div>
                </div>
                <span className="hidden text-[10px] text-muted-foreground md:block">
                  #{String(i + 1).padStart(2, '0')}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={disabled}
                  onClick={() => onChange(files.filter((x) => x.id !== f.id))}
                  aria-label="移除文件"
                >
                  <X className="h-4 w-4" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
