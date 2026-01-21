import { Park } from '../../core/types/park.types';

export default interface ParkWithDistance extends Park {
  distance: number; // המרחק מהמשתמש במטרים
}