import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Crosshair, FileSearch, Layers, Menu, ShieldAlert } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';

const NAV_ITEMS = [
  { path: '/embed', label: '水印嵌入', fig: 'FIG 1.0', icon: Layers },
  { path: '/extract', label: '水印提取', fig: 'FIG 2.0', icon: FileSearch },
  { path: '/attack', label: '攻击模拟', fig: 'FIG 3.0', icon: ShieldAlert },
];

const PAGE_TITLE: Record<string, string> = {
  '/embed': '水印嵌入 // EMBED MODULE',
  '/extract': '水印提取 // EXTRACT MODULE',
  '/attack': '攻击模拟 // ATTACK SIMULATION',
};

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-2 px-4">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          onClick={onNavigate}
          className={({ isActive }) =>
            `group flex min-h-12 items-center gap-3 border px-3 transition-none ${
              isActive
                ? 'border-primary bg-sidebar-accent text-primary'
                : 'border-transparent text-sidebar-foreground hover:border-sidebar-border hover:bg-sidebar-accent'
            }`
          }
        >
          <item.icon className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-sm font-medium">{item.label}</span>
          <span className="text-[10px] text-muted-foreground">{item.fig}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export default function AppLayout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const title = PAGE_TITLE[location.pathname] ?? '数字水印系统';

  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* 桌面侧边栏 */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
        <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-4">
          <Crosshair className="h-5 w-5 text-primary" />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold tracking-wider">WM-LAB 水印实验室</div>
            <div className="text-[10px] text-muted-foreground">DIGITAL WATERMARK SYSTEM</div>
          </div>
        </div>
        <div className="py-4">
          <div className="px-4 pb-2 text-[10px] tracking-widest text-muted-foreground">
            MODULE INDEX // 模块索引
          </div>
          <NavList />
        </div>
        <div className="mt-auto border-t border-sidebar-border p-4 text-[10px] leading-relaxed text-muted-foreground">
          <div>SCALE 1:100 // DCT-SPREAD-SPECTRUM</div>
          <div>REV 2026.08 // 纯前端本地处理</div>
          <div className="bp-cursor mt-1 text-primary">READY</div>
        </div>
      </aside>

      {/* 主内容列 */}
      <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border bg-card px-4 md:px-6">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label="打开菜单"
                className="flex h-10 w-10 items-center justify-center border border-border text-foreground md:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 bg-sidebar p-0">
              <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-4">
                <Crosshair className="h-5 w-5 text-primary" />
                <span className="text-sm font-semibold tracking-wider">WM-LAB 水印实验室</span>
              </div>
              <div className="py-4">
                <NavList onNavigate={() => setOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold tracking-wider md:text-base">{title}</h1>
            <div className="hidden text-[10px] text-muted-foreground md:block">
              CARRIER: IMAGE / AUDIO / VIDEO // PAYLOAD: TEXT / IMAGE / AUDIO / VIDEO
            </div>
          </div>
          <div className="hidden shrink-0 items-center gap-4 text-[10px] text-muted-foreground md:flex">
            <span>X:0800 Y:0600</span>
            <span className="border border-border px-2 py-1">GRID 24PX</span>
          </div>
        </header>
        <main className="blueprint-grid min-w-0 flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
