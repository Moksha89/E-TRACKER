import 'react-native-gesture-handler';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Provider as PaperProvider, MD3LightTheme } from 'react-native-paper';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { Provider as ReduxProvider, useSelector } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import * as LocalAuthentication from 'expo-local-authentication';

import { configureClient } from '@/api/client';
import i18n, { setAppLocale, type SupportedLocale } from '@/i18n';
import type { RootState } from '@/state/store';
import { persistor, store } from '@/state/store';

const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#16A34A',
    secondary: '#0EA5E9',
  },
};

function I18nBridge({ children }: { children: React.ReactNode }) {
  const locale = useSelector<RootState, SupportedLocale>((s) => s.settings.locale);
  useEffect(() => {
    if (i18n.language !== locale) {
      void setAppLocale(locale);
    }
  }, [locale]);
  return <>{children}</>;
}

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
        promptMessage: 'Unlock E-Tracker',
        disableDeviceFallback: false,
      });
      setUnlocked(result.success);
    })();
  }, [enabled, token]);

  if (!unlocked) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
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
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ReduxProvider store={store}>
        <PersistGate loading={null} persistor={persistor}>
          <I18nBridge>
            <BiometricGate>
              <PaperProvider theme={theme}>
                <Stack screenOptions={{ headerShown: false }} />
              </PaperProvider>
            </BiometricGate>
          </I18nBridge>
        </PersistGate>
      </ReduxProvider>
    </GestureHandlerRootView>
  );
}
