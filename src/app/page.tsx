import { redirect } from 'next/navigation';

export default function RootPage() {
  // ברגע שמישהו נכנס לכתובת הראשית, הוא מועבר מיד לדף הבית
  redirect('/home');
}