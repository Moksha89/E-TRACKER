import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Button, HelperText, Text, TextInput } from 'react-native-paper';
import { useRouter } from 'expo-router';

import { extractErrorMessage } from '@/api/client';
import { createBusiness } from '@/api/endpoints';
import { Screen } from '@/components/Screen';
import { setActiveBusiness } from '@/state/auth';
import { useAppDispatch } from '@/state/hooks';

export default function NewBusinessScreen() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    if (name.trim().length < 1) {
      setError('Enter a business name');
      return;
    }
    setBusy(true);
    try {
      const biz = await createBusiness({ name: name.trim(), currency });
      dispatch(setActiveBusiness(biz.id));
      router.replace('/(app)/books');
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      <Text variant="titleLarge" style={styles.title}>
        Create a business
      </Text>
      <TextInput
        label="Business name"
        value={name}
        onChangeText={setName}
        mode="outlined"
        style={styles.input}
      />
      <TextInput
        label="Currency"
        value={currency}
        onChangeText={(v) => setCurrency(v.toUpperCase())}
        autoCapitalize="characters"
        maxLength={3}
        mode="outlined"
        style={styles.input}
      />
      <HelperText type="error" visible={!!error}>
        {error ?? ' '}
      </HelperText>
      <Button mode="contained" onPress={submit} loading={busy} disabled={busy}>
        Create
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: 16 },
  input: { marginBottom: 12 },
});
