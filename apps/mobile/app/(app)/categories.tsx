import { useCallback, useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import {
  Appbar,
  Button,
  Dialog,
  IconButton,
  List,
  Portal,
  Text,
  TextInput,
} from 'react-native-paper';
import { useFocusEffect, useRouter } from 'expo-router';

import { extractErrorMessage } from '@/api/client';
import {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from '@/api/endpoints';
import type { Category } from '@/api/types';
import { Empty } from '@/components/Empty';
import { Screen } from '@/components/Screen';
import { useAppSelector } from '@/state/hooks';
import { palette } from '@/theme';

export default function CategoriesScreen() {
  const router = useRouter();
  const businessId = useAppSelector((s) => s.auth.activeBusinessId);
  const [items, setItems] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<
    | { mode: 'create' }
    | { mode: 'edit'; category: Category }
    | null
  >(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    setError(null);
    try {
      setItems(await listCategories(businessId));
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  const openCreate = () => {
    setName('');
    setDialog({ mode: 'create' });
  };
  const openEdit = (c: Category) => {
    setName(c.name);
    setDialog({ mode: 'edit', category: c });
  };

  const onSubmit = async () => {
    if (!businessId || !dialog) return;
    if (!name.trim()) return;
    setBusy(true);
    try {
      if (dialog.mode === 'create') {
        await createCategory(businessId, { name: name.trim() });
      } else {
        await updateCategory(businessId, dialog.category.id, { name: name.trim() });
      }
      setDialog(null);
      await load();
    } catch (e) {
      Alert.alert('Error', extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const onDelete = (c: Category) =>
    Alert.alert('Delete category?', `"${c.name}" will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!businessId) return;
          try {
            await deleteCategory(businessId, c.id);
            await load();
          } catch (e) {
            Alert.alert('Error', extractErrorMessage(e));
          }
        },
      },
    ]);

  return (
    <>
      <Appbar.Header style={styles.header}>
        <Appbar.BackAction color={palette.white} onPress={() => router.back()} />
        <Appbar.Content color={palette.white} title="Categories" />
        <Appbar.Action icon="plus" color={palette.white} onPress={openCreate} />
      </Appbar.Header>
      <Screen padded={false}>
        {error ? (
          <View style={{ padding: 16 }}>
            <Text>{error}</Text>
          </View>
        ) : null}
        <FlatList
          data={items}
          keyExtractor={(c) => c.id}
          refreshing={loading}
          onRefresh={load}
          ListEmptyComponent={
            !loading ? (
              <Empty
                title="No categories"
                subtitle="Tap + to create your first category."
              />
            ) : null
          }
          renderItem={({ item }) => (
            <List.Item
              title={item.name}
              left={(p2) => <List.Icon {...p2} icon="tag-outline" />}
              right={() => (
                <View style={{ flexDirection: 'row' }}>
                  <IconButton icon="pencil" onPress={() => openEdit(item)} />
                  <IconButton icon="delete-outline" onPress={() => onDelete(item)} />
                </View>
              )}
            />
          )}
        />
      </Screen>
      <Portal>
        <Dialog visible={dialog !== null} onDismiss={() => setDialog(null)}>
          <Dialog.Title>
            {dialog?.mode === 'create' ? 'New category' : 'Edit category'}
          </Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Name"
              value={name}
              onChangeText={setName}
              mode="outlined"
              autoFocus
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDialog(null)}>Cancel</Button>
            <Button onPress={onSubmit} loading={busy} disabled={busy || !name.trim()}>
              {dialog?.mode === 'create' ? 'Create' : 'Save'}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: palette.black },
});
