/**
 * Date Formatter Utility (SSR Safe)
 * Handles Firebase Timestamps and various date formats
 */

/**
 * Safely converts Firebase Timestamp to Date object
 */
function convertTimestampToDate(timestamp: any): Date | null {
  if (!timestamp) return null;
  
  // If it's already a Date object
  if (timestamp instanceof Date) return timestamp;
  
  // If it's a Firebase Timestamp (has toDate method)
  if (timestamp && typeof timestamp.toDate === 'function') {
    return timestamp.toDate();
  }
  
  // If it has seconds property (Firebase Timestamp structure)
  if (timestamp && typeof timestamp.seconds === 'number') {
    return new Date(timestamp.seconds * 1000);
  }
  
  // If it has _seconds property (alternative Firebase Timestamp structure)
  if (timestamp && typeof (timestamp as any)._seconds === 'number') {
    return new Date((timestamp as any)._seconds * 1000);
  }
  
  // If it's a number (Unix timestamp in seconds or milliseconds)
  if (typeof timestamp === 'number') {
    // If it's in seconds (less than year 2000 in milliseconds), convert to milliseconds
    return new Date(timestamp < 946684800000 ? timestamp * 1000 : timestamp);
  }
  
  return null;
}

/**
 * Formats a Firebase Timestamp or Date to DD/MM/YYYY HH:mm format
 * Returns "N/A" if timestamp is null or invalid
 * 
 * @param timestamp - Firebase Timestamp, Date object, or null
 * @returns Formatted date string or "N/A"
 */
export function formatFirebaseTimestamp(timestamp: any): string {
  const date = convertTimestampToDate(timestamp);
  
  if (!date || isNaN(date.getTime())) {
    return 'N/A';
  }
  
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

/**
 * Formats a date to Hebrew locale format (DD/MM/YYYY)
 */
export function formatDateHebrew(date: Date | null | undefined): string {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    return 'N/A';
  }
  
  return date.toLocaleDateString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Formats a date to Hebrew locale with time (DD/MM/YYYY HH:mm)
 */
export function formatDateTimeHebrew(date: Date | null | undefined): string {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    return 'N/A';
  }
  
  return date.toLocaleString('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Gets relative time string (e.g., "2 hours ago", "3 days ago")
 */
export function getRelativeTime(timestamp: any): string {
  const date = convertTimestampToDate(timestamp);
  
  if (!date || isNaN(date.getTime())) {
    return 'N/A';
  }
  
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'עכשיו';
  if (diffMins < 60) return `לפני ${diffMins} דקות`;
  if (diffHours < 24) return `לפני ${diffHours} שעות`;
  if (diffDays < 7) return `לפני ${diffDays} ימים`;
  
  return formatDateHebrew(date);
}
