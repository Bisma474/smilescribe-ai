'use client';
import ProtectedRoute from '@/components/features/auth/ProtectedRoute';
import AppShell from '@/components/layout/AppShell';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <AppShell>{children}</AppShell>
    </ProtectedRoute>
  );
}
