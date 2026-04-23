import { ImageResponse } from 'next/og';
import { fetchSharedWorkoutMeta } from './shared-workout-loader';

export const runtime = 'edge';
export const alt = 'Out — Workout Preview';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const DIFFICULTY_HE: Record<number, string> = { 1: 'קל', 2: 'בינוני', 3: 'קשה' };

const MUSCLE_HE: Record<string, string> = {
  chest: 'חזה', back: 'גב', shoulders: 'כתפיים', biceps: 'ביצפס',
  triceps: 'טרייצפס', core: 'ליבה', abs: 'בטן', quads: 'ארבע ראשי',
  hamstrings: 'אחורי ירך', glutes: 'ישבן', calves: 'שוקיים',
  legs: 'רגליים', forearms: 'אמות', lats: 'גב רחב',
  upper_back: 'גב עליון', lower_back: 'גב תחתון', full_body: 'כל הגוף',
  obliques: 'אלכסוניים', traps: 'טרפז', hip_flexors: 'כופפי ירך',
};

export default async function OGImage({ params }: { params: { id: string } }) {
  const meta = await fetchSharedWorkoutMeta(params.id);

  const title = meta?.title || 'אימון כוח';
  const diffLabel = meta ? (DIFFICULTY_HE[meta.difficulty] || 'בינוני') : 'בינוני';
  const duration = meta?.estimatedDuration || 0;
  const exerciseCount = meta?.exerciseCount || 0;
  const muscles = (meta?.muscles || [])
    .slice(0, 4)
    .map((m) => MUSCLE_HE[m] || m);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '60px 64px',
          background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #16213e 100%)',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Top Row: Logo + Badge */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          {/* Brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #0CF2E3, #00BAF7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
                fontWeight: 800,
                color: '#000',
              }}
            >
              O
            </div>
            <span style={{ fontSize: '28px', fontWeight: 700, color: '#ffffff' }}>Out</span>
          </div>

          {/* Difficulty badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'rgba(255,255,255,0.1)',
              borderRadius: '100px',
              padding: '10px 24px',
              border: '1px solid rgba(255,255,255,0.15)',
            }}
          >
            <div style={{ display: 'flex', gap: '4px' }}>
              {[1, 2, 3].map((n) => (
                <svg key={n} width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"
                    fill={n <= (meta?.difficulty || 2) ? '#0CF2E3' : 'rgba(255,255,255,0.2)'}
                  />
                </svg>
              ))}
            </div>
            <span style={{ fontSize: '18px', color: '#ffffff', fontWeight: 600 }}>{diffLabel}</span>
          </div>
        </div>

        {/* Center: Title */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <span
            style={{
              fontSize: '16px',
              fontWeight: 600,
              color: '#0CF2E3',
              textTransform: 'uppercase',
              letterSpacing: '2px',
            }}
          >
            SHARED WORKOUT
          </span>
          <span
            style={{
              fontSize: '52px',
              fontWeight: 800,
              color: '#ffffff',
              lineHeight: 1.15,
              direction: 'rtl',
              maxWidth: '900px',
            }}
          >
            {title}
          </span>
        </div>

        {/* Bottom Row: Stats + Muscles */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          {/* Stats pills */}
          <div style={{ display: 'flex', gap: '16px' }}>
            {duration > 0 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'rgba(255,255,255,0.08)',
                  borderRadius: '12px',
                  padding: '12px 20px',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0CF2E3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <span style={{ fontSize: '20px', color: '#ffffff', fontWeight: 600 }}>{duration} דק׳</span>
              </div>
            )}
            {exerciseCount > 0 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'rgba(255,255,255,0.08)',
                  borderRadius: '12px',
                  padding: '12px 20px',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0CF2E3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 5v14" /><path d="M18 5v14" />
                  <path d="M6 12h12" /><path d="M2 8h4" /><path d="M2 16h4" />
                  <path d="M18 8h4" /><path d="M18 16h4" />
                </svg>
                <span style={{ fontSize: '20px', color: '#ffffff', fontWeight: 600 }}>{exerciseCount} תרגילים</span>
              </div>
            )}
          </div>

          {/* Muscle tags */}
          {muscles.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', direction: 'rtl' }}>
              {muscles.map((m) => (
                <span
                  key={m}
                  style={{
                    fontSize: '16px',
                    color: 'rgba(255,255,255,0.6)',
                    background: 'rgba(255,255,255,0.06)',
                    borderRadius: '8px',
                    padding: '8px 16px',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  {m}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
