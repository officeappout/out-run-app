/**
 * API Route: List available SVG icons for equipment
 * GET /api/admin/equipment-icons
 *
 * Scans /public/assets/icons/equipment/ on the server filesystem and returns
 * every .svg filename as a { slug, label } entry.
 * Admin forms use this to auto-populate the icon picker — no manual constant needed.
 */

import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

export const dynamic = 'force-dynamic';

export interface EquipmentIconEntry {
  slug: string;  // filename stem, e.g. "pullupbar_park"
  label: string; // human-readable, e.g. "Pullupbar Park"
}

/** Convert a slug like "yoga_block" or "pullup-bar" to "Yoga Block". */
function slugToLabel(slug: string): string {
  return slug
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function GET() {
  const dir = path.join(process.cwd(), 'public', 'assets', 'icons', 'equipment');

  let files: string[] = [];
  try {
    files = fs.readdirSync(dir);
  } catch {
    // Directory missing — return empty list gracefully
    return NextResponse.json([]);
  }

  const icons: EquipmentIconEntry[] = files
    .filter((f) => f.toLowerCase().endsWith('.svg'))
    .map((f) => {
      const slug = f.replace(/\.svg$/i, '');
      return { slug, label: slugToLabel(slug) };
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));

  return NextResponse.json(icons);
}
