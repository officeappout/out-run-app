import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/api-auth';
import { getAllAuthorities } from '@/features/admin/services/authority.service';

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const authorities = await getAllAuthorities();
  return NextResponse.json(authorities);
}
