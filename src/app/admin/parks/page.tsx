'use client';

// Force dynamic rendering to prevent SSR issues with window/localStorage
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { deleteDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Park } from '@/features/parks';
import { Plus, Trash2, Edit, MapPin, Sun, Lightbulb, Droplet, Toilet, Building2, AlertCircle } from 'lucide-react';
import { getAllParks, getParksByAuthority } from '@/features/parks';
import { checkUserRole, isOnlyAuthorityManager } from '@/features/admin/services/auth.service';
import { getAllAuthorities } from '@/features/admin/services/authority.service';
import { remapParksToAuthorities } from '@/features/admin/services/remap-parks-to-authorities';
import { Authority } from '@/types/admin-types';
import { RefreshCw } from 'lucide-react';
import { safeRenderText } from '@/utils/render-helpers';

export default function ParksListPage() {
    const [parks, setParks] = useState<Park[]>([]);
    const [authorities, setAuthorities] = useState<Authority[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAuthorityManagerOnly, setIsAuthorityManagerOnly] = useState(false);
    const [userAuthorityIds, setUserAuthorityIds] = useState<string[]>([]);
    const [remapping, setRemapping] = useState(false);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                try {
                    const roleInfo = await checkUserRole(user.uid);
                    const isOnly = await isOnlyAuthorityManager(user.uid);
                    setIsAuthorityManagerOnly(isOnly);
                    setUserAuthorityIds(roleInfo.authorityIds || []);
                    fetchParks(isOnly, roleInfo.authorityIds || []);
                } catch (error) {
                    console.error('Error checking user role:', error);
                    fetchParks(false, []);
                }
            } else {
                setLoading(false);
            }
        });
        return () => unsubscribe();
    }, []);

    const fetchParks = async (filterByAuthority: boolean = false, authorityIds: string[] = []) => {
        try {
            setLoading(true);
            let fetchedParks: Park[] = [];
            
            // Load authorities for display
            const allAuthorities = await getAllAuthorities();
            setAuthorities(allAuthorities);
            
            if (filterByAuthority && authorityIds.length > 0) {
                // For authority_manager: fetch parks for each of their authorities
                const parksPromises = authorityIds.map(authId => getParksByAuthority(authId));
                const parksArrays = await Promise.all(parksPromises);
                fetchedParks = parksArrays.flat();
                
                // Remove duplicates (in case user manages multiple authorities with overlapping parks)
                const uniqueParks = new Map<string, Park>();
                fetchedParks.forEach(park => {
                    if (!uniqueParks.has(park.id)) {
                        uniqueParks.set(park.id, park);
                    }
                });
                fetchedParks = Array.from(uniqueParks.values());
            } else {
                // For super_admin and system_admin: fetch all parks
                fetchedParks = await getAllParks();
            }
            
            setParks(fetchedParks);
        } catch (error) {
            console.error("Error fetching parks:", error);
        } finally {
            setLoading(false);
        }
    };

    // Helper to get authority name by ID
    const getAuthorityName = (authorityId?: string): string | null => {
        if (!authorityId) return null;
        const authority = authorities.find(a => a.id === authorityId);
        if (!authority) return null;
        // CRITICAL: Sanitize name to prevent Error #31
        const name = authority.name;
        if (typeof name === 'string') return name;
        if (typeof name === 'object' && name !== null) {
            return name.he || name.en || String(name);
        }
        return String(name || '');
    };

    const handleDelete = async (id: string) => {
        if (!confirm('האם אתה בטוח שברצונך למחוק פארק זה?')) return;

        try {
            await deleteDoc(doc(db, 'parks', id));
            setParks(prev => prev.filter(park => park.id !== id));
        } catch (error) {
            console.error("Error deleting park:", error);
            alert('שגיאה במחיקת הפארק');
        }
    };

    const handleRemapParks = async () => {
        if (!confirm('פעולה זו תסרוק את כל הפארקים ותקשר אותם לרשויות לפי שם העיר. האם להמשיך?')) return;

        try {
            setRemapping(true);
            const result = await remapParksToAuthorities();
            
            let message = `המיפוי הושלם!\n`;
            message += `✓ עודכנו: ${result.updated} פארקים\n`;
            message += `⊘ דולגו: ${result.skipped} פארקים (כבר משויכים או ללא התאמה)\n`;
            if (result.unmatched.length > 0) {
                message += `⚠ לא נמצאו: ${result.unmatched.length} פארקים\n\n`;
                message += `פארקים ללא התאמה:\n`;
                result.unmatched.slice(0, 10).forEach(p => {
                    message += `- ${p.parkName} (${p.city})\n`;
                });
                if (result.unmatched.length > 10) {
                    message += `... ועוד ${result.unmatched.length - 10}`;
                }
            }
            if (result.errors > 0) {
                message += `\n✗ שגיאות: ${result.errors}`;
            }
            
            alert(message);
            
            // Refresh parks list
            if (!isAuthorityManagerOnly) {
                const fetchedParks = await getAllParks();
                setParks(fetchedParks);
            }
        } catch (error) {
            console.error('Error remapping parks:', error);
            alert('שגיאה במיפוי פארקים');
        } finally {
            setRemapping(false);
        }
    };

    if (loading) {
        return <div className="p-8 text-center text-gray-500">טוען נתונים...</div>;
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <div>
                    <h1 className="text-2xl font-black text-gray-900">ניהול פארקים</h1>
                    <p className="text-sm text-gray-500 mt-1">רשימת כל הפארקים במערכת</p>
                </div>

                <div className="flex items-center gap-3">
                    {!isAuthorityManagerOnly && (
                        <button
                            onClick={handleRemapParks}
                            disabled={remapping}
                            className="flex items-center gap-2 bg-cyan-600 text-white px-5 py-3 rounded-xl font-bold shadow-lg hover:bg-cyan-700 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <RefreshCw size={20} className={remapping ? 'animate-spin' : ''} />
                            <span>{remapping ? 'ממפה...' : 'מפה פארקים לרשויות'}</span>
                        </button>
                    )}
                    <Link
                        href="/admin/parks/new"
                        className="flex items-center gap-2 bg-blue-600 text-white px-5 py-3 rounded-xl font-bold shadow-lg hover:bg-blue-700 transition-all active:scale-95"
                    >
                        <Plus size={20} />
                        <span>הוסף פארק חדש</span>
                    </Link>
                </div>
            </div>

            {/* Table / List */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {parks.length === 0 ? (
                    <div className="text-center py-20">
                        <div className="bg-gray-50 inline-flex p-4 rounded-full mb-4">
                            <MapPin size={32} className="text-gray-400" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-900">לא נמצאו פארקים</h3>
                        <p className="text-gray-500 mt-2">התחל על ידי הוספת הפארק הראשון למערכת</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-right">
                            <thead className="bg-gray-50 text-gray-500 text-xs uppercase font-bold sticky top-0">
                                <tr>
                                    <th className="px-6 py-4 rounded-tr-2xl">שם הפארק</th>
                                    <th className="px-6 py-4">עיר</th>
                                    <th className="px-6 py-4">רשות משויכת</th>
                                    <th className="px-6 py-4">מתקנים</th>
                                    <th className="px-6 py-4 rounded-tl-2xl text-center">פעולות</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {parks.map((park) => (
                                    <tr key={park.id} className="hover:bg-blue-50/50 transition-colors group">
                                        <td className="px-6 py-4 font-bold text-gray-900">
                                            <div className="flex items-center gap-3">
                                                {park.image ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img src={park.image} alt="" className="w-10 h-10 rounded-lg object-cover bg-gray-200" />
                                                ) : (
                                                    <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400">
                                                        <MapPin size={16} />
                                                    </div>
                                                )}
                                                <div className="flex items-center gap-2">
                                                    <span>{park.name}</span>
                                                    {park.amenities && (
                                                        <div className="flex items-center gap-1.5">
                                                            {park.amenities.hasShadow && (
                                                                <div className="p-1.5 bg-yellow-100 rounded-lg border border-yellow-200" title="יש צל">
                                                                    <Sun size={14} className="text-yellow-600" />
                                                                </div>
                                                            )}
                                                            {park.amenities.hasLighting && (
                                                                <div className="p-1.5 bg-yellow-50 rounded-lg border border-yellow-100" title="יש תאורה">
                                                                    <Lightbulb size={14} className="text-yellow-500" />
                                                                </div>
                                                            )}
                                                            {park.amenities.hasToilets && (
                                                                <div className="p-1.5 bg-blue-100 rounded-lg border border-blue-200" title="יש שירותים">
                                                                    <Toilet size={14} className="text-blue-600" />
                                                                </div>
                                                            )}
                                                            {park.amenities.hasWater && (
                                                                <div className="p-1.5 bg-cyan-100 rounded-lg border border-cyan-200" title="יש מים">
                                                                    <Droplet size={14} className="text-cyan-600" />
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-gray-600">{park.city}</td>
                                        <td className="px-6 py-4">
                                            {park.authorityId ? (
                                                <div className="flex items-center gap-2">
                                                    <Building2 size={16} className="text-blue-500" />
                                                    <span className="text-sm font-semibold text-gray-700">
                                                        {safeRenderText(getAuthorityName(park.authorityId)) || park.authorityId}
                                                    </span>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-2">
                                                    <AlertCircle size={16} className="text-red-500" />
                                                    <span className="text-sm font-bold text-red-600 bg-red-50 px-3 py-1 rounded-full">
                                                        לא משויך
                                                    </span>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs font-bold">
                                                {park.facilities?.length || 0} מתקנים
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Link
                                                    href={`/admin/parks/${park.id}/edit`}
                                                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                    title="ערוך"
                                                >
                                                    <Edit size={18} />
                                                </Link>
                                                <button
                                                    onClick={() => handleDelete(park.id)}
                                                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                    title="מחק"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
