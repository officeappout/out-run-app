import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/api-auth';
import { seedSderotDemo } from '@/features/admin/services/seed-sderot-demo';

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  try {
    const result = await seedSderotDemo();
    if (result.success) {
      return NextResponse.json({ ok: true, message: result.message });
    }
    return NextResponse.json({ ok: false, message: result.message }, { status: 500 });
  } catch (error: any) {
    return NextResponse.json({ ok: false, message: error?.message ?? 'Unknown error' }, { status: 500 });
  }
}
