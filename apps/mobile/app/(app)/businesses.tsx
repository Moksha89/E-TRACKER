import { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Appbar, Button, FAB, List, Text } from 'react-native-paper';
import { useFocusEffect, useRouter } from 'expo-router';

import { extractErrorMessage } from '@/api/client';
import { listBusinesses } from '@/api/endpoints';
import type { Business } from '@/api/types';
import { Empty } from '@/components/Empty';
import { Screen } from '@/components/Screen';
import { logout, setActiveBusiness } from '@/state/auth';
import { useAppDispatch, useAppSelector } from '@/state/hooks';

export default function BusinessesScreen() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const activeId = useAppSelector((s) => s.auth.activeBusinessId);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listBusinesses();
      setBusinesses(list);
      if (list.length > 0 && !activeId) {
        dispatch(setActiveBusiness(list[0]!.id));
      }
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [activeId, dispatch]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const select = (id: string) => {
    dispatch(setActiveBusiness(id));
    router.push('/(app)/books');
  };

  return (
    <>
      <Appbar.Header style={{ backgroundColor: '#16A34A' }}>
        <Appbar.Content title="Businesses" color="#fff" />
        <Appbar.Action icon="logout" color="#fff" onPress={() => dispatch(logout())} />
      </Appbar.Header>
      <Screen padded={false}>
        {error ? (
          <View style={styles.error}>
            <Text>{error}</Text>
            <Button onPress={load}>Retry</Button>
          </View>
        ) : null}
        <FlatList
          data={businesses}
          keyExtractor={(b) => b.id}
          refreshing={loading}
          onRefresh={load}
          ListEmptyComponent={
            !loading ? (
              <Empty
                title="No businesses yet"
                subtitle="Create your first business to start tracking cash."
              />
            ) : null
          }
          renderItem={({ item }) => (
            <List.Item
              title={item.name}
              description={`${item.role ?? 'member'} · ${item.currency}`}
              left={(props) => <List.Icon {...props} icon="briefcase" />}
              right={(props) =>
                activeId === item.id ? <List.Icon {...props} icon="check-circle" /> : null
              }
              onPress={() => select(item.id)}
            />
          )}
        />
        <FAB
          icon="plus"
          style={styles.fab}
          onPress={() => router.push('/(app)/businesses-new')}
        />
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  error: { padding: 16, gap: 8 },
  fab: { position: 'absolute', right: 16, bottom: 24 },
});
