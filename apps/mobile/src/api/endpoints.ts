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
  ExportFormat,
  Member,
  MemberRole,
  OtpPurpose,
  OtpResponse,
  Party,
  PaymentMode,
  PendingInvite,
  ReportSummary,
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

export async function updateMe(input: {
  name?: string | null;
  email?: string | null;
  default_business_id?: string | null;
}): Promise<User> {
  const { data } = await getClient().patch<User>('/v1/me', input);
  return data;
}

export async function changePassword(input: {
  current_password: string;
  new_password: string;
}): Promise<void> {
  await getClient().post('/v1/me/password', input);
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

export async function updateBusiness(
  businessId: string,
  input: {
    name?: string | null;
    currency?: string | null;
    gst_number?: string | null;
    address?: string | null;
  },
): Promise<Business> {
  const { data } = await getClient().patch<Business>(`/v1/businesses/${businessId}`, input);
  return data;
}

export async function deleteBusiness(businessId: string): Promise<void> {
  await getClient().delete(`/v1/businesses/${businessId}`);
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

export async function updateBook(
  businessId: string,
  bookId: string,
  input: { name?: string; opening_balance_cents?: number; archived?: boolean },
): Promise<Book> {
  const { data } = await getClient().patch<Book>(
    `/v1/businesses/${businessId}/books/${bookId}`,
    input,
  );
  return data;
}

export async function deleteBook(businessId: string, bookId: string): Promise<void> {
  await getClient().delete(`/v1/businesses/${businessId}/books/${bookId}`);
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

export async function getEntry(
  businessId: string,
  bookId: string,
  entryId: string,
): Promise<Entry> {
  const { data } = await getClient().get<Entry>(
    `/v1/businesses/${businessId}/books/${bookId}/entries/${entryId}`,
  );
  return data;
}

export async function updateEntry(
  businessId: string,
  bookId: string,
  entryId: string,
  input: {
    type?: EntryType;
    amount_cents?: number;
    occurred_at?: string;
    description?: string | null;
    party_id?: string | null;
    category_id?: string | null;
    payment_mode_id?: string | null;
  },
): Promise<Entry> {
  const { data } = await getClient().patch<Entry>(
    `/v1/businesses/${businessId}/books/${bookId}/entries/${entryId}`,
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

export async function createCategory(
  businessId: string,
  input: { name: string; color?: string; sort_order?: number },
): Promise<Category> {
  const { data } = await getClient().post<Category>(
    `/v1/businesses/${businessId}/categories`,
    input,
  );
  return data;
}

export async function updateCategory(
  businessId: string,
  categoryId: string,
  input: { name?: string; color?: string | null; sort_order?: number },
): Promise<Category> {
  const { data } = await getClient().patch<Category>(
    `/v1/businesses/${businessId}/categories/${categoryId}`,
    input,
  );
  return data;
}

export async function deleteCategory(
  businessId: string,
  categoryId: string,
): Promise<void> {
  await getClient().delete(`/v1/businesses/${businessId}/categories/${categoryId}`);
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

// members -----

export async function listMembers(businessId: string): Promise<Member[]> {
  const { data } = await getClient().get<Member[]>(`/v1/businesses/${businessId}/members`);
  return data;
}

export async function inviteMember(
  businessId: string,
  input: { phone: string; role: MemberRole; name?: string },
): Promise<Member> {
  const { data } = await getClient().post<Member>(
    `/v1/businesses/${businessId}/members`,
    input,
  );
  return data;
}

export async function updateMember(
  businessId: string,
  memberId: string,
  role: MemberRole,
): Promise<Member> {
  const { data } = await getClient().patch<Member>(
    `/v1/businesses/${businessId}/members/${memberId}`,
    { role },
  );
  return data;
}

export async function removeMember(businessId: string, memberId: string): Promise<void> {
  await getClient().delete(`/v1/businesses/${businessId}/members/${memberId}`);
}

export async function acceptInvite(businessId: string): Promise<Member> {
  const { data } = await getClient().post<Member>(
    `/v1/businesses/${businessId}/members/accept`,
  );
  return data;
}

export async function listInvitations(): Promise<PendingInvite[]> {
  const { data } = await getClient().get<PendingInvite[]>('/v1/me/invitations');
  return data;
}

// reports -----

export async function fetchBusinessReport(
  businessId: string,
  range: { from?: string; to?: string } = {},
): Promise<ReportSummary> {
  const { data } = await getClient().get<ReportSummary>(
    `/v1/businesses/${businessId}/reports/summary`,
    { params: range },
  );
  return data;
}

export async function fetchBookReport(
  businessId: string,
  bookId: string,
  range: { from?: string; to?: string } = {},
): Promise<ReportSummary> {
  const { data } = await getClient().get<ReportSummary>(
    `/v1/businesses/${businessId}/books/${bookId}/reports/summary`,
    { params: range },
  );
  return data;
}

// export -----

export function buildExportUrl(
  businessId: string,
  bookId: string,
  fmt: ExportFormat,
  range: { from?: string; to?: string } = {},
): string {
  const params = new URLSearchParams({ format: fmt });
  if (range.from) params.set('from', range.from);
  if (range.to) params.set('to', range.to);
  return `/v1/businesses/${businessId}/books/${bookId}/entries/export?${params.toString()}`;
}

export async function downloadExport(
  businessId: string,
  bookId: string,
  fmt: ExportFormat,
  range: { from?: string; to?: string } = {},
): Promise<{ blob: Blob; filename: string }> {
  const url = buildExportUrl(businessId, bookId, fmt, range);
  const resp = await getClient().get(url, { responseType: 'blob' });
  const cd: string | undefined = resp.headers['content-disposition'];
  const match = cd?.match(/filename="([^"]+)"/);
  return {
    blob: resp.data as Blob,
    filename: match?.[1] ?? `entries.${fmt}`,
  };
}

// attachments -----

export interface Attachment {
  id: string;
  entry_id: string;
  download_url: string;
  original_filename: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

export async function listAttachments(
  businessId: string,
  bookId: string,
  entryId: string,
): Promise<Attachment[]> {
  const { data } = await getClient().get<Attachment[]>(
    `/v1/businesses/${businessId}/books/${bookId}/entries/${entryId}/attachments`,
  );
  return data;
}

export async function uploadAttachment(
  businessId: string,
  bookId: string,
  entryId: string,
  file: { uri: string; name: string; type: string },
): Promise<Attachment> {
  const form = new FormData();
  // React Native FormData accepts {uri,name,type} blobs
  form.append('file', file as unknown as Blob);
  const { data } = await getClient().post<Attachment>(
    `/v1/businesses/${businessId}/books/${bookId}/entries/${entryId}/attachments`,
    form,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return data;
}

export async function deleteAttachment(
  businessId: string,
  bookId: string,
  entryId: string,
  attachmentId: string,
): Promise<void> {
  await getClient().delete(
    `/v1/businesses/${businessId}/books/${bookId}/entries/${entryId}/attachments/${attachmentId}`,
  );
}

// backup -----

export async function fetchBackup(businessId: string): Promise<Record<string, unknown>> {
  const { data } = await getClient().get<Record<string, unknown>>(
    `/v1/businesses/${businessId}/backup`,
  );
  return data;
}

export async function restoreBackup(input: {
  snapshot: Record<string, unknown>;
  name_override?: string | null;
}): Promise<Business> {
  const { data } = await getClient().post<Business>('/v1/restore', input);
  return data;
}

// devices -----

export interface Device {
  id: string;
  expo_push_token: string;
  platform: string | null;
  locale: string | null;
  last_seen_at: string;
}

export async function registerDevice(input: {
  expo_push_token: string;
  platform?: string;
  locale?: string;
}): Promise<Device> {
  const { data } = await getClient().post<Device>('/v1/me/devices', input);
  return data;
}
