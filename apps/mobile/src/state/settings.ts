import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface SettingsState {
  biometricLock: boolean;
  pushTokenSent: string | null;
}

const initialState: SettingsState = {
  biometricLock: false,
  pushTokenSent: null,
};

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    setBiometricLock(state, action: PayloadAction<boolean>) {
      state.biometricLock = action.payload;
    },
    setPushTokenSent(state, action: PayloadAction<string | null>) {
      state.pushTokenSent = action.payload;
    },
  },
});

export const { setBiometricLock, setPushTokenSent } = settingsSlice.actions;
export default settingsSlice.reducer;
