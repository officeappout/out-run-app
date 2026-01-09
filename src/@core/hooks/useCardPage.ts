export default function useCardPage(type: 'park' | 'device', id: string) {
  // כרגע מחזיר נתיב בסיסי, בעתיד זה יתחבר לדפים האמיתיים שלהם
  return {
    href: `/${type}/${id}`
  };
}