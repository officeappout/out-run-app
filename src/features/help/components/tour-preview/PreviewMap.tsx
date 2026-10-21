/**
 * A static, drawn map background for the tour previews (no Mapbox, no location): soft blocks,
 * two streets and an optional dashed route. Decorative only (aria-hidden).
 */
export default function PreviewMap({ route = false }: { route?: boolean }) {
  return (
    <svg aria-hidden className="absolute inset-0 h-full w-full" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice">
      <rect width="390" height="844" fill="#eef3ee" />
      <rect x="24" y="120" width="150" height="180" rx="18" fill="#dcebd9" />
      <rect x="220" y="360" width="140" height="160" rx="18" fill="#dcebd9" />
      <rect x="40" y="560" width="120" height="120" rx="18" fill="#e4ece8" />
      <path d="M-10 330 C 120 300, 240 360, 400 320" stroke="#ffffff" strokeWidth="22" fill="none" />
      <path d="M200 -10 C 180 200, 230 500, 190 860" stroke="#ffffff" strokeWidth="18" fill="none" />
      {route && (
        <path
          d="M90 520 C 120 420, 170 380, 205 330 S 290 230, 300 170"
          stroke="#00baf7"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray="2 14"
          fill="none"
        />
      )}
    </svg>
  );
}
