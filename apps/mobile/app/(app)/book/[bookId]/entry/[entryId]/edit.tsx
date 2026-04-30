import { useCallback, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Appbar,
  Button,
  HelperText,
  SegmentedButtons,
  Text,
  TextInput,
  TouchableRipple,
} from 'react-native-paper';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';

import { extractErrorMessage } from '@/api/client';
import {
  getEntry,
  listCategories,
  listPaymentModes,
  updateEntry,
} from '@/api/endpoints';
import type { Category, EntryType, PaymentMode } from '@/api/types';
import { Screen } from '@/components/Screen';
import { useAppSelector } from '@/state/hooks';
import { palette } from '@/theme';
import { formatCentsRaw, parseAmount } from '@/utils/money';

export default function EntryEditScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ bookId: string; entryId: string }>();
  const businessId = useAppSelector((s) => s.auth.activeBusinessId);

  const [type, setType] = useState<EntryType>('in');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [occurredAt, setOccurredAt] = useState<Date>(new Date());
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [paymentModes, setPaymentModes] = useState<PaymentMode[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [paymentModeId, setPaymentModeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!businessId || !params.bookId || !params.entryId) return;
    setLoading(true);
    try {
      const [entry, cats, pms] = await Promise.all([
        getEntry(businessId, String(params.bookId), String(params.entryId)),
        listCategories(businessId),
        listPaymentModes(businessId),
      ]);
      setType(entry.type);
      setAmount(formatCentsRaw(entry.amount_cents));
      setDescription(entry.description ?? '');
      setOccurredAt(new Date(entry.occurred_at));
      setCategoryId(entry.category_id);
      setPaymentModeId(entry.payment_mode_id);
      setCategories(cats);
      setPaymentModes(pms);
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [businessId, params.bookId, params.entryId]);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  const onChangeDate = (_: unknown, sel?: Date) => {
    if (Platform.OS !== 'ios') setShowDate(false);
    if (sel) {
      const next = new Date(occurredAt);
      next.setFullYear(sel.getFullYear(), sel.getMonth(), sel.getDate());
      setOccurredAt(next);
    }
  };
  const onChangeTime = (_: unknown, sel?: Date) => {
    if (Platform.OS !== 'ios') setShowTime(false);
    if (sel) {
      const next = new Date(occurredAt);
      next.setHours(sel.getHours(), sel.getMinutes(), 0, 0);
      setOccurredAt(next);
    }
  };

  const submit = async () => {
    setError(null);
    if (!businessId || !params.bookId || !params.entryId) return;
    const cents = parseAmount(amount);
    if (cents === null) {
      setError('Enter a valid amount');
      return;
    }
    setBusy(true);
    try {
      await updateEntry(businessId, String(params.bookId), String(params.entryId), {
        type,
        amount_cents: cents,
        occurred_at: occurredAt.toISOString(),
        description: description.trim() || null,
        category_id: categoryId,
        payment_mode_id: paymentModeId,
      });
      router.back();
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Screen>
        <ActivityIndicator />
      </Screen>
    );
  }

  return (
    <>
      <Appbar.Header style={styles.header}>
        <Appbar.BackAction color={palette.white} onPress={() => router.back()} />
        <Appbar.Content color={palette.white} title="Edit entry" />
      </Appbar.Header>
      <Screen scroll>
        <SegmentedButtons
          value={type}
          onValueChange={(v) => setType(v as EntryType)}
          buttons={[
            { value: 'in', label: 'Cash In', icon: 'arrow-down' },
            { value: 'out', label: 'Cash Out', icon: 'arrow-up' },
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

        <View style={styles.dateRow}>
          <TouchableRipple onPress={() => setShowDate(true)} style={styles.dateBtn}>
            <View>
              <Text variant="labelSmall" style={styles.muted}>Date</Text>
              <Text variant="bodyLarge">{occurredAt.toLocaleDateString()}</Text>
            </View>
          </TouchableRipple>
          <TouchableRipple onPress={() => setShowTime(true)} style={styles.dateBtn}>
            <View>
              <Text variant="labelSmall" style={styles.muted}>Time</Text>
              <Text variant="bodyLarge">
                {occurredAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          </TouchableRipple>
        </View>
        {showDate ? (
          <DateTimePicker value={occurredAt} mode="date" onChange={onChangeDate} />
        ) : null}
        {showTime ? (
          <DateTimePicker value={occurredAt} mode="time" onChange={onChangeTime} />
        ) : null}

        <TextInput
          label="Description"
          value={description}
          onChangeText={setDescription}
          mode="outlined"
          multiline
          style={styles.input}
        />

        <Text variant="labelLarge" style={styles.section}>Category</Text>
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

        <Text variant="labelLarge" style={styles.section}>Payment mode</Text>
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

        <Button mode="contained" onPress={submit} loading={busy} disabled={busy}>
          Save changes
        </Button>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: palette.black },
  input: { marginBottom: 12 },
  section: { marginTop: 12, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dateRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  dateBtn: {
    flex: 1,
    padding: 12,
    borderWidth: 1,
    borderColor: palette.borderStrong,
    borderRadius: 8,
    backgroundColor: palette.surface,
  },
  muted: { color: palette.textMuted, marginBottom: 2 },
});
