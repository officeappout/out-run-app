import type { CSSProperties } from 'react';

/** Dark checkerboard = "this is transparent" (sticker previews, SH-5). */
export const CHECKER_STYLE: CSSProperties = {
  backgroundColor: '#2f3b45',
  backgroundImage:
    'linear-gradient(45deg,#3d4a55 25%,transparent 25%),linear-gradient(-45deg,#3d4a55 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#3d4a55 75%),linear-gradient(-45deg,transparent 75%,#3d4a55 75%)',
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0,0 8px,8px -8px,-8px 0',
};
