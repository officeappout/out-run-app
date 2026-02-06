'use client';

// Force dynamic rendering to prevent SSR issues with window/localStorage
export const dynamic = 'force-dynamic';

import { useState, useEffect, Suspense } from 'react';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
import { useRouter, useSearchParams } from 'next/navigation';
import { db } from '@/lib/firebase';
import { collection, addDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, getStorage } from 'firebase/storage';
import { Park, ParkFacilityType, ParkAmenities, Authority } from '@/types/admin-types';
import { ParkGymEquipment } from '@/features/content/equipment/gym';
import { getAllGymEquipment } from '@/features/content/equipment/gym';
import { GymEquipment } from '@/features/content/equipment/gym';
import { getAllAuthorities } from '@/features/admin/services/authority.service';
import dynamicImport from 'next/dynamic';
import { Plus, Trash2, Save, Image as ImageIcon, Loader2, X, Sun, Lightbulb, Droplet, Toilet, Building2 } from 'lucide-react';
import { safeRenderText } from '@/utils/render-helpers';

// Dynamic import for Map to avoid SSR issues
const LocationPicker = dynamicImport(
    () => import('@/features/admin/components/LocationPicker'),
    { ssr: false, loading: () => <div className="h-64 bg-gray-100 animate-pulse rounded-2xl" /> }
);

interface ParkFormData extends Omit<Park, 'id' | 'facilities' | 'gymEquipment'> {
    facilities: {
        name: string;
        type: ParkFacilityType;
        difficulty: 'beginner' | 'pro';
        imageFile?: FileList; // For upload logic
        image?: string;
    }[];
    gymEquipment: (ParkGymEquipment & {
        equipmentName?: string; // For display purposes
    })[];
    amenities?: ParkAmenities;
    parkImageFile?: FileList;
}

const storage = getStorage();

function AddParkPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const authorityId = searchParams.get('authorityId');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<string>('');
    const [gymEquipmentList, setGymEquipmentList] = useState<GymEquipment[]>([]);
    const [loadingGymEquipment, setLoadingGymEquipment] = useState(true);
    const [authorities, setAuthorities] = useState<Authority[]>([]);
    const [loadingAuthorities, setLoadingAuthorities] = useState(true);

    const { register, control, handleSubmit, watch, setValue, formState: { errors } } = useForm<ParkFormData & { authorityId?: string }>({
        defaultValues: {
            name: '',
            city: '',
            description: '',
            location: { lat: 32.0853, lng: 34.7818 },
            facilities: [],
            gymEquipment: [],
            amenities: {
                hasShadow: false,
                hasLighting: false,
                hasToilets: false,
                hasWater: false,
            },
            authorityId: authorityId || undefined, // Pre-fill from URL query param if present
        }
    });

    const { fields, append, remove } = useFieldArray({
        control,
        name: "facilities"
    });

    const { fields: gymEquipmentFields, append: appendGymEquipment, remove: removeGymEquipment } = useFieldArray({
        control,
        name: "gymEquipment"
    });

    const location = watch('location');

    // Load gym equipment and authorities on mount
    useEffect(() => {
        loadGymEquipment();
        loadAuthorities();
    }, []);

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
            // Filter out internal technical records
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

    // פונקציית העלאה משופרת עם לוגים וטיפול בשגיאות
    const uploadImage = async (file: File, path: string): Promise<string> => {
        try {
            console.log(`Starting upload to: ${path}`);
            const storageRef = ref(storage, path);
            const snapshot = await uploadBytes(storageRef, file);
            const url = await getDownloadURL(snapshot.ref);
            console.log(`Upload successful! URL: ${url}`);
            return url;
        } catch (error: any) {
            console.error("Storage Upload Error:", error);
            throw new Error(`נכשלה העלאת התמונה: ${error.message}`);
        }
    };

    const onSubmit = async (data: ParkFormData) => {
        if (!data.location) {
            alert("נא לבחור מיקום על המפה");
            return;
        }

        try {
            setIsSubmitting(true);
            setUploadProgress('מתחיל העלאה...');

            // 1. העלאת תמונה ראשית של הפארק (רק אם נבחרה)
            let parkImageUrl = '';
            if (data.parkImageFile && data.parkImageFile.length > 0) {
                setUploadProgress('מעלה תמונה ראשית...');
                parkImageUrl = await uploadImage(data.parkImageFile[0], `parks/${Date.now()}_main`);
            }

            // 2. העלאת תמונות למתקנים (בצורה בטוחה)
            setUploadProgress('מעלה תמונות מתקנים...');
            const facilitiesWithImages = await Promise.all(data.facilities.map(async (facility, index) => {
                let facilityImageUrl = '';
                
                // בדיקה בטוחה אם יש קובץ להעלאה
                if (facility.imageFile && facility.imageFile.length > 0) {
                    try {
                        facilityImageUrl = await uploadImage(facility.imageFile[0], `facilities/${Date.now()}_${index}`);
                    } catch (imgErr) {
                        console.error(`Failed to upload image for facility ${index}:`, imgErr);
                        // ממשיכים גם אם תמונה אחת נכשלה כדי לא לתקוע את הכל
                    }
                }

                return {
                    name: facility.name,
                    type: facility.type,
                    image: facilityImageUrl,
                    difficulty: facility.difficulty
                };
            }));

            // 3. Process gym equipment (remove display fields, keep only equipmentId and brandName)
            const processedGymEquipment: ParkGymEquipment[] = data.gymEquipment.map((equipment) => ({
                equipmentId: equipment.equipmentId,
                brandName: equipment.brandName,
            }));

            // 4. Determine the correct authorityId for billing/reporting
            // Use the selected authorityId from form (required field)
            const selectedAuthorityId = data.authorityId || authorityId;
            
            if (!selectedAuthorityId) {
                alert('נא לבחור רשות משויכת');
                setIsSubmitting(false);
                setUploadProgress('');
                return;
            }

            // If the park is in a settlement, link to parent Regional Council for B2G billing
            let finalAuthorityId = selectedAuthorityId;
            try {
                const { getAuthority } = await import('@/features/admin/services/authority.service');
                const authority = await getAuthority(selectedAuthorityId);
                // If this is a settlement (has parentAuthorityId), use the parent for billing
                if (authority?.parentAuthorityId) {
                    finalAuthorityId = authority.parentAuthorityId;
                }
            } catch (error) {
                console.error('Error resolving parent authority:', error);
                // Fallback to original authorityId if lookup fails
            }

            // 5. שמירה ל-Firestore
            const newPark: Omit<Park, 'id'> = {
                name: data.name,
                city: data.city,
                description: data.description,
                location: {
                    lat: Number(data.location.lat),
                    lng: Number(data.location.lng)
                },
                image: parkImageUrl,
                facilities: facilitiesWithImages,
                gymEquipment: processedGymEquipment.length > 0 ? processedGymEquipment : undefined,
                amenities: data.amenities,
                authorityId: finalAuthorityId, // Links to Regional Council for B2G billing
                status: 'open',
            };

            setUploadProgress('שומר נתונים בבסיס הנתונים...');
            await addDoc(collection(db, 'parks'), newPark);

            setUploadProgress('הצלחה!');
            setTimeout(() => router.push('/admin/parks'), 1000);

        } catch (error: any) {
            console.error("Error creating park:", error);
            alert(`שגיאה בשמירה: ${error.message || 'ודא ש-Firebase Storage מוגדר כראוי'}`);
        } finally {
            setIsSubmitting(false);
            setUploadProgress('');
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8 pb-20">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-black text-gray-900">הוספת פארק חדש</h1>
                <button
                    onClick={handleSubmit(onSubmit)}
                    disabled={isSubmitting}
                    className="flex items-center gap-2 bg-green-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg hover:bg-green-700 transition-all disabled:opacity-50"
                >
                    {isSubmitting ? <Loader2 className="animate-spin" /> : <Save size={20} />}
                    <span>{isSubmitting ? 'שומר...' : 'שמור פארק'}</span>
                </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">

                {/* Park Details Card */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-6">
                    <h2 className="text-xl font-bold flex items-center gap-2 text-gray-800">
                        <span className="w-1 h-6 bg-blue-500 rounded-full"></span>
                        פרטי הפארק
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-gray-700">שם הפארק</label>
                            <input
                                {...register('name', { required: true })}
                                className="w-full p-3 bg-gray-50 rounded-xl border-2 border-transparent focus:border-blue-500 focus:bg-white transition-all outline-none"
                                placeholder="לדוגמה: ספורטק הרצליה"
                            />
                            {errors.name && <span className="text-red-500 text-xs">שדה חובה</span>}
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-bold text-gray-700">עיר</label>
                            <input
                                {...register('city', { required: true })}
                                className="w-full p-3 bg-gray-50 rounded-xl border-2 border-transparent focus:border-blue-500 focus:bg-white transition-all outline-none"
                                placeholder="לדוגמה: הרצליה"
                            />
                            {errors.city && <span className="text-red-500 text-xs">שדה חובה</span>}
                        </div>
                    </div>

                    {/* Authority Selection - Required */}
                    <div className="space-y-2">
                        <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                            <Building2 size={16} className="text-blue-500" />
                            רשות משויכת <span className="text-red-500">*</span>
                        </label>
                        <select
                            {...register('authorityId', { required: 'נא לבחור רשות משויכת' })}
                            className="w-full p-3 bg-gray-50 rounded-xl border-2 border-transparent focus:border-blue-500 focus:bg-white transition-all outline-none"
                            disabled={loadingAuthorities}
                        >
                            <option value="">בחר רשות...</option>
                            {authorities.map((authority) => (
                                <option key={authority.id} value={authority.id}>
                                    {safeRenderText(authority.name)} {authority.type === 'regional_council' ? '(מועצה אזורית)' : authority.type === 'city' ? '(עירייה)' : '(מועצה מקומית)'}
                                </option>
                            ))}
                        </select>
                        {errors.authorityId && (
                            <span className="text-red-500 text-xs">{errors.authorityId.message as string || 'שדה חובה'}</span>
                        )}
                        {loadingAuthorities && (
                            <span className="text-gray-500 text-xs">טוען רשויות...</span>
                        )}
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-bold text-gray-700">תיאור הפארק</label>
                        <textarea
                            {...register('description')}
                            rows={3}
                            className="w-full p-3 bg-gray-50 rounded-xl border-2 border-transparent focus:border-blue-500 focus:bg-white transition-all outline-none resize-none"
                            placeholder="תיאור כללי על הפארק..."
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-bold text-gray-700">תמונה ראשית</label>
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

                {/* Amenities Section */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-6">
                    <h2 className="text-xl font-bold flex items-center gap-2 text-gray-800">
                        <span className="w-1 h-6 bg-green-500 rounded-full"></span>
                        מאפייני הפארק
                    </h2>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {/* Has Shadow */}
                        <label className={`flex flex-col items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                            watch('amenities.hasShadow') 
                                ? 'border-yellow-400 bg-yellow-50' 
                                : 'border-gray-200 hover:bg-gray-50'
                        }`}>
                            <input
                                type="checkbox"
                                {...register('amenities.hasShadow')}
                                className="w-5 h-5 text-yellow-500 border-gray-300 rounded focus:ring-yellow-500"
                            />
                            <Sun size={32} className={watch('amenities.hasShadow') ? 'text-yellow-600' : 'text-yellow-400'} />
                            <span className={`text-sm font-bold text-center ${
                                watch('amenities.hasShadow') ? 'text-yellow-700' : 'text-gray-700'
                            }`}>יש צל</span>
                        </label>

                        {/* Has Lighting */}
                        <label className={`flex flex-col items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                            watch('amenities.hasLighting') 
                                ? 'border-yellow-300 bg-yellow-50' 
                                : 'border-gray-200 hover:bg-gray-50'
                        }`}>
                            <input
                                type="checkbox"
                                {...register('amenities.hasLighting')}
                                className="w-5 h-5 text-yellow-500 border-gray-300 rounded focus:ring-yellow-500"
                            />
                            <Lightbulb size={32} className={watch('amenities.hasLighting') ? 'text-yellow-500' : 'text-yellow-300'} />
                            <span className={`text-sm font-bold text-center ${
                                watch('amenities.hasLighting') ? 'text-yellow-700' : 'text-gray-700'
                            }`}>יש תאורה</span>
                        </label>

                        {/* Has Toilets */}
                        <label className={`flex flex-col items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                            watch('amenities.hasToilets') 
                                ? 'border-blue-400 bg-blue-50' 
                                : 'border-gray-200 hover:bg-gray-50'
                        }`}>
                            <input
                                type="checkbox"
                                {...register('amenities.hasToilets')}
                                className="w-5 h-5 text-blue-500 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <Toilet size={32} className={watch('amenities.hasToilets') ? 'text-blue-600' : 'text-blue-400'} />
                            <span className={`text-sm font-bold text-center ${
                                watch('amenities.hasToilets') ? 'text-blue-700' : 'text-gray-700'
                            }`}>יש שירותים</span>
                        </label>

                        {/* Has Water */}
                        <label className={`flex flex-col items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                            watch('amenities.hasWater') 
                                ? 'border-cyan-400 bg-cyan-50' 
                                : 'border-gray-200 hover:bg-gray-50'
                        }`}>
                            <input
                                type="checkbox"
                                {...register('amenities.hasWater')}
                                className="w-5 h-5 text-cyan-500 border-gray-300 rounded focus:ring-cyan-500"
                            />
                            <Droplet size={32} className={watch('amenities.hasWater') ? 'text-cyan-600' : 'text-cyan-400'} />
                            <span className={`text-sm font-bold text-center ${
                                watch('amenities.hasWater') ? 'text-cyan-700' : 'text-gray-700'
                            }`}>יש מים</span>
                        </label>
                    </div>
                </div>

                {/* Location Card */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-6">
                    <h2 className="text-xl font-bold flex items-center gap-2 text-gray-800">
                        <span className="w-1 h-6 bg-purple-500 rounded-full"></span>
                        מיקום במפה
                    </h2>
                    <p className="text-sm text-gray-500">לחץ על המפה כדי לסמן את מיקום הפארק</p>

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

                {/* Facilities Section */}
                <div className="space-y-4">
                    <div className="flex justify-between items-center px-2">
                        <h2 className="text-xl font-bold flex items-center gap-2 text-gray-800">
                            <span className="w-1 h-6 bg-orange-500 rounded-full"></span>
                            מתקנים בפארק ({fields.length})
                        </h2>
                        <button
                            type="button"
                            onClick={() => append({ name: '', type: 'static', difficulty: 'beginner' })}
                            className="flex items-center gap-2 text-blue-600 font-bold hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors"
                        >
                            <Plus size={18} />
                            הוסף מתקן
                        </button>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                        {fields.map((field, index) => (
                            <div key={field.id} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 relative group">
                                <button
                                    type="button"
                                    onClick={() => remove(index)}
                                    className="absolute top-4 left-4 p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                >
                                    <Trash2 size={20} />
                                </button>

                                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-end">
                                    <div className="md:col-span-1 flex justify-center pb-2">
                                        <span className="w-8 h-8 rounded-full bg-gray-100 text-gray-500 font-bold flex items-center justify-center">
                                            {index + 1}
                                        </span>
                                    </div>

                                    <div className="md:col-span-3 space-y-2">
                                        <label className="text-xs font-bold text-gray-500">שם המתקן</label>
                                        <input
                                            {...register(`facilities.${index}.name` as const, { required: true })}
                                            placeholder="שם המתקן"
                                            className="w-full p-2 bg-gray-50 rounded-lg border-2 border-transparent focus:border-blue-500 focus:bg-white outline-none"
                                        />
                                    </div>

                                    <div className="md:col-span-2 space-y-2">
                                        <label className="text-xs font-bold text-gray-500">סוג</label>
                                        <select
                                            {...register(`facilities.${index}.type` as const)}
                                            className="w-full p-2 bg-gray-50 rounded-lg outline-none"
                                        >
                                            <option value="static">סטטי (מתח/מקבילים)</option>
                                            <option value="machine">מכשיר כוח</option>
                                            <option value="cardio">אירובי</option>
                                        </select>
                                    </div>

                                    <div className="md:col-span-2 space-y-2">
                                        <label className="text-xs font-bold text-gray-500">קושי</label>
                                        <select
                                            {...register(`facilities.${index}.difficulty` as const)}
                                            className="w-full p-2 bg-gray-50 rounded-lg outline-none"
                                        >
                                            <option value="beginner">מתחיל</option>
                                            <option value="pro">מתקדם</option>
                                        </select>
                                    </div>

                                    <div className="md:col-span-4">
                                        {/* תצוגה חכמה של בחירת תמונה למתקן */}
                                        {watch(`facilities.${index}.imageFile`) && watch(`facilities.${index}.imageFile`)!.length > 0 ? (
                                            <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 p-2 rounded-lg text-sm h-[42px]">
                                                <div className="bg-green-500 text-white rounded-full p-0.5 shrink-0">
                                                    <Plus size={12} className="rotate-45" />
                                                </div>
                                                <span className="truncate flex-1 font-medium">
                                                    {watch(`facilities.${index}.imageFile`)![0].name}
                                                </span>
                                                <button 
                                                    type="button" 
                                                    onClick={() => setValue(`facilities.${index}.imageFile`, undefined)}
                                                    className="p-1 hover:bg-green-100 rounded-full transition-colors text-green-800"
                                                    title="הסר תמונה"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        ) : (
                                            <label className="flex items-center justify-center gap-2 cursor-pointer bg-gray-50 hover:bg-gray-100 border border-dashed border-gray-300 rounded-lg p-2 h-[42px] transition-colors w-full">
                                                <ImageIcon size={18} className="text-gray-400" />
                                                <span className="text-sm text-gray-500">תמונה</span>
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    {...register(`facilities.${index}.imageFile` as const)}
                                                    className="hidden"
                                                />
                                            </label>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {fields.length === 0 && (
                        <div className="text-center py-10 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
                            <p className="text-gray-400">טרם נוספו מתקנים לפארק זה</p>
                            <button
                                type="button"
                                onClick={() => append({ name: '', type: 'static', difficulty: 'beginner' })}
                                className="mt-2 text-blue-600 font-bold hover:underline"
                            >
                                הוסף את המתקן הראשון
                            </button>
                        </div>
                    )}
                </div>

                {/* Gym Equipment Section */}
                <div className="space-y-4">
                    <div className="flex justify-between items-center px-2">
                        <h2 className="text-xl font-bold flex items-center gap-2 text-gray-800">
                            <span className="w-1 h-6 bg-indigo-500 rounded-full"></span>
                            מתקנים קבועים בפארק ({gymEquipmentFields.length})
                        </h2>
                        <button
                            type="button"
                            onClick={() => appendGymEquipment({ equipmentId: '', brandName: '' })}
                            disabled={loadingGymEquipment}
                            className="flex items-center gap-2 text-blue-600 font-bold hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                        >
                            <Plus size={18} />
                            הוסף מתקן
                        </button>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                        {gymEquipmentFields.map((field, index) => {
                            const equipmentId = watch(`gymEquipment.${index}.equipmentId`);
                            const brandName = watch(`gymEquipment.${index}.brandName`);
                            
                            const selectedEquipment = gymEquipmentList.find(e => e.id === equipmentId);
                            const availableBrands = selectedEquipment?.brands || [];

                            return (
                                <div key={field.id} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 relative group">
                                    <button
                                        type="button"
                                        onClick={() => removeGymEquipment(index)}
                                        className="absolute top-4 left-4 p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                    >
                                        <Trash2 size={20} />
                                    </button>

                                    <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-end pr-10">
                                        <div className="md:col-span-5 space-y-2">
                                            <label className="text-xs font-bold text-gray-500">מתקן כושר *</label>
                                            <select
                                                {...register(`gymEquipment.${index}.equipmentId` as const, { required: true })}
                                                onChange={(e) => {
                                                    setValue(`gymEquipment.${index}.equipmentId`, e.target.value);
                                                    // Reset brand when equipment changes
                                                    setValue(`gymEquipment.${index}.brandName`, '');
                                                }}
                                                disabled={loadingGymEquipment}
                                                className="w-full p-2 bg-gray-50 rounded-lg border-2 border-transparent focus:border-blue-500 focus:bg-white outline-none disabled:opacity-50"
                                            >
                                                <option value="">בחר מתקן...</option>
                                                {gymEquipmentList.map((equipment) => (
                                                    <option key={equipment.id} value={equipment.id}>
                                                        {equipment.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className="md:col-span-5 space-y-2">
                                            <label className="text-xs font-bold text-gray-500">חברה (יצרן) *</label>
                                            <select
                                                {...register(`gymEquipment.${index}.brandName` as const, { required: true })}
                                                disabled={!selectedEquipment || loadingGymEquipment}
                                                className="w-full p-2 bg-gray-50 rounded-lg border-2 border-transparent focus:border-blue-500 focus:bg-white outline-none disabled:opacity-50"
                                            >
                                                <option value="">בחר חברה...</option>
                                                {availableBrands.map((brand) => (
                                                    <option key={brand.brandName} value={brand.brandName}>
                                                        {brand.brandName}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* Brand Preview */}
                                        {selectedEquipment && brandName && (
                                            <div className="md:col-span-12 mt-2">
                                                {(() => {
                                                    const selectedBrand = availableBrands.find(b => b.brandName === brandName);
                                                    return selectedBrand?.imageUrl ? (
                                                        <div className="relative w-full h-32 rounded-lg overflow-hidden bg-gray-100 border border-gray-200">
                                                            <img
                                                                src={selectedBrand.imageUrl}
                                                                alt={selectedBrand.brandName}
                                                                className="w-full h-full object-cover"
                                                                onError={(e) => {
                                                                    (e.target as HTMLImageElement).style.display = 'none';
                                                                }}
                                                            />
                                                        </div>
                                                    ) : null;
                                                })()}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {gymEquipmentFields.length === 0 && (
                        <div className="text-center py-10 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
                            <p className="text-gray-400">טרם נוספו מתקנים קבועים לפארק זה</p>
                            <button
                                type="button"
                                onClick={() => appendGymEquipment({ equipmentId: '', brandName: '' })}
                                disabled={loadingGymEquipment}
                                className="mt-2 text-blue-600 font-bold hover:underline disabled:opacity-50"
                            >
                                הוסף את המתקן הראשון
                            </button>
                        </div>
                    )}
                </div>
            </form>

            {/* Progress Overlay */}
            {isSubmitting && uploadProgress && (
                <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-black/80 text-white px-6 py-3 rounded-full shadow-2xl backdrop-blur-md flex items-center gap-3 z-50 animate-in slide-in-from-bottom-5">
                    <Loader2 className="animate-spin" size={20} />
                    <span className="font-bold">{uploadProgress}</span>
                </div>
            )}
        </div>
    );
}

export default function AddParkPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <Loader2 className="w-12 h-12 text-cyan-600 animate-spin" />
            </div>
        }>
            <AddParkPageContent />
        </Suspense>
    );
}