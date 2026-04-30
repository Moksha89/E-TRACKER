import { Stack } from 'expo-router';

import { headerOptions } from '@/theme';

export default function AuthLayout() {
  return (
    <Stack screenOptions={headerOptions}>
      <Stack.Screen name="login" options={{ title: 'Sign in' }} />
      <Stack.Screen name="signup" options={{ title: 'Create account' }} />
    </Stack>
  );
}
