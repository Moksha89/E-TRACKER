import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';

import { registerDevice } from '@/api/endpoints';
import { useAppDispatch, useAppSelector } from '@/state/hooks';
import { setPushTokenSent } from '@/state/settings';

export default function AppLayout() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const token = useAppSelector((s) => s.auth.accessToken);
  const sentToken = useAppSelector((s) => s.settings.pushTokenSent);

  useEffect(() => {
    if (!token) {
      router.replace('/(auth)/login');
    }
  }, [token, router]);

  useEffect(() => {
    if (!token) return;
    void (async () => {
      try {
        const perms = await Notifications.getPermissionsAsync();
        let granted = perms.status === 'granted';
        if (!granted) {
          const ask = await Notifications.requestPermissionsAsync();
          granted = ask.status === 'granted';
        }
        if (!granted) return;
        const t = await Notifications.getExpoPushTokenAsync();
        if (t?.data && t.data !== sentToken) {
          await registerDevice({
            expo_push_token: t.data,
            platform: Platform.OS,
            locale: 'en',
          });
          dispatch(setPushTokenSent(t.data));
        }
      } catch {
        // best-effort; don't block app on push registration
      }
    })();
  }, [token, sentToken, dispatch]);

  // Each screen renders its own Paper Appbar.Header, so the Stack header is
  // hidden globally to avoid the duplicate-header issue.
  return <Stack screenOptions={{ headerShown: false }} />;
}
