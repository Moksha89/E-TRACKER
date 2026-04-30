import { getClient } from './client';
import type {
  AuthResponse,
  Book,
  BookWithBalance,
  Business,
  Category,
  Entry,
  EntryListResponse,
  EntryType,
  OtpPurpose,
  OtpResponse,
  Party,
  PaymentMode,
  User,
} from './types';

// auth -----

export async function requestOtp(phone: string, purpose: OtpPurpose): Promise<OtpResponse> {
  const { data } = await getClient().post<OtpResponse>('/v1/auth/otp/request', {
    phone,
    purpose,
  });
  return data;
}

export async function signup(input: {
  phone: string;
  password: string;
  name?: string;
  email?: string;
  otp: string;
}): Promise<AuthResponse> {
  const { data } = await getClient().post<AuthResponse>('/v1/auth/signup', input);
  return data;
}

export async function login(phone: string, password: string): Promise<AuthResponse> {
  const { data } = await getClient().post<AuthResponse>('/v1/auth/login', { phone, password });
  return data;
}

export async function resetPassword(input: {
  phone: string;
  otp: string;
  new_password: string;
}): Promise<AuthResponse> {
  const { data } = await getClient().post<AuthResponse>('/v1/auth/password/reset', input);
  return data;
}

export async function fetchMe(): Promise<User> {
  const { data } = await getClient().get<User>('/v1/me');
  return data;
}

// businesses -----

export async function listBusinesses(): Promise<Business[]> {
  const { data } = await getClient().get<Business[]>('/v1/businesses');
  return data;
}

export async function createBusiness(input: {
  name: string;
  currency?: string;
  gst_number?: string;
  address?: string;
}): Promise<Business> {
  const { data } = await getClient().post<Business>('/v1/businesses', input);
  return data;
}

// books -----

export async function listBooks(businessId: string): Promise<BookWithBalance[]> {
  const { data } = await getClient().get<BookWithBalance[]>(
    `/v1/businesses/${businessId}/books`,
  );
  return data;
}

export async function createBook(
  businessId: string,
  input: { name: string; opening_balance_cents?: number },
): Promise<Book> {
  const { data } = await getClient().post<Book>(`/v1/businesses/${businessId}/books`, input);
  return data;
}

export async function getBook(businessId: string, bookId: string): Promise<BookWithBalance> {
  const { data } = await getClient().get<BookWithBalance>(
    `/v1/businesses/${businessId}/books/${bookId}`,
  );
  return data;
}

// entries -----

export interface EntryFilter {
  type?: EntryType;
  party_id?: string;
  category_id?: string;
  payment_mode_id?: string;
  from?: string;
  to?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export async function listEntries(
  businessId: string,
  bookId: string,
  filter: EntryFilter = {},
): Promise<EntryListResponse> {
  const { data } = await getClient().get<EntryListResponse>(
    `/v1/businesses/${businessId}/books/${bookId}/entries`,
    { params: filter },
  );
  return data;
}

export async function createEntry(
  businessId: string,
  bookId: string,
  input: {
    type: EntryType;
    amount_cents: number;
    occurred_at: string;
    description?: string;
    party_id?: string;
    category_id?: string;
    payment_mode_id?: string;
  },
): Promise<Entry> {
  const { data } = await getClient().post<Entry>(
    `/v1/businesses/${businessId}/books/${bookId}/entries`,
    input,
  );
  return data;
}

export async function deleteEntry(
  businessId: string,
  bookId: string,
  entryId: string,
): Promise<void> {
  await getClient().delete(`/v1/businesses/${businessId}/books/${bookId}/entries/${entryId}`);
}

// lookups -----

export async function listCategories(businessId: string): Promise<Category[]> {
  const { data } = await getClient().get<Category[]>(`/v1/businesses/${businessId}/categories`);
  return data;
}

export async function listPaymentModes(businessId: string): Promise<PaymentMode[]> {
  const { data } = await getClient().get<PaymentMode[]>(
    `/v1/businesses/${businessId}/payment-modes`,
  );
  return data;
}

export async function listParties(businessId: string): Promise<Party[]> {
  const { data } = await getClient().get<Party[]>(`/v1/businesses/${businessId}/parties`);
  return data;
}
