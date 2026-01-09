import { MapPark } from '@/features/map/types/map-objects.type';

export default interface ParkWithDistance extends MapPark {
  distance: number; // המרחק מהמשתמש במטרים
}