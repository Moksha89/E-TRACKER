import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { SupportedLocale } from '@/i18n';

export interface SettingsState {
  locale: SupportedLocale;
  biometricLock: boolean;
  pushTokenSent: string | null;
}

const initialState: SettingsState = {
  locale: 'en',
  biometricLock: false,
  pushTokenSent: null,
};

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    setLocale(state, action: PayloadAction<SupportedLocale>) {
      state.locale = action.payload;
    },
    setBiometricLock(state, action: PayloadAction<boolean>) {
      state.biometricLock = action.payload;
    },
    setPushTokenSent(state, action: PayloadAction<string | null>) {
      state.pushTokenSent = action.payload;
    },
  },
});

export const { setLocale, setBiometricLock, setPushTokenSent } = settingsSlice.actions;
export default settingsSlice.reducer;
