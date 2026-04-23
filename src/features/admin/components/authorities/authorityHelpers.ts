import { AuthorityType } from '@/types/admin-types';

export function getTypeLabel(type: AuthorityType): string {
  switch (type) {
    case 'regional_council':
      return 'מועצה אזורית';
    case 'local_council':
      return 'מועצה מקומית';
    case 'city':
      return 'עירייה';
    case 'neighborhood':
      return 'שכונה';
    case 'settlement':
      return 'יישוב';
    case 'school':
      return 'מוסד חינוכי';
    case 'military_unit':
      return 'יחידה צבאית';
    default:
      return type;
  }
}

export function getTypeColor(type: AuthorityType): string {
  switch (type) {
    case 'regional_council':
      return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'local_council':
      return 'bg-green-100 text-green-700 border-green-200';
    case 'city':
      return 'bg-purple-100 text-purple-700 border-purple-200';
    case 'neighborhood':
      return 'bg-orange-100 text-orange-800 border-orange-300';
    case 'settlement':
      return 'bg-teal-100 text-teal-800 border-teal-300';
    case 'school':
      return 'bg-amber-100 text-amber-700 border-amber-300';
    case 'military_unit':
      return 'bg-red-100 text-red-700 border-red-300';
    default:
      return 'bg-gray-100 text-gray-700 border-gray-200';
  }
}
