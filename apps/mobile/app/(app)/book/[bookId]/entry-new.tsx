import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, HelperText, SegmentedButtons, Text, TextInput } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { extractErrorMessage } from '@/api/client';
import { createEntry, listCategories, listPaymentModes } from '@/api/endpoints';
import type { Category, EntryType, PaymentMode } from '@/api/types';
import { Screen } from '@/components/Screen';
import { useAppSelector } from '@/state/hooks';
import { parseAmount } from '@/utils/money';

export default function NewEntryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ bookId: string }>();
  const bookId = params.bookId;
  const businessId = useAppSelector((s) => s.auth.activeBusinessId);

  const [type, setType] = useState<EntryType>('in');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [paymentModes, setPaymentModes] = useState<PaymentMode[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [paymentModeId, setPaymentModeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!businessId) return;
    Promise.all([listCategories(businessId), listPaymentModes(businessId)])
      .then(([cats, pms]) => {
        setCategories(cats);
        setPaymentModes(pms);
      })
      .catch((e) => setError(extractErrorMessage(e)));
  }, [businessId]);

  const submit = async () => {
    setError(null);
    if (!businessId || !bookId) {
      setError('Missing context');
      return;
    }
    const cents = parseAmount(amount);
    if (cents === null) {
      setError('Enter a valid amount');
      return;
    }
    setBusy(true);
    try {
      await createEntry(businessId, String(bookId), {
        type,
        amount_cents: cents,
        occurred_at: new Date().toISOString(),
        description: description.trim() || undefined,
        category_id: categoryId ?? undefined,
        payment_mode_id: paymentModeId ?? undefined,
      });
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
        Add entry
      </Text>

      <SegmentedButtons
        value={type}
        onValueChange={(v) => setType(v as EntryType)}
        buttons={[
          { value: 'in', label: 'Cash In', icon: 'arrow-down', style: type === 'in' ? styles.inBtn : undefined },
          { value: 'out', label: 'Cash Out', icon: 'arrow-up', style: type === 'out' ? styles.outBtn : undefined },
        ]}
        style={{ marginBottom: 16 }}
      />

      <TextInput
        label="Amount"
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        mode="outlined"
        style={styles.input}
      />

      <TextInput
        label="Description (optional)"
        value={description}
        onChangeText={setDescription}
        mode="outlined"
        multiline
        style={styles.input}
      />

      <Text variant="labelLarge" style={styles.section}>
        Category
      </Text>
      <View style={styles.chips}>
        {categories.map((c) => (
          <Button
            key={c.id}
            mode={categoryId === c.id ? 'contained' : 'outlined'}
            onPress={() => setCategoryId(categoryId === c.id ? null : c.id)}
            compact
          >
            {c.name}
          </Button>
        ))}
      </View>

      <Text variant="labelLarge" style={styles.section}>
        Payment mode
      </Text>
      <View style={styles.chips}>
        {paymentModes.map((p) => (
          <Button
            key={p.id}
            mode={paymentModeId === p.id ? 'contained' : 'outlined'}
            onPress={() => setPaymentModeId(paymentModeId === p.id ? null : p.id)}
            compact
          >
            {p.name}
          </Button>
        ))}
      </View>

      <HelperText type="error" visible={!!error}>
        {error ?? ' '}
      </HelperText>

      <Button
        mode="contained"
        onPress={submit}
        loading={busy}
        disabled={busy}
        style={{ marginTop: 8 }}
      >
        Save entry
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: 16 },
  input: { marginBottom: 12 },
  section: { marginTop: 12, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  inBtn: { backgroundColor: '#DCFCE7' },
  outBtn: { backgroundColor: '#FEE2E2' },
});
