/**
 * /embed/* — layout for routes meant to be rendered inside an external
 * <iframe> (e.g. the marketing site). Deliberately a bare pass-through:
 * globals.css/Tailwind already cascade from the root layout
 * (src/app/layout.tsx), so nothing needs to be re-imported here.
 *
 * The actual app-chrome suppression (bottom nav, chat, activity panel,
 * global overlays) happens in ClientLayout via its '/embed' route check —
 * ClientLayout wraps every route from the root layout, so a nested layout
 * here cannot itself opt out of it.
 */
export default function EmbedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
