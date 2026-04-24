import { useState } from 'react';
import { HiOutlineArrowDownTray } from 'react-icons/hi2';
import { getIncidents } from '../lib/api';

function toCsv(rows) {
  const headers = ['id', 'type', 'location', 'status', 'openedAt'];
  const lines = [headers.join(',')];
  for (const r of rows) {
    const vals = headers.map((h) => {
      const v = r[h] ?? '';
      const s = String(v);
      if (s.includes(',') || s.includes('"')) return `"${s.replace(/"/g, '""')}"`;
      return s;
    });
    lines.push(vals.join(','));
  }
  return lines.join('\r\n');
}

export default function Reports() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function downloadIncidentsCsv() {
    setBusy(true);
    setMessage('');
    try {
      const data = await getIncidents();
      const rows = data.items ?? [];
      const csv = toCsv(rows);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `incidents-export-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage(`Exported ${rows.length} row(s).`);
    } catch (e) {
      setMessage(e.data?.message || e.message || 'Export failed. Is the API running?');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="p-8 space-y-6 max-w-5xl">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Reports</h1>
          <p className="text-gray-500 mt-1 text-sm">
            Export incident data for compliance and review. Monthly AI-generated summaries from the PDF brief can be
            wired to the same endpoint when the pipeline exists.
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
          <h2 className="font-semibold text-gray-900">Incident export</h2>
          <p className="text-sm text-gray-600">
            Download a CSV of all incidents currently returned by <code className="text-xs bg-gray-100 px-1 rounded">GET /api/incidents</code>.
          </p>
          <button
            type="button"
            onClick={downloadIncidentsCsv}
            disabled={busy}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-dark disabled:opacity-60"
          >
            <HiOutlineArrowDownTray className="w-5 h-5" />
            {busy ? 'Preparing…' : 'Download CSV'}
          </button>
          {message ? (
            <p className={`text-sm ${message.includes('failed') || message.includes('Could') ? 'text-red-600' : 'text-gray-600'}`}>
              {message}
            </p>
          ) : null}
        </div>

        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/80 p-6 text-sm text-gray-600">
          <strong className="text-gray-800">Planned (PDF Milestone 4):</strong> anonymized monthly trend PDFs, AI narrative
          summaries, and scheduled email delivery — requires backend jobs and storage.
        </div>
      </div>
    </div>
  );
}
