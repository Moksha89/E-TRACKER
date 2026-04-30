import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Appbar, Card, FAB, IconButton, Text } from 'react-native-paper';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { extractErrorMessage } from '@/api/client';
import { deleteEntry, getBook, listEntries } from '@/api/endpoints';
import type { BookWithBalance, Entry } from '@/api/types';
import { Empty } from '@/components/Empty';
import { Screen } from '@/components/Screen';
import { useAppSelector } from '@/state/hooks';
import { formatCents } from '@/utils/money';

export default function BookDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ bookId: string }>();
  const bookId = params.bookId;
  const businessId = useAppSelector((s) => s.auth.activeBusinessId);
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

  const onDelete = async (entryId: string) => {
    if (!businessId || !bookId) return;
    try {
      await deleteEntry(businessId, bookId, entryId);
      await load();
    } catch (e) {
      setError(extractErrorMessage(e));
    }
  };

  const currency = book?.currency ?? 'INR';

  return (
    <>
      <Appbar.Header style={{ backgroundColor: '#16A34A' }}>
        <Appbar.BackAction onPress={() => router.back()} color="#fff" />
        <Appbar.Content title={book?.name ?? 'Book'} color="#fff" />
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
              <Text style={styles.pillLabel}>Balance</Text>
              <Text style={styles.pillValue}>
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
              <Empty title="No entries yet" subtitle="Tap + to add your first cash entry." />
            ) : null
          }
          renderItem={({ item }) => (
            <Card mode="outlined">
              <Card.Content style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text variant="titleMedium">
                    {formatCents(item.amount_cents, currency)}
                  </Text>
                  <Text variant="bodySmall" style={{ opacity: 0.7 }}>
                    {new Date(item.occurred_at).toLocaleString()}
                  </Text>
                  {item.description ? (
                    <Text variant="bodyMedium" style={{ marginTop: 4 }}>
                      {item.description}
                    </Text>
                  ) : null}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={item.type === 'in' ? styles.inText : styles.outText}>
                    {item.type === 'in' ? 'Cash In' : 'Cash Out'}
                  </Text>
                  <IconButton icon="delete-outline" onPress={() => onDelete(item.id)} />
                </View>
              </Card.Content>
            </Card>
          )}
        />

        <FAB
          icon="plus"
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
  summary: { flexDirection: 'row', padding: 16, gap: 8 },
  pill: { flex: 1, padding: 12, borderRadius: 8 },
  pillLabel: { fontSize: 12, opacity: 0.7 },
  pillValue: { fontSize: 16, fontWeight: '700', marginTop: 4 },
  in: { backgroundColor: '#DCFCE7' },
  out: { backgroundColor: '#FEE2E2' },
  net: { backgroundColor: '#E0F2FE' },
  row: { flexDirection: 'row', alignItems: 'center' },
  inText: { color: '#16A34A', fontWeight: '700' },
  outText: { color: '#DC2626', fontWeight: '700' },
  fab: { position: 'absolute', right: 16, bottom: 24 },
});
