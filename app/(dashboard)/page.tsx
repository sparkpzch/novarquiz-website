import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { getSessionUser } from '@/lib/auth';

export default async function HomePage() {
  await connection();
  const user = await getSessionUser();
  redirect(user?.isAdmin ? '/admin' : '/quizzes');
}
