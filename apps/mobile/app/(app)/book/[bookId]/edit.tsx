import { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Appbar, Button, HelperText, Switch, Text, TextInput } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { extractErrorMessage } from '@/api/client';
import { deleteBook, getBook, updateBook } from '@/api/endpoints';
import { Screen } from '@/components/Screen';
import { useAppSelector } from '@/state/hooks';
import { palette } from '@/theme';
import { formatCentsRaw, parseAmount } from '@/utils/money';

export default function EditBookScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ bookId: string }>();
  const bookId = params.bookId;
  const businessId = useAppSelector((s) => s.auth.activeBusinessId);
  const [name, setName] = useState('');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [archived, setArchived] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!businessId || !bookId) return;
    getBook(businessId, String(bookId))
      .then((b) => {
        setName(b.name);
        setOpeningBalance(formatCentsRaw(b.opening_balance_cents));
        setArchived(b.archived_at !== null);
      })
      .catch((e) => setError(extractErrorMessage(e)))
      .finally(() => setLoading(false));
  }, [businessId, bookId]);

  const onSave = async () => {
    if (!businessId || !bookId || !name.trim()) return;
    const cents = parseAmount(openingBalance);
    setBusy(true);
    setError(null);
    try {
      await updateBook(businessId, String(bookId), {
        name: name.trim(),
        opening_balance_cents: cents ?? 0,
        archived,
      });
      router.back();
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const onDelete = () => {
    if (!businessId || !bookId) return;
    Alert.alert(
      'Delete this book?',
      'Entries inside will become inaccessible. This cannot be undone from the app.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteBook(businessId, String(bookId));
              router.replace('/(app)/books');
            } catch (e) {
              Alert.alert('Error', extractErrorMessage(e));
            }
          },
        },
      ],
    );
  };

  return (
    <>
      <Appbar.Header style={styles.header}>
        <Appbar.BackAction color={palette.white} onPress={() => router.back()} />
        <Appbar.Content color={palette.white} title="Edit book" />
      </Appbar.Header>
      <Screen scroll>
        <TextInput
          label="Name"
          value={name}
          onChangeText={setName}
          mode="outlined"
          style={styles.input}
        />
        <TextInput
          label="Opening balance"
          value={openingBalance}
          onChangeText={setOpeningBalance}
          keyboardType="decimal-pad"
          mode="outlined"
          style={styles.input}
        />
        <View style={styles.toggleRow}>
          <Text variant="bodyLarge">Archive book</Text>
          <Switch value={archived} onValueChange={setArchived} />
        </View>

        <HelperText type="error" visible={!!error}>{error ?? ' '}</HelperText>

        <Button mode="contained" onPress={onSave} loading={busy} disabled={busy || loading}>
          Save changes
        </Button>
        <Button
          mode="outlined"
          onPress={onDelete}
          textColor={palette.cashOut}
          style={styles.deleteBtn}
        >
          Delete book
        </Button>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: palette.black },
  input: { marginBottom: 12 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    marginBottom: 8,
  },
  deleteBtn: { marginTop: 24, borderColor: palette.cashOut },
});
