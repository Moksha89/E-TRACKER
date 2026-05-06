import 'react-native-gesture-handler';
import { useEffect, useState } from 'react';
import { Provider as PaperProvider } from 'react-native-paper';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { Provider as ReduxProvider, useSelector } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import * as LocalAuthentication from 'expo-local-authentication';

import { configureClient } from '@/api/client';
import { BrandedSplash } from '@/components/BrandedSplash';
import '@/i18n';
import type { RootState } from '@/state/store';
import { persistor, store } from '@/state/store';
import { theme } from '@/theme';

function BiometricGate({ children }: { children: React.ReactNode }) {
  const enabled = useSelector<RootState, boolean>((s) => s.settings.biometricLock);
  const token = useSelector<RootState, string | null>((s) => s.auth.accessToken);
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    if (!enabled || !token) {
      setUnlocked(true);
      return;
    }
    setUnlocked(false);
    void (async () => {
      const has = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!has || !enrolled) {
        setUnlocked(true);
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock SVE Expenses',
        disableDeviceFallback: false,
      });
      setUnlocked(result.success);
    })();
  }, [enabled, token]);

  if (!unlocked) {
    return <BrandedSplash label="Tap to unlock" />;
  }
  return <>{children}</>;
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    configureClient(store);
    setReady(true);
  }, []);

  if (!ready) {
    return <BrandedSplash label="Loading…" />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ReduxProvider store={store}>
        <PersistGate loading={<BrandedSplash label="Restoring session…" />} persistor={persistor}>
          <BiometricGate>
            <PaperProvider theme={theme}>
              <Stack screenOptions={{ headerShown: false }} />
            </PaperProvider>
          </BiometricGate>
        </PersistGate>
      </ReduxProvider>
    </GestureHandlerRootView>
  );
}
