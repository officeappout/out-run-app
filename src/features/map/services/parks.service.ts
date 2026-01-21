import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';

export const fetchRealParks = async () => {
    try {
        console.log("📡 מושך פארקים מה-Database...");
        const querySnapshot = await getDocs(collection(db, 'parks'));
        
        // המרה של המסמכים למבנה שהמפה מבינה
        const parks = querySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                name: data.name,
                location: data.location, // { lat, lng }
                city: data.city,
                facilities: data.facilities || [],
                // אם המפה מצפה לשדות מסוימים מה-Mock, נוודא שהם קיימים
                type: 'park', 
                rating: 5 
            };
        });
        
        console.log(`✅ נמצאו ${parks.length} פארקים אמיתיים!`);
        return parks;
    } catch (error) {
        console.error("❌ שגיאה במשיכת פארקים:", error);
        return [];
    }
};