import { NavLink, useNavigate } from 'react-router-dom';
import {
  HiOutlineSquares2X2,
  HiOutlineSun,
  HiOutlineChartBar,
  HiOutlineDocumentText,
  HiOutlineCog6Tooth,
  HiOutlineArrowRightOnRectangle,
  HiOutlineQrCode,
} from 'react-icons/hi2';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { to: '/', icon: HiOutlineSquares2X2, label: 'Dashboard' },
  { to: '/equipment', icon: HiOutlineQrCode, label: 'Equipment' },
  { to: '/incidents', icon: HiOutlineSun, label: 'Incidents' },
  { to: '/analytics', icon: HiOutlineChartBar, label: 'Analytics' },
  { to: '/reports', icon: HiOutlineDocumentText, label: 'Reports' },
  { to: '/settings', icon: HiOutlineCog6Tooth, label: 'Settings' },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <aside className="w-64 min-h-screen bg-gray-100 flex flex-col shrink-0">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-white text-xl" aria-hidden>🖐</span>
          </div>
          <div>
            <div className="font-semibold text-gray-900 leading-tight">Emergency Response</div>
            <div className="font-semibold text-gray-900 leading-tight">System</div>
          </div>
        </div>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary-light text-primary'
                  : 'text-gray-600 hover:bg-gray-200 hover:text-gray-900'
              }`
            }
          >
            <Icon className="w-5 h-5" />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <div className="font-medium text-gray-900 text-sm">{user?.name ?? 'Admin'}</div>
            <div className="text-xs text-gray-500">{user?.role ?? 'Admin'}</div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
            aria-label="Logout"
          >
            <HiOutlineArrowRightOnRectangle className="w-5 h-5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
