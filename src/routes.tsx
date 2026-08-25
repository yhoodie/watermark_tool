import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import AppLayout from '@/components/layouts/AppLayout';
import EmbedPage from '@/pages/EmbedPage';
import ExtractPage from '@/pages/ExtractPage';
import AttackPage from '@/pages/AttackPage';

export interface RouteConfig {
  name: string;
  path: string;
  element: ReactNode;
  visible?: boolean;
  public?: boolean;
}

export const routes: RouteConfig[] = [
  {
    name: 'Layout',
    path: '/',
    element: <AppLayout />,
    public: true,
  },
];

export const childRoutes = [
  { path: '/', element: <Navigate to="/embed" replace /> },
  { path: '/embed', element: <EmbedPage /> },
  { path: '/extract', element: <ExtractPage /> },
  { path: '/attack', element: <AttackPage /> },
];
