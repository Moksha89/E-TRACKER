import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';

import { useAppSelector } from '@/state/hooks';

export default function AppLayout() {
  const router = useRouter();
  const token = useAppSelector((s) => s.auth.accessToken);

  useEffect(() => {
    if (!token) {
      router.replace('/(auth)/login');
    }
  }, [token, router]);

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#16A34A' },
        headerTintColor: '#fff',
      }}
    >
      <Stack.Screen name="businesses" options={{ title: 'Businesses' }} />
      <Stack.Screen name="businesses-new" options={{ title: 'New business', presentation: 'modal' }} />
      <Stack.Screen name="books" options={{ title: 'Books' }} />
      <Stack.Screen name="books-new" options={{ title: 'New book', presentation: 'modal' }} />
      <Stack.Screen name="book/[bookId]" options={{ title: 'Book' }} />
      <Stack.Screen name="book/[bookId]/entry-new" options={{ title: 'New entry', presentation: 'modal' }} />
      <Stack.Screen name="members" options={{ title: 'Members' }} />
      <Stack.Screen name="members-invite" options={{ title: 'Invite member', presentation: 'modal' }} />
      <Stack.Screen name="reports" options={{ title: 'Reports' }} />
    </Stack>
  );
}
