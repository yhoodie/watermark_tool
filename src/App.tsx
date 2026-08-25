import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import IntersectObserver from '@/components/common/IntersectObserver';
import { Toaster } from '@/components/ui/sonner';
import AppLayout from '@/components/layouts/AppLayout';
import EmbedPage from '@/pages/EmbedPage';
import ExtractPage from '@/pages/ExtractPage';
import AttackPage from '@/pages/AttackPage';

const App: React.FC = () => {
  return (
    <Router>
      <IntersectObserver />
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/embed" replace />} />
          <Route path="/embed" element={<EmbedPage />} />
          <Route path="/extract" element={<ExtractPage />} />
          <Route path="/attack" element={<AttackPage />} />
          <Route path="*" element={<Navigate to="/embed" replace />} />
        </Route>
      </Routes>
      <Toaster />
    </Router>
  );
};

export default App;
