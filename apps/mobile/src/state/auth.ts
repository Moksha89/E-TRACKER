import { createSlice, PayloadAction } from '@reduxjs/toolkit';

import type { User } from '@/api/types';

export interface AuthState {
  accessToken: string | null;
  user: User | null;
  activeBusinessId: string | null;
}

const initialState: AuthState = {
  accessToken: null,
  user: null,
  activeBusinessId: null,
};

const slice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setSession(state, action: PayloadAction<{ token: string; user: User }>) {
      state.accessToken = action.payload.token;
      state.user = action.payload.user;
      if (!state.activeBusinessId) {
        state.activeBusinessId = action.payload.user.default_business_id;
      }
    },
    setUser(state, action: PayloadAction<User>) {
      state.user = action.payload;
    },
    setActiveBusiness(state, action: PayloadAction<string | null>) {
      state.activeBusinessId = action.payload;
    },
    logout(state) {
      state.accessToken = null;
      state.user = null;
      state.activeBusinessId = null;
    },
  },
});

export const { setSession, setUser, setActiveBusiness, logout } = slice.actions;
export default slice.reducer;
