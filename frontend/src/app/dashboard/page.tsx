'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { patientsApi, type DashboardStats, type RecentSession } from '@/lib/apiClient';
import { useAuth } from '@/store/AuthContext';

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function statusBadge(status: string): { text: string; className: string } {
  switch (status) {
    case 'complete':
      return { text: '✓ Complete', className: 'badge-teal' };
    case 'processing':
      return { text: '⬤ Processing', className: 'badge-warn' };
    case 'error':
      return { text: '⚠ Error', className: 'badge-gray' };
    default:
      return { text: status, className: 'badge-gray' };
  }
}

function handleSessionClick(router: ReturnType<typeof useRouter>, s: RecentSession) {
  if (s.status === 'processing') {
    router.push(`/dashboard/processing?patientId=${s.patient_id}`);
  } else {
    router.push(`/dashboard/chart?patientId=${s.patient_id}`);
  }
}

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuth();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await patientsApi.dashboardStats();
        setStats(data);
      } catch (err) {
        console.error('Failed to load dashboard stats:', err);
        setError(err instanceof Error ? err.message : 'Failed to load dashboard data.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const firstName = user?.full_name?.split(' ')[0] || 'Doctor';

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Good morning, Dr. {firstName}</div>
        <div className="page-sub">
          {stats ? `${stats.active_patients} active patient${stats.active_patients === 1 ? '' : 's'}` : 'Loading your practice overview...'}
        </div>
      </div>

      {error && (
        <div style={{
          background: 'rgba(27,58,107,0.06)',
          border: '1px solid var(--border)',
          color: 'var(--navy)',
          padding: '10px 16px',
          borderRadius: '8px',
          marginBottom: '16px',
          fontSize: '12.5px'
        }}>
          💡 {error}
        </div>
      )}

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-val">{loading ? '—' : stats?.today_visits ?? 0}</div>
          <div className="stat-lbl">Today&apos;s Visits</div>
        </div>
        <div className="stat-card">
          <div className="stat-val warn">{loading ? '—' : stats?.pending_review ?? 0}</div>
          <div className="stat-lbl">Pending Review</div>
          <div className="stat-trend"><span className="text-muted">Needs attention</span></div>
        </div>
        <div className="stat-card">
          <div className="stat-val teal">${loading ? '—' : stats?.revenue_suggested ?? 0}</div>
          <div className="stat-lbl">Revenue Suggested</div>
        </div>
        <div className="stat-card">
          <div className="stat-val">{loading ? '—' : stats?.active_patients ?? 0}</div>
          <div className="stat-lbl">Active Patients</div>
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr',gap:'20px'}}>
        <div>
          <div className="section-label mb-12">Recent Activity</div>
          <div style={{display:'grid',gap:'12px',gridTemplateColumns:'1fr'}}>
            {!loading && stats && stats.recent_sessions.length === 0 && (
              <div style={{fontSize:'12px',color:'var(--ink3)',fontStyle:'italic',padding:'12px 0'}}>
                No recordings yet — start one from a patient&apos;s page.
              </div>
            )}
            {stats?.recent_sessions.map((s) => {
              const badge = statusBadge(s.status);
              const initials = s.patient_name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
              return (
                <div
                  key={`${s.patient_id}-${s.created_at}`}
                  className="patient-card"
                  onClick={() => handleSessionClick(router, s)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="patient-avatar">{initials}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div className="patient-name">{s.patient_name}</div>
                    <div className="mt-4"><span className={`badge ${badge.className}`}>{badge.text}</span></div>
                  </div>
                  <div className="patient-time">
                    <div className="mt-4 text-muted" style={{fontSize:'10px'}}>{timeAgo(s.created_at)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {!loading && stats && (stats.pending_review > 0 || stats.revenue_suggested > 0) && (
          <div>
            <div className="section-label mb-12">Billing Summary</div>
            <div className="revenue-flag">
              <div className="revenue-label">Suggested Revenue Pending Review</div>
              <div className="revenue-amount">${stats.revenue_suggested}</div>
              <div style={{fontSize:'11px',color:'var(--ink3)',marginTop:'4px'}}>{stats.pending_review} visit{stats.pending_review === 1 ? '' : 's'} with AI-suggested CDT codes</div>
              <div className="mt-8">
                <button className="btn-sm btn-teal" onClick={() => router.push('/dashboard/billing')}>Review →</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
