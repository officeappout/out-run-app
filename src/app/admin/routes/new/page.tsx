'use client';

export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import RouteEditor from '@/features/admin/components/routes/RouteEditor';

/**
 * Super-admin manual route builder.
 * Routes are saved with status:'published' and published:true immediately.
 * Authority can be freely chosen from the dropdown.
 */
export default function RouteBuilderPage() {
    return (
        <div className="h-screen flex flex-col">
            {/* Back nav */}
            <div className="bg-white border-b border-gray-100 px-6 py-2 flex items-center gap-2 z-30 shrink-0">
                <Link
                    href="/admin/routes"
                    className="flex items-center gap-1 text-gray-400 hover:text-gray-600 transition-colors text-sm font-bold"
                >
                    <ArrowRight size={16} />
                    חזור לניהול מסלולים
                </Link>
            </div>

            <div className="flex-1 overflow-hidden">
                <RouteEditor
                    defaultStatus="published"
                    redirectPath="/admin/routes"
                />
            </div>
        </div>
    );
}
