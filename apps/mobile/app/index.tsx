import { Redirect } from 'expo-router';

import { useAppSelector } from '@/state/hooks';

export default function Index() {
  const token = useAppSelector((s) => s.auth.accessToken);
  if (!token) return <Redirect href="/(auth)/login" />;
  return <Redirect href="/(app)/businesses" />;
}
