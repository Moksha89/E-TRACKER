import { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Appbar, Button, FAB, IconButton, List, Menu, Text } from 'react-native-paper';
import { useFocusEffect, useRouter } from 'expo-router';

import { extractErrorMessage } from '@/api/client';
import { listBusinesses } from '@/api/endpoints';
import type { Business } from '@/api/types';
import { Empty } from '@/components/Empty';
import { Screen } from '@/components/Screen';
import { logout, setActiveBusiness } from '@/state/auth';
import { useAppDispatch, useAppSelector } from '@/state/hooks';
import { palette } from '@/theme';

export default function BusinessesScreen() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const activeId = useAppSelector((s) => s.auth.activeBusinessId);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [accountMenu, setAccountMenu] = useState(false);

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

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  const select = (id: string) => {
    dispatch(setActiveBusiness(id));
    router.push('/(app)/books');
  };

  return (
    <>
      <Appbar.Header style={styles.header}>
        <Appbar.Content color={palette.white} title="SVE Expenses" subtitle="Businesses" />
        <Menu
          visible={accountMenu}
          onDismiss={() => setAccountMenu(false)}
          anchor={
            <Appbar.Action
              icon="account-circle-outline"
              color={palette.white}
              onPress={() => setAccountMenu(true)}
            />
          }
        >
          <Menu.Item
            title="Profile"
            leadingIcon="account-outline"
            onPress={() => {
              setAccountMenu(false);
              router.push('/(app)/profile');
            }}
          />
          <Menu.Item
            title="Settings"
            leadingIcon="cog-outline"
            onPress={() => {
              setAccountMenu(false);
              router.push('/(app)/settings');
            }}
          />
          <Menu.Item
            title="Logout"
            leadingIcon="logout"
            onPress={() => {
              setAccountMenu(false);
              dispatch(logout());
            }}
          />
        </Menu>
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
                icon="briefcase-outline"
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
              right={(props) => (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {activeId === item.id ? <List.Icon {...props} icon="check-circle" /> : null}
                  <Menu
                    visible={menuFor === item.id}
                    onDismiss={() => setMenuFor(null)}
                    anchor={
                      <IconButton
                        icon="dots-vertical"
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
                          pathname: '/(app)/businesses-edit',
                          params: { businessId: item.id },
                        });
                      }}
                    />
                    <Menu.Item
                      title="Open"
                      leadingIcon="open-in-app"
                      onPress={() => {
                        setMenuFor(null);
                        select(item.id);
                      }}
                    />
                  </Menu>
                </View>
              )}
              onPress={() => select(item.id)}
            />
          )}
        />
        <FAB
          icon="plus"
          style={styles.fab}
          onPress={() => router.push('/(app)/businesses-new')}
          color={palette.white}
        />
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: palette.black },
  error: { padding: 16, gap: 8 },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 24,
    backgroundColor: palette.black,
  },
});
