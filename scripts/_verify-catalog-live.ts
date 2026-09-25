/**
 * Verifies the pilot park now appears in the live, cache-bypassed
 * production catalog after the backfill.
 */
async function main() {
  const key = process.env.AGENT_API_KEY;
  if (!key) { console.error('AGENT_API_KEY missing'); process.exit(1); }

  const res = await fetch('https://outrun.co.il/api/catalog/parks?fresh=1', {
    headers: { 'X-Agent-Key': key },
  });
  console.log('status:', res.status);
  const data = await res.json();
  console.log('total entries:', Array.isArray(data) ? data.length : 'N/A');

  const targets = ['2t5az38z4tbMFJOSVBpp', 'rFxXF6Kf4AG260S3GX8F', 'R8jeVvPkLybCQUltPJN6'];
  for (const id of targets) {
    const match = Array.isArray(data) ? data.find((e: any) => e.id === id) : null;
    console.log(id, '→', match ? 'PRESENT' : 'ABSENT', match ? { facilityType: match.facilityType, isFunctional: match.isFunctional } : '');
  }
}

main().catch((err) => { console.error('failed:', err); process.exit(1); });
