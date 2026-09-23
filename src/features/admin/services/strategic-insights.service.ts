/**
 * Strategic Insights — response shapes.
 *
 * The three functions that used to live here (getHealthWakeUpMetric,
 * getEquipmentGapAnalysis, getSleepyNeighborhoods) were deleted 23.09.2026
 * (00-MASTER-PLAN.md §13.11 P1) — each opened with an unfiltered
 * getDocs(collection(db,'users')) and filtered authorityId in memory
 * AFTER the read, so the scoping was client-supplied and optional, not
 * enforced; the only real gate was firestore.rules. Replaced by
 * /api/admin/insights-summary, which resolves role/scope server-side from
 * the verified ID token — see src/lib/adminAnalyticsScope.ts.
 *
 * The three interfaces below are kept: HealthWakeUpChart.tsx,
 * EquipmentGapAnalysis.tsx, and SleepyNeighborhoodsList.tsx still import
 * them to describe the new route's response shape, which is identical.
 */

/**
 * Health Wake-Up Metric
 * Count users who were inactive (historyFrequency: "none" or "low") but are now active (> 1 workout)
 */
export interface HealthWakeUpMetric {
  totalInactiveUsers: number; // Users with historyFrequency "none" or "low"
  nowActiveUsers: number; // Inactive users who completed > 1 workout
  successRate: number; // Percentage of inactive users who became active
}

/**
 * Equipment Gap Analysis
 * Analyzes equipment demand vs availability by neighborhood
 */
export interface EquipmentGap {
  neighborhoodId: string;
  neighborhoodName: string;
  cityName: string;
  equipmentDemand: {
    equipmentId: string;
    equipmentName: string;
    userCount: number;
  }[];
  availableFacilities: string[]; // From parks in that neighborhood
}

/**
 * Sleepy Neighborhoods
 * Neighborhoods with high population potential but low user engagement
 */
export interface SleepyNeighborhood {
  neighborhoodId: string;
  neighborhoodName: string;
  cityName: string;
  userCount: number;
  populationEstimate?: number; // If available from authorities.userCount
  penetrationRate: number; // Users per estimated population (if available)
  parksCount: number;
}
