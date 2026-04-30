import { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import {
  Button,
  Chip,
  Divider,
  Modal,
  Portal,
  SegmentedButtons,
  Text,
  TextInput,
} from 'react-native-paper';
import DateTimePicker from '@react-native-community/datetimepicker';

import type { Category, PaymentMode } from '@/api/types';
import type { EntryFilter } from '@/api/endpoints';
import { palette } from '@/theme';

export interface EntryFiltersSheetProps {
  visible: boolean;
  initial: EntryFilter;
  categories: Category[];
  paymentModes: PaymentMode[];
  onDismiss: () => void;
  onApply: (filter: EntryFilter) => void;
}

type DatePickerKind = 'from' | 'to' | null;

function toDateOrUndef(v: string | undefined): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function EntryFiltersSheet(props: EntryFiltersSheetProps) {
  const { visible, initial, categories, paymentModes, onDismiss, onApply } = props;
  const [type, setType] = useState<'all' | 'in' | 'out'>(initial.type ?? 'all');
  const [from, setFrom] = useState<Date | undefined>(toDateOrUndef(initial.from));
  const [to, setTo] = useState<Date | undefined>(toDateOrUndef(initial.to));
  const [categoryId, setCategoryId] = useState<string | null>(initial.category_id ?? null);
  const [paymentModeId, setPaymentModeId] = useState<string | null>(
    initial.payment_mode_id ?? null,
  );
  const [search, setSearch] = useState<string>(initial.search ?? '');
  const [picker, setPicker] = useState<DatePickerKind>(null);

  useEffect(() => {
    if (visible) {
      setType(initial.type ?? 'all');
      setFrom(toDateOrUndef(initial.from));
      setTo(toDateOrUndef(initial.to));
      setCategoryId(initial.category_id ?? null);
      setPaymentModeId(initial.payment_mode_id ?? null);
      setSearch(initial.search ?? '');
    }
  }, [visible, initial]);

  const apply = () => {
    const next: EntryFilter = { limit: initial.limit ?? 100 };
    if (type !== 'all') next.type = type;
    if (from) next.from = from.toISOString();
    if (to) next.to = to.toISOString();
    if (categoryId) next.category_id = categoryId;
    if (paymentModeId) next.payment_mode_id = paymentModeId;
    const trimmed = search.trim();
    if (trimmed) next.search = trimmed;
    onApply(next);
  };

  const clear = () => {
    setType('all');
    setFrom(undefined);
    setTo(undefined);
    setCategoryId(null);
    setPaymentModeId(null);
    setSearch('');
    onApply({ limit: initial.limit ?? 100 });
  };

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={styles.modal}
      >
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text variant="titleLarge" style={styles.title}>
            Filter entries
          </Text>

          <Text variant="labelLarge" style={styles.label}>
            Type
          </Text>
          <SegmentedButtons
            value={type}
            onValueChange={(v) => setType(v as 'all' | 'in' | 'out')}
            buttons={[
              { value: 'all', label: 'All' },
              { value: 'in', label: 'Cash In' },
              { value: 'out', label: 'Cash Out' },
            ]}
          />

          <Text variant="labelLarge" style={styles.label}>
            Date range
          </Text>
          <View style={styles.dateRow}>
            <Button
              mode="outlined"
              icon="calendar"
              onPress={() => setPicker('from')}
              style={styles.dateBtn}
            >
              {from ? from.toLocaleDateString() : 'From'}
            </Button>
            <Button
              mode="outlined"
              icon="calendar"
              onPress={() => setPicker('to')}
              style={styles.dateBtn}
            >
              {to ? to.toLocaleDateString() : 'To'}
            </Button>
          </View>
          {(from || to) && (
            <Button
              mode="text"
              compact
              onPress={() => {
                setFrom(undefined);
                setTo(undefined);
              }}
              textColor={palette.cashOut}
            >
              Clear date range
            </Button>
          )}
          {picker !== null && (
            <DateTimePicker
              value={(picker === 'from' ? from : to) ?? new Date()}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={(_event, selected) => {
                if (Platform.OS === 'android') setPicker(null);
                if (!selected) return;
                if (picker === 'from') {
                  const d = new Date(selected);
                  d.setHours(0, 0, 0, 0);
                  setFrom(d);
                } else {
                  const d = new Date(selected);
                  d.setHours(23, 59, 59, 999);
                  setTo(d);
                }
                if (Platform.OS === 'ios') setPicker(null);
              }}
            />
          )}

          <Divider style={styles.divider} />

          <Text variant="labelLarge" style={styles.label}>
            Category
          </Text>
          <View style={styles.chips}>
            <Chip
              selected={categoryId === null}
              onPress={() => setCategoryId(null)}
              style={styles.chip}
            >
              Any
            </Chip>
            {categories.map((c) => (
              <Chip
                key={c.id}
                selected={categoryId === c.id}
                onPress={() => setCategoryId(c.id)}
                style={styles.chip}
              >
                {c.name}
              </Chip>
            ))}
          </View>

          <Text variant="labelLarge" style={styles.label}>
            Payment mode
          </Text>
          <View style={styles.chips}>
            <Chip
              selected={paymentModeId === null}
              onPress={() => setPaymentModeId(null)}
              style={styles.chip}
            >
              Any
            </Chip>
            {paymentModes.map((p) => (
              <Chip
                key={p.id}
                selected={paymentModeId === p.id}
                onPress={() => setPaymentModeId(p.id)}
                style={styles.chip}
              >
                {p.name}
              </Chip>
            ))}
          </View>

          <Text variant="labelLarge" style={styles.label}>
            Search
          </Text>
          <TextInput
            mode="outlined"
            value={search}
            onChangeText={setSearch}
            placeholder="Match description"
            style={styles.search}
          />

          <View style={styles.actions}>
            <Button mode="text" onPress={clear} textColor={palette.cashOut}>
              Reset
            </Button>
            <Button mode="text" onPress={onDismiss}>
              Cancel
            </Button>
            <Button mode="contained" onPress={apply} buttonColor={palette.black}>
              Apply
            </Button>
          </View>
        </ScrollView>
      </Modal>
    </Portal>
  );
}

export function countActiveFilters(filter: EntryFilter): number {
  let n = 0;
  if (filter.type) n += 1;
  if (filter.from || filter.to) n += 1;
  if (filter.category_id) n += 1;
  if (filter.payment_mode_id) n += 1;
  if (filter.search) n += 1;
  if (filter.party_id) n += 1;
  return n;
}

const styles = StyleSheet.create({
  modal: {
    backgroundColor: palette.surface,
    margin: 16,
    borderRadius: 12,
    maxHeight: '90%',
  },
  scroll: { padding: 20, gap: 8 },
  title: { marginBottom: 12 },
  label: { marginTop: 12, marginBottom: 6 },
  dateRow: { flexDirection: 'row', gap: 8 },
  dateBtn: { flex: 1 },
  divider: { marginVertical: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {},
  search: {},
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 16 },
});
