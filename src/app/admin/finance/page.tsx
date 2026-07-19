import { redirect } from 'next/navigation';

// /admin/finance → the approval queue (David's priority screen).
export default function FinanceIndexPage() {
  redirect('/admin/finance/approvals');
}
