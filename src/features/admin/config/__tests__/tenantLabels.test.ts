import { describe, it, expect } from 'vitest';
import { TENANT_LABELS, getTenantLabels } from '../tenantLabels';
import type { TenantType } from '@/types/admin-types';

const ALL_VERTICALS: TenantType[] = ['municipal', 'military', 'educational', 'company', 'youth_movement'];

describe('TENANT_LABELS — §13.40 new fields (managerTitle/managerSingular/teamTitle/orgSingular/orgPlural)', () => {
  it('every vertical has all five new fields populated with a non-empty string', () => {
    for (const vertical of ALL_VERTICALS) {
      const set = TENANT_LABELS[vertical];
      expect(set.managerTitle, `${vertical}.managerTitle`).toBeTruthy();
      expect(set.managerSingular, `${vertical}.managerSingular`).toBeTruthy();
      expect(set.teamTitle, `${vertical}.teamTitle`).toBeTruthy();
      expect(set.orgSingular, `${vertical}.orgSingular`).toBeTruthy();
      expect(set.orgPlural, `${vertical}.orgPlural`).toBeTruthy();
    }
  });

  it("military matches David's exact request: 'רכזים' → 'קצינים'", () => {
    expect(TENANT_LABELS.military.managerTitle).toBe('קצינים');
    expect(TENANT_LABELS.military.managerSingular).toBe('קצין');
  });

  it('municipal is untouched — same values a pre-13.40 caller would have assumed', () => {
    expect(TENANT_LABELS.municipal.managerTitle).toBe('רכזים');
    expect(TENANT_LABELS.municipal.managerSingular).toBe('רכז');
    expect(TENANT_LABELS.municipal.orgSingular).toBe('רשות');
    expect(TENANT_LABELS.municipal.orgPlural).toBe('רשויות');
  });

  it('getTenantLabels falls back to municipal for unknown/undefined input, same as before this slice', () => {
    expect(getTenantLabels(undefined).managerTitle).toBe('רכזים');
    expect(getTenantLabels('not-a-real-vertical').managerTitle).toBe('רכזים');
  });
});
