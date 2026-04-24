import { Link } from 'react-router-dom';

export default function Settings() {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="p-8 space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
          <p className="text-gray-500 mt-1 text-sm">
            Product scope and integration notes for this web dashboard.
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-4 text-sm text-gray-700">
          <h2 className="font-semibold text-gray-900 text-base">Web scope</h2>
          <p>
            This admin UI covers the <strong>web platform</strong> slice of the Emergency Response brief (incidents,
            analytics, reports). <strong>Mobile apps are not part of this repository.</strong>
          </p>
          <p>
            <strong>Field operations</strong> (QR validation, SAP PM-style equipment data, defects) live under{' '}
            <Link to="/equipment" className="text-primary font-medium hover:underline">
              Equipment
            </Link>{' '}
            and related API routes — see your SAP milestone document.
          </p>
          <p className="text-gray-600">
            Authoritative scope notes for contributors: <code className="text-xs bg-gray-100 px-1 rounded">docs/WEB_SCOPE.md</code>
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm space-y-3 text-sm">
          <h2 className="font-semibold text-gray-900 text-base">Authentication</h2>
          <p className="text-gray-600">
            The login screen uses a <strong>demo</strong> account. Production should use Keycloak (or equivalent) JWT
            validation on the API — configure <code className="text-xs bg-gray-100 px-1 rounded">SKIP_AUTH</code> and
            Keycloak env vars on the server.
          </p>
        </div>
      </div>
    </div>
  );
}
