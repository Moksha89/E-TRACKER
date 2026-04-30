import { memo, useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Share, StyleSheet, View } from 'react-native';
import { Appbar, Badge, Card, Chip, FAB, Text, TouchableRipple } from 'react-native-paper';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { extractErrorMessage } from '@/api/client';
import type { EntryFilter } from '@/api/endpoints';
import {
  getBook,
  listCategories,
  listEntries,
  listPaymentModes,
} from '@/api/endpoints';
import { useRealtime } from '@/api/realtime';
import type { BookWithBalance, Category, Entry, PaymentMode } from '@/api/types';
import { Empty } from '@/components/Empty';
import { EntryFiltersSheet, countActiveFilters } from '@/components/EntryFiltersSheet';
import { Screen } from '@/components/Screen';
import { useAppSelector } from '@/state/hooks';
import { palette } from '@/theme';
import { formatCents } from '@/utils/money';

const PAGE_SIZE = 30;

export default function BookDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ bookId: string }>();
  const bookId = params.bookId;
  const businessId = useAppSelector((s) => s.auth.activeBusinessId);
  const accessToken = useAppSelector((s) => s.auth.accessToken);
  const { t } = useTranslation();
  const [book, setBook] = useState<BookWithBalance | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<EntryFilter>({});
  const [filterOpen, setFilterOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [paymentModes, setPaymentModes] = useState<PaymentMode[]>([]);

  const load = useCallback(async () => {
    if (!businessId || !bookId) return;
    setLoading(true);
    setError(null);
    try {
      const [b, entryList] = await Promise.all([
        getBook(businessId, bookId),
        listEntries(businessId, bookId, { ...filter, limit: PAGE_SIZE, offset: 0 }),
      ]);
      setBook(b);
      setEntries(entryList.items);
      setNextOffset(
        entryList.next_cursor != null ? Number(entryList.next_cursor) : null,
      );
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [businessId, bookId, filter]);

  const loadMore = useCallback(async () => {
    if (!businessId || !bookId) return;
    if (loadingMore || loading || nextOffset == null) return;
    setLoadingMore(true);
    try {
      const page = await listEntries(businessId, bookId, {
        ...filter,
        limit: PAGE_SIZE,
        offset: nextOffset,
      });
      setEntries((prev) => {
        const seen = new Set(prev.map((e) => e.id));
        const merged = [...prev];
        for (const e of page.items) if (!seen.has(e.id)) merged.push(e);
        return merged;
      });
      setNextOffset(page.next_cursor != null ? Number(page.next_cursor) : null);
    } catch {
      // best-effort; keep what we already have
    } finally {
      setLoadingMore(false);
    }
  }, [businessId, bookId, filter, loading, loadingMore, nextOffset]);

  const loadLookups = useCallback(async () => {
    if (!businessId) return;
    try {
      const [cats, modes] = await Promise.all([
        listCategories(businessId),
        listPaymentModes(businessId),
      ]);
      setCategories(cats);
      setPaymentModes(modes);
    } catch {
      // best-effort; filter sheet will show empty lists
    }
  }, [businessId]);

  useFocusEffect(
    useCallback(() => {
      load();
      loadLookups();
    }, [load, loadLookups]),
  );

  useRealtime({
    enabled: true,
    businessId,
    token: accessToken,
    onEvent: (e) => {
      if (
        e.type === 'entry.created' ||
        e.type === 'entry.updated' ||
        e.type === 'entry.deleted'
      ) {
        const data = (e as { data?: { book_id?: string } }).data ?? {};
        if (!data.book_id || data.book_id === bookId) {
          load();
        }
      }
    },
  });

  const activeCount = countActiveFilters(filter);

  const currency = book?.currency ?? 'INR';

  const onPressEntry = useCallback(
    (id: string) =>
      router.push({
        pathname: '/(app)/book/[bookId]/entry/[entryId]',
        params: { bookId: String(bookId), entryId: id },
      }),
    [bookId, router],
  );

  const renderEntry = useCallback(
    ({ item }: { item: Entry }) => (
      <EntryRow item={item} currency={currency} onPress={onPressEntry} />
    ),
    [currency, onPressEntry],
  );

  const keyExtractor = useCallback((e: Entry) => e.id, []);
  const listFooter = useMemo(
    () =>
      loadingMore ? (
        <View style={styles.footer}>
          <ActivityIndicator />
        </View>
      ) : null,
    [loadingMore],
  );

  return (
    <>
      <Appbar.Header style={styles.header}>
        <Appbar.BackAction onPress={() => router.back()} color={palette.white} />
        <Appbar.Content title={book?.name ?? 'Book'} color={palette.white} />
        <View>
          <Appbar.Action
            icon="filter-variant"
            color={palette.white}
            onPress={() => setFilterOpen(true)}
          />
          {activeCount > 0 ? (
            <Badge style={styles.badge} size={16}>
              {activeCount}
            </Badge>
          ) : null}
        </View>
        {book ? (
          <>
            <Appbar.Action
              icon="pencil"
              color={palette.white}
              onPress={() =>
                router.push({
                  pathname: '/(app)/book/[bookId]/edit',
                  params: { bookId: String(bookId) },
                })
              }
            />
            <Appbar.Action
              icon="share-variant"
              color={palette.white}
              onPress={() =>
                Share.share({
                  message: t('books.share_summary', {
                    name: book.name,
                    in: formatCents(book.in_total_cents, currency),
                    out: formatCents(book.out_total_cents, currency),
                    net: formatCents(book.net_balance_cents, currency),
                  }),
                })
              }
            />
          </>
        ) : null}
      </Appbar.Header>
      <Screen padded={false}>
        {activeCount > 0 ? (
          <View style={styles.activeRow}>
            <Chip
              compact
              icon="filter-variant"
              onClose={() => setFilter({ limit: filter.limit ?? 100 })}
              style={styles.activeChip}
            >
              {activeCount} filter{activeCount === 1 ? '' : 's'} applied
            </Chip>
          </View>
        ) : null}
        {book ? (
          <View style={styles.summary}>
            <View style={[styles.pill, styles.in]}>
              <Text style={styles.pillLabel}>Cash In</Text>
              <Text style={styles.pillValue}>{formatCents(book.in_total_cents, currency)}</Text>
            </View>
            <View style={[styles.pill, styles.out]}>
              <Text style={styles.pillLabel}>Cash Out</Text>
              <Text style={styles.pillValue}>{formatCents(book.out_total_cents, currency)}</Text>
            </View>
            <View style={[styles.pill, styles.net]}>
              <Text style={[styles.pillLabel, styles.netText]}>Balance</Text>
              <Text style={[styles.pillValue, styles.netText]}>
                {formatCents(book.net_balance_cents, currency)}
              </Text>
            </View>
          </View>
        ) : null}

        {error ? (
          <View style={{ padding: 16 }}>
            <Text>{error}</Text>
          </View>
        ) : null}

        <FlatList
          data={entries}
          keyExtractor={keyExtractor}
          refreshing={loading}
          onRefresh={load}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            !loading ? (
              <Empty
                icon="cash-multiple"
                title="No entries yet"
                subtitle="Tap + to log your first cash entry."
              />
            ) : null
          }
          ListFooterComponent={listFooter}
          renderItem={renderEntry}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          removeClippedSubviews
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={9}
          updateCellsBatchingPeriod={50}
        />

        <FAB
          icon="plus"
          color={palette.white}
          style={styles.fab}
          onPress={() =>
            router.push({
              pathname: '/(app)/book/[bookId]/entry-new',
              params: { bookId: String(bookId) },
            })
          }
        />
      </Screen>
      <EntryFiltersSheet
        visible={filterOpen}
        initial={filter}
        categories={categories}
        paymentModes={paymentModes}
        onDismiss={() => setFilterOpen(false)}
        onApply={(next) => {
          setFilter(next);
          setFilterOpen(false);
        }}
      />
    </>
  );
}

interface EntryRowProps {
  item: Entry;
  currency: string;
  onPress: (id: string) => void;
}

const EntryRow = memo(function EntryRow({ item, currency, onPress }: EntryRowProps) {
  return (
    <Card mode="outlined" style={styles.entryCard}>
      <TouchableRipple onPress={() => onPress(item.id)}>
        <Card.Content style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text
              variant="titleMedium"
              style={{
                color: item.type === 'in' ? palette.cashIn : palette.cashOut,
                fontWeight: '700',
              }}
            >
              {item.type === 'in' ? '+' : '−'} {formatCents(item.amount_cents, currency)}
            </Text>
            <Text variant="bodySmall" style={styles.muted}>
              {new Date(item.occurred_at).toLocaleString()}
            </Text>
            {item.description ? (
              <Text variant="bodyMedium" style={{ marginTop: 4 }} numberOfLines={1}>
                {item.description}
              </Text>
            ) : null}
          </View>
          <View style={styles.chevron}>
            <Text style={styles.muted}>›</Text>
          </View>
        </Card.Content>
      </TouchableRipple>
    </Card>
  );
});

const styles = StyleSheet.create({
  header: { backgroundColor: palette.black },
  listContent: { padding: 16, gap: 8, paddingBottom: 96 },
  footer: { paddingVertical: 16, alignItems: 'center' },
  summary: { flexDirection: 'row', padding: 16, gap: 8 },
  pill: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  pillLabel: { fontSize: 12, color: palette.textMuted },
  pillValue: { fontSize: 16, fontWeight: '700', marginTop: 4 },
  in: {},
  out: {},
  net: { backgroundColor: palette.black, borderColor: palette.black },
  netText: { color: palette.white },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: palette.cashOut,
    color: palette.white,
  },
  activeRow: { paddingHorizontal: 16, paddingTop: 12 },
  activeChip: { alignSelf: 'flex-start' },
  row: { flexDirection: 'row', alignItems: 'center' },
  entryCard: { backgroundColor: palette.surface },
  muted: { color: palette.textMuted },
  chevron: { paddingHorizontal: 8 },
  fab: { position: 'absolute', right: 16, bottom: 24, backgroundColor: palette.black },
});
