import { MapPark } from '../types/map-objects.type';

export const MOCK_PARKS: MapPark[] = [
  {
    id: 'p1',
    name: 'פארק הירקון - מתחם כושר ראשי',
    city: 'תל אביב',
    address: 'שדרות רוקח',
    
    // מיקום כפול לתמיכה בקוד ישן וחדש
    lat: 32.0945,
    lng: 34.7990,
    location: {
      lat: 32.0945,
      lng: 34.7990
    },

    // דירוגים ומאפיינים (לאלגוריתם)
    rating: 4.8,
    adminQualityScore: 9,
    hasDogPark: true,
    hasWaterFountain: true,
    hasLights: true,
    isShaded: true,
    
    description: 'מתחם כושר גדול ומקצועי עם מגוון רחב של מתקנים, מוצל ברובו ומתאים לאימוני כוח ואירובי.',
    imageUrl: 'https://images.unsplash.com/photo-1571902943202-507ec2618e8f', // תמונה לדוגמה
    
    devices: [
      {
        id: 'd1',
        name: 'מתח גבוה',
        mainMuscle: 'back',
        secondaryMuscles: ['biceps'],
        type: 'static',
        workoutType: 'reps',
        difficultyLevel: 3,     // החדש
        recommendedLevel: 3,    // הישן (לתמיכה לאחור)
        isFunctional: true,
        manufacturer: 'urbanix'
      },
      {
        id: 'd2',
        name: 'מקבילים',
        mainMuscle: 'chest',
        secondaryMuscles: ['triceps'],
        type: 'static',
        workoutType: 'reps',
        difficultyLevel: 2,
        recommendedLevel: 2,
        isFunctional: true,
        manufacturer: 'urbanix'
      },
      {
        id: 'd3',
        name: 'סולם שוודי',
        mainMuscle: 'core',
        secondaryMuscles: ['abs'],
        type: 'static',
        difficultyLevel: 1,
        recommendedLevel: 1,
        isFunctional: true
      },
      {
        id: 'd4',
        name: 'מתקן לחיצת חזה',
        mainMuscle: 'chest',
        type: 'hydraulic', // מתקן הידראולי בטוח למתחילים
        difficultyLevel: 1,
        recommendedLevel: 1,
        isFunctional: false,
        manufacturer: 'other'
      }
    ],
    availableWorkouts: []
  },
  {
    id: 'p2',
    name: 'גן העצמאות',
    city: 'תל אביב',
    address: 'רחוב הירקון',
    
    lat: 32.0900,
    lng: 34.7700,
    location: {
      lat: 32.0900,
      lng: 34.7700
    },

    rating: 4.2,
    adminQualityScore: 7,
    hasDogPark: false,
    hasWaterFountain: true,
    hasLights: true,
    isShaded: false, // לא מוצל
    
    description: 'מתחם כושר מול הים, נוף מדהים אבל חשוף לשמש.',
    imageUrl: 'https://images.unsplash.com/photo-1526506118085-60ce8714f8c5',
    
    devices: [
      {
        id: 'd5',
        name: 'מתח נמוך / אוסטרלי',
        mainMuscle: 'back',
        type: 'static',
        difficultyLevel: 1,
        recommendedLevel: 1,
        isFunctional: true
      },
      {
        id: 'd6',
        name: 'במת בטן',
        mainMuscle: 'abs',
        type: 'static',
        difficultyLevel: 1,
        recommendedLevel: 1,
        isFunctional: false
      }
    ],
    availableWorkouts: []
  }
];