'use client';

/**
 * Opens the Kelly chat over the current screen with a context line in the composer (the user's
 * own words, never auto-sent) — the same overlay the week builder's chip uses, without builder
 * mode. Renders only the trigger, and nothing at all without Kelly AI (useAiCoachAccess).
 * Used by the post-workout insights (enable_workout_insights_v1): the AI-star in the green card.
 */
import { useState, type ReactNode } from 'react';
import { useUserStore } from '@/features/user';
import { useAiCoachAccess } from '../hooks/useAiCoachAccess';
import { useKellyChatConfig } from '../hooks/useKellyChatConfig';
import AiCoachChat from './AiCoachChat';

/** The chat overlay alone — for callers that open it from their own trigger (the method "i" sheet's chips). */
export function KellyChatOverlay({ initialInput, onClose }: { initialInput: string; onClose: () => void }) {
  const { profile } = useUserStore();
  const cfg = useKellyChatConfig();
  if (!profile || cfg.loading || !cfg.canUseAi) return null;
  return (
    <AiCoachChat
      profile={profile}
      onClose={onClose}
      unified={cfg.unified}
      phase2={cfg.phase2}
      weatherOn={cfg.weatherOn}
      proactive={cfg.unified && cfg.proactive}
      memory={cfg.memory}
      round4={cfg.round4}
      runsByType={cfg.runsByType}
      initialInput={initialInput}
    />
  );
}

export interface KellyChatLauncherProps {
  /** The composer's opening text, computed when the trigger is tapped. */
  contextOf: () => string;
  children: (open: () => void) => ReactNode;
}

export default function KellyChatLauncher({ contextOf, children }: KellyChatLauncherProps) {
  const { canUseAi } = useAiCoachAccess();
  const [open, setOpen] = useState<string | null>(null);
  if (!canUseAi) return null;
  return (
    <>
      {children(() => setOpen(contextOf()))}
      {open != null && <KellyChatOverlay initialInput={open} onClose={() => setOpen(null)} />}
    </>
  );
}
