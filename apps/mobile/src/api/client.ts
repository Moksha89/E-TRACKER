import Constants from 'expo-constants';
import axios, { AxiosError, AxiosInstance } from 'axios';

import type { Store } from '@reduxjs/toolkit';
import type { RootState } from '@/state/store';
import { logout } from '@/state/auth';

const fallback = 'http://localhost:8000';
export const API_BASE_URL: string =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl ??
  fallback;

export function getApiBaseUrl(): string {
  return API_BASE_URL;
}

let _client: AxiosInstance | null = null;

export function configureClient(store: Store<RootState>): AxiosInstance {
  const client = axios.create({
    baseURL: API_BASE_URL,
    timeout: 15_000,
    headers: { 'Content-Type': 'application/json' },
  });
  client.interceptors.request.use((config) => {
    const token = store.getState().auth.accessToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });
  client.interceptors.response.use(
    (resp) => resp,
    (err: AxiosError) => {
      if (err.response?.status === 401) {
        store.dispatch(logout());
      }
      return Promise.reject(err);
    },
  );
  _client = client;
  return client;
}

// Lightweight in-flight GET request dedup. Multiple components calling the
// same `useFocusEffect` simultaneously would otherwise issue duplicate
// concurrent network requests. Keyed by full URL + serialized params.
const _inflight = new Map<string, Promise<unknown>>();

export function dedupedGet<T>(
  url: string,
  params?: Record<string, unknown>,
): Promise<T> {
  const key = `${url}::${params ? JSON.stringify(params) : ''}`;
  const existing = _inflight.get(key);
  if (existing) return existing as Promise<T>;
  const p = getClient()
    .get<T>(url, { params })
    .then((r) => r.data)
    .finally(() => {
      _inflight.delete(key);
    });
  _inflight.set(key, p);
  return p;
}

export function getClient(): AxiosInstance {
  if (!_client) {
    throw new Error('axios client not configured; call configureClient(store) first');
  }
  return _client;
}

export function extractErrorMessage(err: unknown, fallbackMsg = 'Something went wrong'): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data;
    if (data && typeof data === 'object' && 'detail' in data) {
      const detail = (data as { detail: unknown }).detail;
      if (typeof detail === 'string') return detail;
    }
    return err.message || fallbackMsg;
  }
  return fallbackMsg;
}
