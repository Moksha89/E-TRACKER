import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Button, HelperText, Text, TextInput } from 'react-native-paper';
import { useRouter } from 'expo-router';

import { extractErrorMessage } from '@/api/client';
import { createBook } from '@/api/endpoints';
import { Screen } from '@/components/Screen';
import { useAppSelector } from '@/state/hooks';
import { parseAmount } from '@/utils/money';

export default function NewBookScreen() {
  const router = useRouter();
  const businessId = useAppSelector((s) => s.auth.activeBusinessId);
  const [name, setName] = useState('');
  const [opening, setOpening] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    if (!businessId) {
      setError('Select a business first');
      return;
    }
    if (name.trim().length === 0) {
      setError('Enter a book name');
      return;
    }
    const opCents = opening ? parseAmount(opening) ?? 0 : 0;
    setBusy(true);
    try {
      await createBook(businessId, { name: name.trim(), opening_balance_cents: opCents });
      router.back();
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      <Text variant="titleLarge" style={styles.title}>
        New cashbook
      </Text>
      <TextInput
        label="Book name (e.g. Daily Cash)"
        value={name}
        onChangeText={setName}
        mode="outlined"
        style={styles.input}
      />
      <TextInput
        label="Opening balance (optional)"
        value={opening}
        onChangeText={setOpening}
        keyboardType="decimal-pad"
        mode="outlined"
        style={styles.input}
      />
      <HelperText type="error" visible={!!error}>
        {error ?? ' '}
      </HelperText>
      <Button mode="contained" onPress={submit} loading={busy} disabled={busy}>
        Create book
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: 16 },
  input: { marginBottom: 12 },
});
