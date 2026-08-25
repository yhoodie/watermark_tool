import { Eye, EyeOff, KeyRound } from 'lucide-react';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';

interface StrengthSliderProps {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}

/** 水印强度调节（1-10），含可调整阈值说明 */
export function StrengthSlider({ value, onChange, disabled }: StrengthSliderProps) {
  const level = value <= 3 ? '隐蔽' : value <= 7 ? '均衡' : '强固';
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">水印强度阈值</span>
        <span className="border border-border px-2 py-0.5 text-xs text-primary">
          {value} / 10 // {level}
        </span>
      </div>
      <Slider
        min={1}
        max={10}
        step={1}
        value={[value]}
        onValueChange={(v) => onChange(v[0])}
        disabled={disabled}
      />
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>1 隐蔽性优先（鲁棒性弱）</span>
        <span>10 鲁棒性优先（痕迹明显）</span>
      </div>
    </div>
  );
}

interface KeyInputProps {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  /** 嵌入侧为“加密”，提取侧为“解密” */
  mode: 'encrypt' | 'decrypt';
}

/** 可选密钥输入；留空则不启用加解密 */
export function KeyInput({ value, onChange, disabled, mode }: KeyInputProps) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">
          水印{mode === 'encrypt' ? '加密' : '解密'}密钥（可选）
        </span>
        {value ? (
          <span className="border border-primary px-2 py-0.5 text-[10px] text-primary">已启用加密</span>
        ) : (
          <span className="border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
            未启用
          </span>
        )}
      </div>
      <div className="relative">
        <Input
          type={show ? 'text' : 'password'}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder={
            mode === 'encrypt'
              ? '输入密钥以加密水印，留空则不加密'
              : '若水印已加密，请输入相同密钥'
          }
          className="px-2 pr-10"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label={show ? '隐藏密钥' : '显示密钥'}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        {mode === 'encrypt'
          ? '密钥同时参与水印数据加密与嵌入位置置乱（分存）。请务必妥善保存，提取时需输入相同密钥。'
          : '仅在嵌入时使用了密钥的情况下需要输入。密钥错误将无法通过完整性校验。'}
      </p>
    </div>
  );
}
