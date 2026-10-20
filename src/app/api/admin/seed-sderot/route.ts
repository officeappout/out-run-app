import { NextResponse } from 'next/server';
import { LEGACY_DEMO_TOOL_DISABLED_MESSAGE } from '@/features/admin/components/legacy-demo/legacy-demo';

// Old demo seeder endpoint — disabled by the owner (20.10.2026). Writes nothing.
export async function POST() {
  return NextResponse.json({ ok: false, message: LEGACY_DEMO_TOOL_DISABLED_MESSAGE }, { status: 410 });
}
