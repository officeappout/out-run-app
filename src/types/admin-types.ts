// Park types have been moved to @/features/parks
// Re-exporting for backward compatibility
export type { Park, ParkFacility, ParkFacilityType, ParkAmenities, ParkStatus, ParkFacilityCategory, ParkSportType, ParkFeatureTag, NatureType, CommunityType, UrbanType, StairsDetails, BenchDetails, ParkingDetails, ParkingPaymentType, RouteTerrainType, RouteEnvironment } from '@/features/parks';
export { FACILITY_SPORT_MAPPING, ROUTE_SUB_SPORT_MAPPING, getAutoSportTypes } from '@/features/parks';

export type AuthorityType = 'city' | 'regional_council' | 'local_council' | 'neighborhood' | 'settlement';

// CRM Contact Roles
export type ContactRole = 'sports_head' | 'ceo' | 'health_coordinator' | 'technical' | 'other';

// CRM Pipeline Status for Sales Tracking
// 'draft' = Database-only entities that are NOT counted as active leads or in conversion metrics
export type PipelineStatus = 'draft' | 'lead' | 'meeting' | 'quote' | 'follow_up' | 'closing' | 'active' | 'upsell';

// Task Status for CRM Task Management
export type TaskStatus = 'pending' | 'in_progress' | 'done' | 'cancelled';

// Contact Person Interface
export interface AuthorityContact {
  id: string;
  name: string;
  role: ContactRole;
  phone?: string;
  email?: string;
  isPrimary: boolean;
  notes?: string;
  createdAt?: Date;
}

// Activity Log Entry
export interface ActivityLogEntry {
  id: string;
  content: string;
  createdAt: Date;
  createdBy?: string; // Admin ID who created the entry
  createdByName?: string; // Admin name
}

// CRM Task
export interface AuthorityTask {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  dueDate?: Date;
  assignedTo?: string; // Team member ID
  assignedToName?: string; // Team member name
  createdAt: Date;
  completedAt?: Date;
}

// Financial Installment Status
export type InstallmentStatus = 'pending' | 'paid';

// Payment Installment
export interface Installment {
  id: string;
  amount: number;
  targetMonth: string; // Format: "YYYY-MM" (e.g., "2026-03")
  status: InstallmentStatus;
}

// Authority Financials
export interface AuthorityFinancials {
  totalQuoteAmount: number;
  installments: Installment[];
}

export interface Authority {
    id: string;
    name: string;           // Authority/City name
    type: AuthorityType;    // Type: city, regional_council, local_council
    parentAuthorityId?: string; // For settlements (Kibbutzim/Moshavim) - links to parent Regional Council
    logoUrl?: string;      // URL for the authority's logo
    managerIds: string[];  // List of user IDs assigned as health coordinators/managers
    userCount: number;     // Count of users associated with this authority
    status?: 'active' | 'inactive'; // Active if parks exist, Inactive if not yet mapped
    isActiveClient?: boolean; // Whether this authority is an active paying client (לקוח פעיל)
    coordinates?: { lat: number; lng: number }; // City center coordinates for map display
    
    // CRM Fields
    contacts?: AuthorityContact[];      // Multi-contact support
    pipelineStatus?: PipelineStatus;    // Sales pipeline status
    activityLog?: ActivityLogEntry[];   // Meeting notes and updates
    tasks?: AuthorityTask[];            // Task tracking with assignments
    financials?: AuthorityFinancials;   // Financial tracking with installments
    
    createdAt?: Date;
    updatedAt?: Date;
}

// Helper to get contact role label in Hebrew
export const CONTACT_ROLE_LABELS: Record<ContactRole, string> = {
  sports_head: 'מנהל ספורט',
  ceo: 'מנכ"ל',
  health_coordinator: 'רכז בריאות',
  technical: 'איש טכני',
  other: 'אחר',
};

// Helper to get pipeline status label in Hebrew
export const PIPELINE_STATUS_LABELS: Record<PipelineStatus, string> = {
  draft: 'טיוטה / מאגר',
  lead: 'ליד חדש',
  meeting: 'פגישה',
  quote: 'הצעת מחיר',
  follow_up: 'מעקב',
  closing: 'סגירה',
  active: 'לקוח פעיל',
  upsell: 'הרחבה',
};

// Pipeline status colors for UI
export const PIPELINE_STATUS_COLORS: Record<PipelineStatus, { bg: string; text: string; border: string }> = {
  draft: { bg: 'bg-slate-100', text: 'text-slate-500', border: 'border-slate-300' },
  lead: { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-300' },
  meeting: { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300' },
  quote: { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-300' },
  follow_up: { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-400' },
  closing: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-400' },
  active: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-400' },
  upsell: { bg: 'bg-cyan-100', text: 'text-cyan-700', border: 'border-cyan-400' },
};

// Task status labels
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pending: 'ממתין',
  in_progress: 'בתהליך',
  done: 'הושלם',
  cancelled: 'בוטל',
};

// Urgent statuses that should appear at the top of lists
export const URGENT_PIPELINE_STATUSES: PipelineStatus[] = ['follow_up', 'closing'];

// Helper to check if authority has overdue tasks
export function hasOverdueTasks(authority: Authority): boolean {
  if (!authority.tasks) return false;
  const now = new Date();
  return authority.tasks.some(
    task => task.status !== 'done' && task.status !== 'cancelled' && task.dueDate && new Date(task.dueDate) < now
  );
}

// Helper to get primary contact from authority
export function getPrimaryContact(authority: Authority): AuthorityContact | undefined {
  if (!authority.contacts || authority.contacts.length === 0) return undefined;
  return authority.contacts.find(c => c.isPrimary) || authority.contacts[0];
}

// Helper to check if authority has overdue installments
export function hasOverdueInstallments(authority: Authority): boolean {
  if (!authority.financials?.installments) return false;
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return authority.financials.installments.some(
    inst => inst.status === 'pending' && inst.targetMonth < currentMonth
  );
}

// Helper to get sum of installments
export function getInstallmentsSum(installments: Installment[]): number {
  return installments.reduce((sum, inst) => sum + inst.amount, 0);
}

// Helper to format month string to Hebrew
export function formatMonthHebrew(monthStr: string): string {
  const [year, month] = monthStr.split('-');
  const monthNames = [
    'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
    'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'
  ];
  const monthIndex = parseInt(month, 10) - 1;
  return `${monthNames[monthIndex]} ${year}`;
}

// Helper to generate month options for picker
export function generateMonthOptions(count: number = 12): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    options.push({ value, label: formatMonthHebrew(value) });
  }
  return options;
}

// Installment status labels
export const INSTALLMENT_STATUS_LABELS: Record<InstallmentStatus, string> = {
  pending: 'ממתין',
  paid: 'שולם',
};
