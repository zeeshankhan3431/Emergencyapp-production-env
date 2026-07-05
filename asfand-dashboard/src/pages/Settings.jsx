import { useState, useEffect } from 'react';
import {
  HiOutlineUser,
  HiOutlineCheckCircle,
  HiOutlineXCircle,
  HiOutlineBell,
  HiOutlineShieldCheck,
} from 'react-icons/hi2';
import { useAuth } from '../context/AuthContext';
import { getHealth } from '../lib/api';

export default function Settings() {
  const { user } = useAuth();
  const [apiStatus, setApiStatus] = useState('checking'); // 'checking' | 'ok' | 'error'
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        await getHealth();
        if (!cancelled) setApiStatus('ok');
      } catch {
        if (!cancelled) setApiStatus('error');
      }
    };
    check();
    const t = setInterval(check, 30000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="p-8 space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
          <p className="text-gray-500 mt-1 text-sm">
            Manage your account and dashboard preferences.
          </p>
        </div>

        {/* Account */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <HiOutlineUser className="w-5 h-5 text-gray-400" />
            <h2 className="font-semibold text-gray-900 text-base">Account</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500 text-xs font-medium uppercase tracking-wide mb-1">Email</p>
              <p className="text-gray-800 font-medium">{user?.email ?? '—'}</p>
            </div>
            <div>
              <p className="text-gray-500 text-xs font-medium uppercase tracking-wide mb-1">Role</p>
              <p className="text-gray-800 font-medium capitalize">{user?.role ?? '—'}</p>
            </div>
          </div>
        </div>

        {/* API Status */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-3">
          <div className="flex items-center gap-3">
            <HiOutlineShieldCheck className="w-5 h-5 text-gray-400" />
            <h2 className="font-semibold text-gray-900 text-base">API Status</h2>
          </div>
          <div className="flex items-center gap-2 text-sm">
            {apiStatus === 'checking' && (
              <span className="text-gray-400">Checking…</span>
            )}
            {apiStatus === 'ok' && (
              <>
                <HiOutlineCheckCircle className="w-5 h-5 text-green-500" />
                <span className="text-green-700 font-medium">API is reachable and healthy</span>
              </>
            )}
            {apiStatus === 'error' && (
              <>
                <HiOutlineXCircle className="w-5 h-5 text-red-500" />
                <span className="text-red-700 font-medium">API unreachable — check backend connectivity</span>
              </>
            )}
          </div>
        </div>

        {/* Notification Preferences */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <HiOutlineBell className="w-5 h-5 text-gray-400" />
            <h2 className="font-semibold text-gray-900 text-base">Notification Preferences</h2>
          </div>
          <div className="space-y-3">
            {[
              { label: 'Auto-refresh dashboard data', value: autoRefresh, onChange: setAutoRefresh },
            ].map(({ label, value, onChange }) => (
              <div key={label} className="flex items-center justify-between text-sm">
                <span className="text-gray-700">{label}</span>
                <button
                  type="button"
                  onClick={() => onChange(!value)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    value ? 'bg-primary' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      value ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
