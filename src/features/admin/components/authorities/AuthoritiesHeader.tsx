import Link from 'next/link';
import { Plus } from 'lucide-react';

export default function AuthoritiesHeader() {
  return (
    <div className="flex items-center justify-between bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
      <div>
        <h1 className="text-3xl font-black text-gray-900">ניהול רשויות</h1>
        <p className="text-gray-500 mt-2">צור וערוך רשויות וערים - מועצות אזוריות ומקומיות</p>
      </div>
      <div className="flex items-center gap-3">
        <Link
          href="/admin/authorities/new"
          className="flex items-center gap-2 px-6 py-3 bg-cyan-500 text-white rounded-xl font-bold hover:bg-cyan-600 transition-colors shadow-lg"
        >
          <Plus size={20} />
          רשות חדשה
        </Link>
      </div>
    </div>
  );
}
