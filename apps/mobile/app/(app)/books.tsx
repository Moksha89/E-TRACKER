import { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Appbar, Card, FAB, IconButton, Menu, Text } from 'react-native-paper';
import { useFocusEffect, useRouter } from 'expo-router';

import { extractErrorMessage } from '@/api/client';
import { listBooks } from '@/api/endpoints';
import type { BookWithBalance } from '@/api/types';
import { Empty } from '@/components/Empty';
import { Screen } from '@/components/Screen';
import { useAppSelector } from '@/state/hooks';
import { palette } from '@/theme';
import { formatCents } from '@/utils/money';

export default function BooksScreen() {
  const router = useRouter();
  const businessId = useAppSelector((s) => s.auth.activeBusinessId);
  const [books, setBooks] = useState<BookWithBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);

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
      <Appbar.Header style={styles.header}>
        <Appbar.BackAction onPress={() => router.back()} color={palette.white} />
        <Appbar.Content title="Books" color={palette.white} />
        <Appbar.Action
          icon="tag-multiple-outline"
          color={palette.white}
          onPress={() => router.push('/(app)/categories')}
        />
        <Appbar.Action
          icon="account-multiple"
          color={palette.white}
          onPress={() => router.push('/(app)/members')}
        />
        <Appbar.Action
          icon="chart-bar"
          color={palette.white}
          onPress={() => router.push('/(app)/reports')}
        />
        <Appbar.Action
          icon="cog"
          color={palette.white}
          onPress={() => router.push('/(app)/settings')}
        />
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
                icon="notebook-outline"
                title="No books yet"
                subtitle="Tap + to add your first book."
              />
            ) : null
          }
          renderItem={({ item }) => (
            <Card
              mode="outlined"
              style={styles.card}
              onPress={() =>
                router.push({ pathname: '/(app)/book/[bookId]', params: { bookId: item.id } })
              }
              onLongPress={() => setMenuFor(item.id)}
            >
              <Card.Content>
                <View style={styles.cardHeader}>
                  <Text variant="titleMedium" style={{ flex: 1 }}>{item.name}</Text>
                  <Menu
                    visible={menuFor === item.id}
                    onDismiss={() => setMenuFor(null)}
                    anchor={
                      <IconButton
                        icon="dots-vertical"
                        size={18}
                        onPress={() => setMenuFor(item.id)}
                      />
                    }
                  >
                    <Menu.Item
                      title="Edit"
                      leadingIcon="pencil"
                      onPress={() => {
                        setMenuFor(null);
                        router.push({
                          pathname: '/(app)/book/[bookId]/edit',
                          params: { bookId: item.id },
                        });
                      }}
                    />
                  </Menu>
                </View>
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
          color={palette.white}
          onPress={() => router.push('/(app)/books-new')}
        />
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: palette.black },
  error: { padding: 16 },
  card: { backgroundColor: palette.surface },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row: { flexDirection: 'row', gap: 16, marginTop: 8 },
  cell: { flex: 1 },
  in: { color: palette.cashIn, fontWeight: '600' },
  out: { color: palette.cashOut, fontWeight: '600' },
  net: { marginTop: 8, fontWeight: '600' },
  fab: { position: 'absolute', right: 16, bottom: 24, backgroundColor: palette.black },
});
