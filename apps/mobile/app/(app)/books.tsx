import { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Appbar, Card, FAB, Text } from 'react-native-paper';
import { useFocusEffect, useRouter } from 'expo-router';

import { extractErrorMessage } from '@/api/client';
import { listBooks } from '@/api/endpoints';
import type { BookWithBalance } from '@/api/types';
import { Empty } from '@/components/Empty';
import { Screen } from '@/components/Screen';
import { useAppSelector } from '@/state/hooks';
import { formatCents } from '@/utils/money';

export default function BooksScreen() {
  const router = useRouter();
  const businessId = useAppSelector((s) => s.auth.activeBusinessId);
  const [books, setBooks] = useState<BookWithBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    setError(null);
    try {
      const list = await listBooks(businessId);
      setBooks(list);
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <>
      <Appbar.Header style={{ backgroundColor: '#16A34A' }}>
        <Appbar.BackAction onPress={() => router.back()} color="#fff" />
        <Appbar.Content title="Cashbooks" color="#fff" />
      </Appbar.Header>
      <Screen padded={false}>
        {error ? (
          <View style={styles.error}>
            <Text>{error}</Text>
          </View>
        ) : null}
        <FlatList
          data={books}
          keyExtractor={(b) => b.id}
          refreshing={loading}
          onRefresh={load}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 96 }}
          ListEmptyComponent={
            !loading ? (
              <Empty
                title="No books yet"
                subtitle="Tap + to add your first cashbook."
              />
            ) : null
          }
          renderItem={({ item }) => (
            <Card
              mode="elevated"
              onPress={() =>
                router.push({ pathname: '/(app)/book/[bookId]', params: { bookId: item.id } })
              }
            >
              <Card.Content>
                <Text variant="titleMedium">{item.name}</Text>
                <View style={styles.row}>
                  <Text style={[styles.cell, styles.in]}>
                    + {formatCents(item.in_total_cents, item.currency)}
                  </Text>
                  <Text style={[styles.cell, styles.out]}>
                    − {formatCents(item.out_total_cents, item.currency)}
                  </Text>
                </View>
                <Text variant="bodyMedium" style={styles.net}>
                  Balance: {formatCents(item.net_balance_cents, item.currency)}
                </Text>
              </Card.Content>
            </Card>
          )}
        />
        <FAB
          icon="plus"
          style={styles.fab}
          onPress={() => router.push('/(app)/books-new')}
        />
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  error: { padding: 16 },
  row: { flexDirection: 'row', gap: 16, marginTop: 8 },
  cell: { flex: 1 },
  in: { color: '#16A34A' },
  out: { color: '#DC2626' },
  net: { marginTop: 8, fontWeight: '600' },
  fab: { position: 'absolute', right: 16, bottom: 24 },
});
