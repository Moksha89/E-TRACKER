export type OtpPurpose = 'signup' | 'login' | 'reset_password' | 'sensitive';
export type OtpChannel = 'telegram_gateway' | 'telegram_bot';
export type EntryType = 'in' | 'out';
export type BookType = 'cashbook' | 'generic';
export type MemberRole = 'owner' | 'partner' | 'staff' | 'viewer';

export interface User {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  phone_verified: boolean;
  default_business_id: string | null;
}

export interface AuthResponse {
  access_token: string;
  token_type: 'bearer';
  user: User;
}

export interface OtpResponse {
  channel: OtpChannel;
  request_id: string | null;
  delivered: boolean;
  cooldown_seconds: number;
  expires_in_seconds: number;
  debug_code: string | null;
}

export interface Business {
  id: string;
  name: string;
  currency: string;
  gst_number: string | null;
  address: string | null;
  owner_id: string;
  role: MemberRole | null;
}

export interface Book {
  id: string;
  business_id: string;
  name: string;
  type: BookType;
  currency: string;
  opening_balance_cents: number;
  archived_at: string | null;
  created_at: string;
}

export interface BookWithBalance extends Book {
  in_total_cents: number;
  out_total_cents: number;
  net_balance_cents: number;
  entry_count: number;
}

export interface Entry {
  id: string;
  book_id: string;
  type: EntryType;
  amount_cents: number;
  occurred_at: string;
  description: string | null;
  party_id: string | null;
  category_id: string | null;
  payment_mode_id: string | null;
  created_by_id: string;
  created_at: string;
  updated_at: string;
}

export interface EntryListResponse {
  items: Entry[];
  in_total_cents: number;
  out_total_cents: number;
  net_balance_cents: number;
  next_cursor: string | null;
}

export interface Category {
  id: string;
  business_id: string;
  name: string;
  color: string | null;
  icon: string | null;
  sort_order: number;
}

export interface PaymentMode {
  id: string;
  business_id: string;
  name: string;
  sort_order: number;
}

export interface Party {
  id: string;
  business_id: string;
  name: string;
  phone: string | null;
  note: string | null;
}
