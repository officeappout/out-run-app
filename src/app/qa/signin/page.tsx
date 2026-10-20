import QaSigninClient from './QaSigninClient';

/**
 * /qa/signin — AI tester sign-in (agent-briefs/ai-testers-design.md §2.4, owner-approved
 * 20.10.2026). Used only by the tester runner (scripts/qa). Refuses anything that is not a
 * `demo_qa_*` tester token while enable_demo_users && enable_ai_testers are on.
 */
export const metadata = {
  title: 'OUT',
  robots: { index: false, follow: false },
};

export default function QaSigninPage() {
  return <QaSigninClient />;
}
