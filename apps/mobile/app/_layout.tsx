import 'react-native-gesture-handler';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Provider as PaperProvider, MD3LightTheme } from 'react-native-paper';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { Provider as ReduxProvider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';

import { configureClient } from '@/api/client';
import { persistor, store } from '@/state/store';

const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#16A34A',
    secondary: '#0EA5E9',
  },
};

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
          <PaperProvider theme={theme}>
            <Stack screenOptions={{ headerShown: false }} />
          </PaperProvider>
        </PersistGate>
      </ReduxProvider>
    </GestureHandlerRootView>
  );
}
