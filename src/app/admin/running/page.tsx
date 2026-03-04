'use client';

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { Footprints, Activity, Dumbbell, GitMerge } from 'lucide-react';

const cards = [
  {
    title: 'מפת קצבים',
    description: 'ערוך את טבלאות האחוזים לכל 4 סוגי הרצים',
    href: '/admin/running/pace-map',
    icon: Activity,
  },
  {
    title: 'תבניות אימונים',
    description: 'בנה אימוני ריצה עם בלוקים ואזורי קצב',
    href: '/admin/running/workouts',
    icon: Dumbbell,
  },
  {
    title: 'תוכניות והתקדמות',
    description: 'הגדר תוכניות ריצה וחוקי התקדמות',
    href: '/admin/running/programs',
    icon: GitMerge,
  },
];

export default function RunningAdminPage() {
  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-3xl font-black text-gray-900">מנוע ריצה</h1>
        <p className="text-gray-500 mt-2">ניהול מפת קצבים, תבניות אימונים ותוכניות ריצה</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="group relative overflow-hidden rounded-2xl p-6 bg-white border border-gray-200 shadow-sm hover:shadow-lg hover:border-cyan-200 transition-all"
          >
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-xl bg-cyan-100 text-cyan-600 group-hover:bg-cyan-500 group-hover:text-white transition-colors">
                <card.icon size={24} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">{card.title}</h3>
                <p className="text-sm text-gray-500 mt-1">{card.description}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
