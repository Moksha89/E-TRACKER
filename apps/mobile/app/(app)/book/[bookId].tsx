import { useCallback, useState } from 'react';
import { FlatList, Share, StyleSheet, View } from 'react-native';
import { Appbar, Card, FAB, Text, TouchableRipple } from 'react-native-paper';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { extractErrorMessage } from '@/api/client';
import { getBook, listEntries } from '@/api/endpoints';
import type { BookWithBalance, Entry } from '@/api/types';
import { Empty } from '@/components/Empty';
import { Screen } from '@/components/Screen';
import { useAppSelector } from '@/state/hooks';
import { palette } from '@/theme';
import { formatCents } from '@/utils/money';

export default function BookDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ bookId: string }>();
  const bookId = params.bookId;
  const businessId = useAppSelector((s) => s.auth.activeBusinessId);
  const { t } = useTranslation();
  const [book, setBook] = useState<BookWithBalance | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId || !bookId) return;
    setLoading(true);
    setError(null);
    try {
      const [b, entryList] = await Promise.all([
        getBook(businessId, bookId),
        listEntries(businessId, bookId, { limit: 100 }),
      ]);
      setBook(b);
      setEntries(entryList.items);
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [businessId, bookId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const currency = book?.currency ?? 'INR';

  return (
    <>
      <Appbar.Header style={styles.header}>
        <Appbar.BackAction onPress={() => router.back()} color={palette.white} />
        <Appbar.Content title={book?.name ?? 'Book'} color={palette.white} />
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
          keyExtractor={(e) => e.id}
          refreshing={loading}
          onRefresh={load}
          contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 96 }}
          ListEmptyComponent={
            !loading ? (
              <Empty
                icon="cash-multiple"
                title="No entries yet"
                subtitle="Tap + to log your first cash entry."
              />
            ) : null
          }
          renderItem={({ item }) => (
            <Card mode="outlined" style={styles.entryCard}>
              <TouchableRipple
                onPress={() =>
                  router.push({
                    pathname: '/(app)/book/[bookId]/entry/[entryId]',
                    params: { bookId: String(bookId), entryId: item.id },
                  })
                }
              >
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
                      <Text variant="bodyMedium" style={{ marginTop: 4 }}>
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
          )}
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
    </>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: palette.black },
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
  row: { flexDirection: 'row', alignItems: 'center' },
  entryCard: { backgroundColor: palette.surface },
  muted: { color: palette.textMuted },
  chevron: { paddingHorizontal: 8 },
  fab: { position: 'absolute', right: 16, bottom: 24, backgroundColor: palette.black },
});
