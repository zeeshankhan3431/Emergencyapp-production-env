import { HiOutlineMagnifyingGlass, HiOutlineBellAlert, HiOutlineQuestionMarkCircle } from 'react-icons/hi2';

export default function Header() {
  return (
    <header className="flex items-center justify-between py-6 px-8 border-b border-gray-200 bg-white">
      <h1 className="text-2xl font-bold text-gray-900">Overview</h1>
      <div className="flex items-center gap-4">
        <div className="relative">
          <HiOutlineMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="search"
            placeholder="Search incidents, IDs..."
            className="w-80 pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>
        <button
          type="button"
          className="relative p-2.5 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          aria-label="Notifications"
        >
          <HiOutlineBellAlert className="w-5 h-5" />
          <span className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full" />
        </button>
        <button
          type="button"
          className="p-2.5 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          aria-label="Help"
        >
          <HiOutlineQuestionMarkCircle className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}
