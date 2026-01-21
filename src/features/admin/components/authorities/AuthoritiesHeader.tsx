import Link from 'next/link';
import { Plus, Database, MapPin, Wrench } from 'lucide-react';

interface AuthoritiesHeaderProps {
  onSeed: () => void;
  onReSeed: () => void;
  onInitializeSchema: () => void;
  onRepairTelAviv: () => void;
  seeding: boolean;
  reSeeding: boolean;
  repairing: boolean;
  loading: boolean;
}

export default function AuthoritiesHeader({
  onSeed,
  onReSeed,
  onInitializeSchema,
  onRepairTelAviv,
  seeding,
  reSeeding,
  repairing,
  loading,
}: AuthoritiesHeaderProps) {
  return (
    <div className="flex items-center justify-between bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
      <div>
        <h1 className="text-3xl font-black text-gray-900">ניהול רשויות</h1>
        <p className="text-gray-500 mt-2">צור וערוך רשויות וערים - מועצות אזוריות ומקומיות</p>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={onReSeed}
          disabled={reSeeding || loading}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          title="מחק הכל וטען מחדש - יוצר מבנה היררכי תקין עם parentAuthorityId"
        >
          <MapPin size={18} />
          {reSeeding ? 'מטען מחדש...' : 'מחק וטען מחדש'}
        </button>
        <button
          onClick={onSeed}
          disabled={seeding || loading}
          className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-xl font-bold hover:bg-green-600 transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          title="טען רשימת רשויות אוטומטית - יוצר 40+ רשויות ישראליות עם קואורדינטות"
        >
          <MapPin size={18} />
          {seeding ? 'טוען...' : 'טען רשימת רשויות'}
        </button>
        <button
          onClick={onInitializeSchema}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-xl font-bold hover:bg-purple-600 transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          title="אתחל סכמה - יוצר מסמך דמה עם כל השדות הנדרשים"
        >
          <Database size={18} />
          אתחל סכמה
        </button>
        <button
          onClick={onRepairTelAviv}
          disabled={repairing || loading}
          className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-xl font-bold hover:bg-orange-600 transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          title="תקן רשויות כפולות של תל אביב-יפו - מגדיר אחת כהורה והשאר כשכונות"
        >
          <Wrench size={18} />
          {repairing ? 'מתקן...' : 'תקן תל אביב כפולות'}
        </button>
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
