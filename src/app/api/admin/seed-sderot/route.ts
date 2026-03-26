import { NextResponse } from 'next/server';
import { seedSderotDemo } from '@/features/admin/services/seed-sderot-demo';

export async function POST() {
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
