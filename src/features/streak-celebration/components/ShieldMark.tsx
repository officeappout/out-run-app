/** The streak shield (ST-4) — white with the brand-cyan outline, optional check. */
export default function ShieldMark({ size = 84, check = true }: { size?: number; check?: boolean }) {
  return (
    <svg width={size} height={size * (28 / 24)} viewBox="0 0 24 28" aria-hidden>
      <path
        d="M12 1.5 21.5 5v8.2c0 6.2-4.1 10.8-9.5 13.3C6.6 24 2.5 19.4 2.5 13.2V5z"
        fill={check ? '#ffffff' : '#eef8fc'}
        stroke="#00baf7"
        strokeWidth={check ? 2.2 : 2.4}
        strokeLinejoin="round"
      />
      {check && (
        <path d="m7.8 13.6 3 3 5.6-6" fill="none" stroke="#0284c7" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}
