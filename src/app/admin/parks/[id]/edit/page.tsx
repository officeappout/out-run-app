'use client';

// Force dynamic rendering to prevent SSR issues with window/localStorage
export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef, useMemo, Suspense, use } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import { ref, uploadBytes, getDownloadURL, getStorage } from 'firebase/storage';
import { Park, ParkSportType, ParkFeatureTag, Authority } from '@/types/admin-types';
import { getAutoSportTypes, getPark, updatePark } from '@/features/parks';
import { ParkGymEquipment } from '@/features/content/equipment/gym';
import { getAllGymEquipment } from '@/features/content/equipment/gym';
import { GymEquipment } from '@/features/content/equipment/gym';
import { getAllAuthorities, getAuthority } from '@/features/admin/services/authority.service';
import { getAllOutdoorBrands } from '@/features/content/equipment/brands';
import type { OutdoorBrand } from '@/features/content/equipment/brands';
import dynamicImport from 'next/dynamic';
import { Plus, Trash2, Save, Loader2, Building2, Tag, ArrowRight, Search, ChevronDown, Dumbbell, ImageIcon } from 'lucide-react';
import { safeRenderText } from '@/utils/render-helpers';

// ============================================
// FEATURE TAGS & CONFIGURATION
// ============================================

const FEATURE_TAG_OPTIONS: { id: ParkFeatureTag; label: string; icon: string }[] = [
  { id: 'shaded', label: 'מוצל', icon: '☀️' },
  { id: 'night_lighting', label: 'תאורת לילה', icon: '💡' },
  { id: 'water_fountain', label: 'ברזיית מים', icon: '🚰' },
  { id: 'has_toilets', label: 'שירותים', icon: '🚻' },
  { id: 'parkour_friendly', label: 'ידידותי לפארקור', icon: '🤸' },
  { id: 'stairs_training', label: 'מדרגות לאימון', icon: '🪜' },
  { id: 'rubber_floor', label: 'ריצפת גומי', icon: '🟫' },
  { id: 'near_water', label: 'ליד מים', icon: '🌊' },
  { id: 'dog_friendly', label: 'ידידותי לכלבים', icon: '🐕' },
  { id: 'wheelchair_accessible', label: 'נגיש לכיסא גלגלים', icon: '♿' },
];

// Dynamic import for Map to avoid SSR issues
const LocationPicker = dynamicImport(
    () => import('@/features/admin/components/LocationPicker'),
    { ssr: false, loading: () => <div className="h-64 bg-gray-100 animate-pulse rounded-2xl" /> }
);

interface ParkFormData extends Omit<Park, 'id' | 'facilities' | 'gymEquipment'> {
    gymEquipment: (ParkGymEquipment & {
        equipmentName?: string;
    })[];
    parkImageFile?: FileList;
}

const storage = getStorage();

function EditParkPageContent({ parkId }: { parkId: string }) {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [existingPark, setExistingPark] = useState<Park | null>(null);

    const [gymEquipmentList, setGymEquipmentList] = useState<GymEquipment[]>([]);
    const [loadingGymEquipment, setLoadingGymEquipment] = useState(true);
    const [authorities, setAuthorities] = useState<Authority[]>([]);
    const [loadingAuthorities, setLoadingAuthorities] = useState(true);
    const [outdoorBrands, setOutdoorBrands] = useState<OutdoorBrand[]>([]);
    const [loadingBrands, setLoadingBrands] = useState(true);

    // Searchable authority state
    const [authoritySearch, setAuthoritySearch] = useState('');
    const [showAuthorityDropdown, setShowAuthorityDropdown] = useState(false);
    const authorityDropdownRef = useRef<HTMLDivElement>(null);

    // Searchable equipment state (per-row)
    const [equipmentSearchTerms, setEquipmentSearchTerms] = useState<Record<number, string>>({});
    const [showEquipmentDropdown, setShowEquipmentDropdown] = useState<Record<number, boolean>>({});

    // Searchable manufacturer/brand state (per-row)
    const [brandSearchTerms, setBrandSearchTerms] = useState<Record<number, string>>({});
    const [showBrandDropdown, setShowBrandDropdown] = useState<Record<number, boolean>>({});

    const { register, control, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<ParkFormData & { authorityId?: string }>({
        defaultValues: {
            name: '',
            description: '',
            location: { lat: 32.0853, lng: 34.7818 },
            facilityType: 'gym_park',
            sportTypes: [],
            featureTags: [],
            gymEquipment: [],
            authorityId: undefined,
        }
    });

    const { fields: gymEquipmentFields, append: appendGymEquipment, remove: removeGymEquipment } = useFieldArray({
        control,
        name: "gymEquipment"
    });

    const location = watch('location');
    const selectedFeatureTags = watch('featureTags') as ParkFeatureTag[] | undefined;
    const selectedAuthorityIdValue = watch('authorityId');

    // Toggle feature tag helper
    const toggleFeatureTag = (tagId: ParkFeatureTag) => {
        const current = (selectedFeatureTags || []) as ParkFeatureTag[];
        const updated = current.includes(tagId)
            ? current.filter(t => t !== tagId)
            : [...current, tagId];
        setValue('featureTags', updated as ParkFeatureTag[]);
    };

    // Close authority dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (authorityDropdownRef.current && !authorityDropdownRef.current.contains(event.target as Node)) {
                setShowAuthorityDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Filtered authorities for searchable select
    const filteredAuthorities = useMemo(() => {
        if (!authoritySearch.trim()) return authorities;
        const lower = authoritySearch.toLowerCase();
        return authorities.filter(a =>
            a.name.toLowerCase().includes(lower)
        );
    }, [authorities, authoritySearch]);

    // Set authority display text when value changes
    useEffect(() => {
        if (selectedAuthorityIdValue) {
            const found = authorities.find(a => a.id === selectedAuthorityIdValue);
            if (found) {
                setAuthoritySearch(found.name);
            }
        }
    }, [selectedAuthorityIdValue, authorities]);

    // Load supporting data on mount
    useEffect(() => {
        loadGymEquipment();
        loadAuthorities();
        loadOutdoorBrands();
    }, []);

    // Load existing park data
    useEffect(() => {
        loadPark();
    }, [parkId]);

    const loadPark = async () => {
        try {
            setIsLoading(true);
            setLoadError(null);
            const park = await getPark(parkId);
            if (!park) {
                setLoadError('הפארק לא נמצא');
                return;
            }
            setExistingPark(park);

            // Populate the form with existing data
            reset({
                name: park.name || '',
                description: park.description || '',
                location: park.location || { lat: 32.0853, lng: 34.7818 },
                facilityType: park.facilityType || 'gym_park',
                sportTypes: park.sportTypes || [],
                featureTags: park.featureTags || [],
                gymEquipment: park.gymEquipment?.map(eq => ({
                    equipmentId: eq.equipmentId,
                    brandName: eq.brandName,
                })) || [],
                authorityId: park.authorityId || undefined,
                image: park.image || undefined,
            });

            // Set authority search text
            if (park.authorityId) {
                const auth = await getAuthority(park.authorityId).catch(() => null);
                if (auth) {
                    setAuthoritySearch(auth.name);
                }
            }

            // Set equipment search terms for pre-populated rows
            if (park.gymEquipment) {
                const terms: Record<number, string> = {};
                const brandTerms: Record<number, string> = {};
                park.gymEquipment.forEach((eq, idx) => {
                    terms[idx] = ''; // Will be resolved when equipment list loads
                    brandTerms[idx] = eq.brandName || '';
                });
                setEquipmentSearchTerms(terms);
                setBrandSearchTerms(brandTerms);
            }
        } catch (error) {
            console.error('Error loading park:', error);
            setLoadError('שגיאה בטעינת הפארק');
        } finally {
            setIsLoading(false);
        }
    };

    const loadGymEquipment = async () => {
        try {
            setLoadingGymEquipment(true);
            const data = await getAllGymEquipment();
            setGymEquipmentList(data);
        } catch (error) {
            console.error('Error loading gym equipment:', error);
        } finally {
            setLoadingGymEquipment(false);
        }
    };

    const loadAuthorities = async () => {
        try {
            setLoadingAuthorities(true);
            const data = await getAllAuthorities();
            const filtered = data.filter(a =>
                !a.id.includes('__SCHEMA_INIT__') &&
                !a.name.includes('__SCHEMA_INIT__')
            );
            setAuthorities(filtered);
        } catch (error) {
            console.error('Error loading authorities:', error);
        } finally {
            setLoadingAuthorities(false);
        }
    };

    const loadOutdoorBrands = async () => {
        try {
            setLoadingBrands(true);
            const data = await getAllOutdoorBrands();
            setOutdoorBrands(data);
        } catch (error) {
            console.error('Error loading outdoor brands:', error);
        } finally {
            setLoadingBrands(false);
        }
    };

    // Resolve equipment names after both park and equipment list are loaded
    useEffect(() => {
        if (existingPark?.gymEquipment && gymEquipmentList.length > 0) {
            const terms: Record<number, string> = {};
            existingPark.gymEquipment.forEach((eq, idx) => {
                const found = gymEquipmentList.find(e => e.id === eq.equipmentId);
                terms[idx] = found?.name || '';
            });
            setEquipmentSearchTerms(prev => ({ ...prev, ...terms }));
        }
    }, [existingPark, gymEquipmentList]);

    const uploadImage = async (file: File, path: string): Promise<string> => {
        try {
            const storageRef = ref(storage, path);
            const snapshot = await uploadBytes(storageRef, file);
            const url = await getDownloadURL(snapshot.ref);
            return url;
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            throw new Error(`נכשלה העלאת התמונה: ${msg}`);
        }
    };

    const onSubmit = async (data: ParkFormData) => {
        if (!data.location) {
            alert("נא לבחור מיקום על המפה");
            return;
        }

        try {
            setIsSubmitting(true);
            setUploadProgress('מתחיל עדכון...');

            // 1. Upload new image if selected
            let parkImageUrl = existingPark?.image || '';
            if (data.parkImageFile && data.parkImageFile.length > 0) {
                setUploadProgress('מעלה תמונה ראשית...');
                parkImageUrl = await uploadImage(data.parkImageFile[0], `parks/${Date.now()}_main`);
            }

            // 2. Process gym equipment
            const processedGymEquipment: ParkGymEquipment[] = data.gymEquipment.map((equipment) => ({
                equipmentId: equipment.equipmentId,
                brandName: equipment.brandName,
            }));

            // 3. Determine authorityId
            const selectedAuthorityId = data.authorityId;
            if (!selectedAuthorityId) {
                alert('נא לבחור רשות משויכת');
                setIsSubmitting(false);
                setUploadProgress('');
                return;
            }

            let finalAuthorityId = selectedAuthorityId;
            try {
                const authority = await getAuthority(selectedAuthorityId);
                if (authority?.parentAuthorityId) {
                    finalAuthorityId = authority.parentAuthorityId;
                }
            } catch (error) {
                console.error('Error resolving parent authority:', error);
            }

            // 4. Auto-assign + merge sports
            const autoSports = getAutoSportTypes('gym_park');
            const manualSports = Array.isArray(data.sportTypes) ? data.sportTypes as ParkSportType[] : [];
            const mergedSports = Array.from(new Set([...autoSports, ...manualSports]));

            // 5. Derive hasWaterFountain
            const tags = Array.isArray(data.featureTags) ? data.featureTags as ParkFeatureTag[] : [];
            const hasWaterFountain = tags.includes('water_fountain');

            // 6. Update in Firestore — NEVER send undefined to Firestore
            const updatedData: Partial<Omit<Park, 'id' | 'createdAt' | 'updatedAt'>> = {
                name: data.name || '',
                description: data.description || '',
                location: {
                    lat: Number(data.location.lat),
                    lng: Number(data.location.lng)
                },
                image: parkImageUrl || null,
                facilityType: 'gym_park',
                sportTypes: mergedSports.length > 0 ? mergedSports : [],
                featureTags: tags.length > 0 ? tags : [],
                hasWaterFountain: hasWaterFountain || false,
                gymEquipment: processedGymEquipment.length > 0 ? processedGymEquipment : [],
                authorityId: finalAuthorityId || null,
            };

            setUploadProgress('שומר שינויים...');
            await updatePark(parkId, updatedData);

            setUploadProgress('הצלחה!');
            setTimeout(() => router.push('/admin/locations'), 1000);

        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            console.error("Error updating park:", error);
            alert(`שגיאה בעדכון: ${msg}`);
        } finally {
            setIsSubmitting(false);
            setUploadProgress('');
        }
    };

    // ============================================
    // LOADING / ERROR STATES
    // ============================================

    if (isLoading) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center">
                <div className="text-center space-y-3">
                    <Loader2 className="w-10 h-10 text-cyan-600 animate-spin mx-auto" />
                    <p className="text-gray-500 font-bold">טוען נתוני פארק...</p>
                </div>
            </div>
        );
    }

    if (loadError || !existingPark) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center" dir="rtl">
                <div className="text-center space-y-4">
                    <div className="w-16 h-16 mx-auto bg-red-100 rounded-full flex items-center justify-center">
                        <Trash2 className="text-red-500" size={28} />
                    </div>
                    <h2 className="text-xl font-bold text-gray-800">{loadError || 'הפארק לא נמצא'}</h2>
                    <button
                        onClick={() => router.push('/admin/locations')}
                        className="inline-flex items-center gap-2 text-cyan-600 font-bold hover:underline"
                    >
                        <ArrowRight size={16} />
                        חזור לניהול מיקומים
                    </button>
                </div>
            </div>
        );
    }

    // ============================================
    // MAIN RENDER
    // ============================================

    return (
        <div className="max-w-4xl mx-auto space-y-8 pb-28" dir="rtl">
            {/* Back Button */}
            <button
                type="button"
                onClick={() => router.back()}
                className="flex items-center gap-2 text-gray-500 hover:text-gray-800 font-bold transition-colors group"
            >
                <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                <span>חזור</span>
            </button>

            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-black text-gray-900">עריכת פארק</h1>
                    <p className="text-sm text-gray-500 mt-1">{existingPark.name}</p>
                </div>
                <button
                    onClick={handleSubmit(onSubmit)}
                    disabled={isSubmitting}
                    className="flex items-center gap-2 bg-green-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg hover:bg-green-700 transition-all disabled:opacity-50"
                >
                    {isSubmitting ? <Loader2 className="animate-spin" /> : <Save size={20} />}
                    <span>{isSubmitting ? 'שומר...' : 'שמור שינויים'}</span>
                </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">

                {/* Park Details Card */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-6">
                    <h2 className="text-xl font-bold flex items-center gap-2 text-gray-800">
                        <span className="w-1 h-6 bg-blue-500 rounded-full"></span>
                        פרטי הפארק
                    </h2>

                    <div className="space-y-2">
                        <label className="text-sm font-bold text-gray-700">שם הפארק</label>
                        <input
                            {...register('name', { required: true })}
                            className="w-full p-3 bg-gray-50 rounded-xl border-2 border-transparent focus:border-blue-500 focus:bg-white transition-all outline-none text-right"
                            placeholder="לדוגמה: ספורטק הרצליה"
                        />
                        {errors.name && <span className="text-red-500 text-xs">שדה חובה</span>}
                    </div>

                    {/* Authority Selection - Searchable */}
                    <div className="space-y-2" ref={authorityDropdownRef}>
                        <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                            <Building2 size={16} className="text-blue-500" />
                            רשות משויכת <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                            <div className="relative">
                                <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="text"
                                    value={authoritySearch}
                                    onChange={(e) => {
                                        setAuthoritySearch(e.target.value);
                                        setShowAuthorityDropdown(true);
                                        if (selectedAuthorityIdValue) {
                                            const found = authorities.find(a => a.id === selectedAuthorityIdValue);
                                            if (found && e.target.value !== found.name) {
                                                setValue('authorityId', '' as string);
                                            }
                                        }
                                    }}
                                    onFocus={() => setShowAuthorityDropdown(true)}
                                    className="w-full p-3 pr-10 bg-gray-50 rounded-xl border-2 border-transparent focus:border-blue-500 focus:bg-white transition-all outline-none text-right"
                                    placeholder="הקלד לחיפוש רשות..."
                                    disabled={loadingAuthorities}
                                />
                                <ChevronDown size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            </div>
                            {showAuthorityDropdown && !loadingAuthorities && (
                                <div className="absolute z-20 w-full mt-1 max-h-60 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg">
                                    {filteredAuthorities.length > 0 ? (
                                        filteredAuthorities.map((authority) => (
                                            <button
                                                key={authority.id}
                                                type="button"
                                                onClick={() => {
                                                    setValue('authorityId', authority.id as string);
                                                    setAuthoritySearch(authority.name);
                                                    setShowAuthorityDropdown(false);
                                                }}
                                                className={`w-full text-right px-4 py-3 hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-b-0 ${
                                                    selectedAuthorityIdValue === authority.id ? 'bg-blue-50 font-bold' : ''
                                                }`}
                                            >
                                                <span className="text-sm text-gray-800">{safeRenderText(authority.name)}</span>
                                                <span className="text-xs text-gray-400 mr-2">
                                                    {authority.type === 'regional_council' ? '(מועצה אזורית)' : authority.type === 'city' ? '(עירייה)' : '(מועצה מקומית)'}
                                                </span>
                                            </button>
                                        ))
                                    ) : (
                                        <div className="p-4 text-center text-sm text-gray-400">לא נמצאו רשויות תואמות</div>
                                    )}
                                </div>
                            )}
                        </div>
                        <input type="hidden" {...register('authorityId', { required: 'נא לבחור רשות משויכת' })} />
                        {errors.authorityId && (
                            <span className="text-red-500 text-xs">{errors.authorityId.message as string || 'שדה חובה'}</span>
                        )}
                        {loadingAuthorities && (
                            <span className="text-gray-500 text-xs flex items-center gap-1">
                                <Loader2 size={12} className="animate-spin" /> טוען רשויות...
                            </span>
                        )}
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-bold text-gray-700">תיאור הפארק</label>
                        <textarea
                            {...register('description')}
                            rows={3}
                            className="w-full p-3 bg-gray-50 rounded-xl border-2 border-transparent focus:border-blue-500 focus:bg-white transition-all outline-none resize-none text-right"
                            placeholder="תיאור כללי על הפארק..."
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-bold text-gray-700">תמונה ראשית</label>
                        {existingPark.image && (
                            <div className="mb-2">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={existingPark.image}
                                    alt={existingPark.name}
                                    className="w-32 h-24 rounded-xl object-cover border border-gray-200"
                                />
                                <p className="text-xs text-gray-400 mt-1">תמונה נוכחית — העלאה חדשה תחליף אותה</p>
                            </div>
                        )}
                        <div className="relative">
                            <input
                                type="file"
                                accept="image/*"
                                {...register('parkImageFile')}
                                className="block w-full text-sm text-slate-500
                                  file:mr-4 file:py-2 file:px-4
                                  file:rounded-full file:border-0
                                  file:text-sm file:font-semibold
                                  file:bg-blue-50 file:text-blue-700
                                  hover:file:bg-blue-100
                                "
                            />
                        </div>
                    </div>
                </div>

                {/* Feature Tags */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-6">
                    <h2 className="text-xl font-bold flex items-center gap-2 text-gray-800">
                        <span className="w-1 h-6 bg-purple-500 rounded-full"></span>
                        תגיות מיוחדות
                    </h2>
                    <div className="space-y-3">
                        <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                            <Tag size={14} className="text-purple-500" />
                            מאפייני המתחם
                            {(selectedFeatureTags?.length ?? 0) > 0 && (
                                <span className="text-xs font-bold text-white bg-purple-500 px-2 py-0.5 rounded-full">
                                    {selectedFeatureTags?.length}
                                </span>
                            )}
                        </label>
                        <p className="text-xs text-gray-400">
                            סמנו את כל התגיות הרלוונטיות — צל, תאורה, מים, שירותים וכו&apos;.
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                            {FEATURE_TAG_OPTIONS.map((tag) => {
                                const isSelected = (selectedFeatureTags || []).includes(tag.id);
                                return (
                                    <button
                                        key={tag.id}
                                        type="button"
                                        onClick={() => toggleFeatureTag(tag.id)}
                                        className={`px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-all flex items-center gap-2 ${
                                            isSelected
                                                ? 'bg-purple-50 border-purple-400 text-purple-700'
                                                : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                                        }`}
                                    >
                                        <span>{tag.icon}</span>
                                        <span>{tag.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Gym Equipment Inventory */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4">
                    <div className="flex justify-between items-center">
                        <h2 className="text-xl font-bold flex items-center gap-2 text-gray-800">
                            <span className="w-1 h-6 bg-indigo-500 rounded-full"></span>
                            מתקנים קבועים בפארק ({gymEquipmentFields.length})
                        </h2>
                        <button
                            type="button"
                            onClick={() => {
                                appendGymEquipment({ equipmentId: '', brandName: '' });
                                const newIndex = gymEquipmentFields.length;
                                setEquipmentSearchTerms(prev => ({ ...prev, [newIndex]: '' }));
                                setBrandSearchTerms(prev => ({ ...prev, [newIndex]: '' }));
                            }}
                            disabled={loadingGymEquipment}
                            className="flex items-center gap-2 text-blue-600 font-bold hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                        >
                            <Plus size={18} />
                            הוסף ציוד
                        </button>
                    </div>

                    <p className="text-xs text-gray-400 -mt-1">
                        חפש וקשר מתקנים מהקטלוג הראשי. תמונת המתקן תוצג אוטומטית.
                    </p>

                    <div className="grid grid-cols-1 gap-3">
                        {gymEquipmentFields.map((field, index) => {
                            const equipmentId = watch(`gymEquipment.${index}.equipmentId`);
                            const brandName = watch(`gymEquipment.${index}.brandName`);

                            const selectedEquipment = gymEquipmentList.find(e => e.id === equipmentId);

                            const eqSearch = (equipmentSearchTerms[index] || '').toLowerCase();
                            const filteredEquipment = eqSearch
                                ? gymEquipmentList.filter(e => e.name.toLowerCase().includes(eqSearch))
                                : gymEquipmentList;

                            const brSearch = (brandSearchTerms[index] || '').toLowerCase();
                            const filteredBrands = brSearch
                                ? outdoorBrands.filter(b => b.name.toLowerCase().includes(brSearch))
                                : outdoorBrands;

                            const getEquipmentImage = (): string | undefined => {
                                if (!selectedEquipment) return undefined;
                                if (brandName) {
                                    const matchedBrand = selectedEquipment.brands.find(b => b.brandName === brandName);
                                    if (matchedBrand?.imageUrl) return matchedBrand.imageUrl;
                                }
                                const firstBrandWithImage = selectedEquipment.brands.find(b => b.imageUrl);
                                return firstBrandWithImage?.imageUrl;
                            };
                            const previewImage = getEquipmentImage();

                            return (
                                <div key={field.id} className="bg-gray-50 p-4 rounded-xl border border-gray-200 relative group hover:border-indigo-200 transition-colors">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const name = selectedEquipment?.name || `מתקן #${index + 1}`;
                                            if (window.confirm(`האם להסיר את "${name}" מרשימת המתקנים?`)) {
                                                removeGymEquipment(index);
                                                setEquipmentSearchTerms(prev => { const u = { ...prev }; delete u[index]; return u; });
                                                setBrandSearchTerms(prev => { const u = { ...prev }; delete u[index]; return u; });
                                            }
                                        }}
                                        className="absolute top-3 left-3 p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                        title="הסר מתקן"
                                    >
                                        <Trash2 size={16} />
                                    </button>

                                    <div className="flex items-start gap-4">
                                        <div className="flex-shrink-0 w-14 h-14 rounded-xl overflow-hidden bg-gray-200 border border-gray-300 flex items-center justify-center">
                                            {previewImage ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img
                                                    src={previewImage}
                                                    alt={selectedEquipment?.name || 'מתקן'}
                                                    className="w-full h-full object-cover"
                                                    onError={(e) => {
                                                        (e.target as HTMLImageElement).style.display = 'none';
                                                        (e.target as HTMLImageElement).parentElement!.classList.add('bg-indigo-100');
                                                    }}
                                                />
                                            ) : (
                                                <Dumbbell size={24} className="text-gray-400" />
                                            )}
                                        </div>

                                        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {/* Equipment Search */}
                                            <div className="space-y-1 relative">
                                                <label className="text-xs font-bold text-gray-500">מתקן כושר *</label>
                                                <div className="relative">
                                                    <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                                    <input
                                                        type="text"
                                                        value={equipmentSearchTerms[index] ?? (selectedEquipment?.name || '')}
                                                        onChange={(e) => {
                                                            setEquipmentSearchTerms(prev => ({ ...prev, [index]: e.target.value }));
                                                            setShowEquipmentDropdown(prev => ({ ...prev, [index]: true }));
                                                            if (equipmentId) {
                                                                setValue(`gymEquipment.${index}.equipmentId`, '');
                                                                setValue(`gymEquipment.${index}.brandName`, '');
                                                                setBrandSearchTerms(prev => ({ ...prev, [index]: '' }));
                                                            }
                                                        }}
                                                        onFocus={() => setShowEquipmentDropdown(prev => ({ ...prev, [index]: true }))}
                                                        placeholder="הקלד לחיפוש מתקן..."
                                                        className="w-full p-2 pr-9 bg-white rounded-lg border-2 border-transparent focus:border-indigo-400 outline-none text-right text-sm"
                                                        disabled={loadingGymEquipment}
                                                    />
                                                </div>
                                                {showEquipmentDropdown[index] && !loadingGymEquipment && (
                                                    <div className="absolute z-20 w-full mt-1 max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg">
                                                        {filteredEquipment.length > 0 ? (
                                                            filteredEquipment.map((equipment) => {
                                                                const eqImg = equipment.brands.find(b => b.imageUrl)?.imageUrl;
                                                                return (
                                                                    <button
                                                                        key={equipment.id}
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setValue(`gymEquipment.${index}.equipmentId`, equipment.id);
                                                                            setValue(`gymEquipment.${index}.brandName`, '');
                                                                            setEquipmentSearchTerms(prev => ({ ...prev, [index]: equipment.name }));
                                                                            setShowEquipmentDropdown(prev => ({ ...prev, [index]: false }));
                                                                            setBrandSearchTerms(prev => ({ ...prev, [index]: '' }));
                                                                        }}
                                                                        className={`w-full text-right px-3 py-2.5 hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-b-0 flex items-center gap-3 ${
                                                                            equipmentId === equipment.id ? 'bg-blue-50 font-bold text-blue-700' : 'text-gray-700'
                                                                        }`}
                                                                    >
                                                                        <div className="w-8 h-8 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0 flex items-center justify-center">
                                                                            {eqImg ? (
                                                                                // eslint-disable-next-line @next/next/no-img-element
                                                                                <img src={eqImg} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                                                            ) : (
                                                                                <Dumbbell size={14} className="text-gray-400" />
                                                                            )}
                                                                        </div>
                                                                        <span className="text-sm flex-1">{equipment.name}</span>
                                                                    </button>
                                                                );
                                                            })
                                                        ) : (
                                                            <div className="p-3 text-center text-xs text-gray-400">לא נמצאו מתקנים</div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Brand Search */}
                                            <div className="space-y-1 relative">
                                                <label className="text-xs font-bold text-gray-500">חברה (יצרן) *</label>
                                                <div className="relative">
                                                    <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                                    <input
                                                        type="text"
                                                        value={brandSearchTerms[index] ?? brandName ?? ''}
                                                        onChange={(e) => {
                                                            setBrandSearchTerms(prev => ({ ...prev, [index]: e.target.value }));
                                                            setShowBrandDropdown(prev => ({ ...prev, [index]: true }));
                                                            if (brandName) {
                                                                setValue(`gymEquipment.${index}.brandName`, '');
                                                            }
                                                        }}
                                                        onFocus={() => setShowBrandDropdown(prev => ({ ...prev, [index]: true }))}
                                                        placeholder="הקלד לחיפוש יצרן..."
                                                        className="w-full p-2 pr-9 bg-white rounded-lg border-2 border-transparent focus:border-indigo-400 outline-none text-right text-sm disabled:opacity-50"
                                                        disabled={!equipmentId || loadingBrands}
                                                    />
                                                </div>
                                                {showBrandDropdown[index] && equipmentId && !loadingBrands && (
                                                    <div className="absolute z-20 w-full mt-1 max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg">
                                                        {filteredBrands.length > 0 ? (
                                                            filteredBrands.map((brand) => (
                                                                <button
                                                                    key={brand.id}
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setValue(`gymEquipment.${index}.brandName`, brand.name);
                                                                        setBrandSearchTerms(prev => ({ ...prev, [index]: brand.name }));
                                                                        setShowBrandDropdown(prev => ({ ...prev, [index]: false }));
                                                                    }}
                                                                    className={`w-full text-right px-3 py-2.5 hover:bg-indigo-50 transition-colors border-b border-gray-50 last:border-b-0 flex items-center gap-3 ${
                                                                        brandName === brand.name ? 'bg-indigo-50 font-bold text-indigo-700' : 'text-gray-700'
                                                                    }`}
                                                                >
                                                                    {brand.logoUrl ? (
                                                                        // eslint-disable-next-line @next/next/no-img-element
                                                                        <img
                                                                            src={brand.logoUrl}
                                                                            alt={brand.name}
                                                                            className="w-6 h-6 rounded object-cover flex-shrink-0"
                                                                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                                                        />
                                                                    ) : (
                                                                        <div className="w-6 h-6 rounded bg-gray-200 flex items-center justify-center flex-shrink-0">
                                                                            <ImageIcon size={12} className="text-gray-400" />
                                                                        </div>
                                                                    )}
                                                                    <span className="text-sm">{brand.name}</span>
                                                                </button>
                                                            ))
                                                        ) : (
                                                            <div className="p-3 text-center text-xs text-gray-400">לא נמצאו יצרנים</div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {gymEquipmentFields.length === 0 && (
                        <div className="text-center py-10 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                            <Dumbbell size={32} className="mx-auto text-gray-300 mb-3" />
                            <p className="text-gray-400 font-medium">טרם נוספו מתקנים קבועים לפארק זה</p>
                            <button
                                type="button"
                                onClick={() => {
                                    appendGymEquipment({ equipmentId: '', brandName: '' });
                                    setEquipmentSearchTerms(prev => ({ ...prev, 0: '' }));
                                    setBrandSearchTerms(prev => ({ ...prev, 0: '' }));
                                }}
                                disabled={loadingGymEquipment}
                                className="mt-3 text-indigo-600 font-bold hover:underline disabled:opacity-50"
                            >
                                הוסף את המתקן הראשון
                            </button>
                        </div>
                    )}
                </div>

                {/* Location Card */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-6">
                    <h2 className="text-xl font-bold flex items-center gap-2 text-gray-800">
                        <span className="w-1 h-6 bg-emerald-500 rounded-full"></span>
                        מיקום במפה
                    </h2>
                    <p className="text-sm text-gray-500">לחץ על המפה כדי לעדכן את מיקום הפארק</p>

                    <Controller
                        control={control}
                        name="location"
                        render={({ field: { value, onChange } }) => (
                            <LocationPicker value={value} onChange={onChange} />
                        )}
                    />
                    <div className="flex gap-4 text-sm bg-gray-50 p-3 rounded-lg text-gray-600 font-mono" dir="ltr">
                        <span>Lat: {location.lat.toFixed(6)}</span>
                        <span>Lng: {location.lng.toFixed(6)}</span>
                    </div>
                </div>

            </form>

            {/* Sticky Save Footer — glassmorphism */}
            <div className="fixed bottom-0 left-0 right-0 z-40 pointer-events-none" dir="rtl">
                <div className="max-w-4xl mx-auto px-4 pb-4 pointer-events-auto">
                    <div className="bg-white/80 backdrop-blur-xl border border-gray-200/60 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] rounded-2xl p-4 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 text-sm text-gray-500">
                            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                            <span className="hidden sm:inline">עריכת פארק — {existingPark.name}</span>
                        </div>
                        <button
                            type="button"
                            onClick={handleSubmit(onSubmit)}
                            disabled={isSubmitting}
                            className="flex items-center gap-2 bg-green-600 text-white px-8 py-3 rounded-xl font-bold text-base shadow-lg hover:bg-green-700 hover:shadow-xl transition-all disabled:opacity-50"
                        >
                            {isSubmitting ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                            <span>{isSubmitting ? 'שומר...' : 'שמור שינויים'}</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Progress Overlay */}
            {isSubmitting && uploadProgress && (
                <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-black/80 text-white px-6 py-3 rounded-full shadow-2xl backdrop-blur-md flex items-center gap-3 z-50 animate-in slide-in-from-bottom-5">
                    <Loader2 className="animate-spin" size={20} />
                    <span className="font-bold">{uploadProgress}</span>
                </div>
            )}
        </div>
    );
}

export default function EditParkPage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = use(params);
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <Loader2 className="w-12 h-12 text-cyan-600 animate-spin" />
            </div>
        }>
            <EditParkPageContent parkId={resolvedParams.id} />
        </Suspense>
    );
}
