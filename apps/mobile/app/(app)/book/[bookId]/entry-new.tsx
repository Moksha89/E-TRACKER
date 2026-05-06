import { useEffect, useState } from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';
import {
  Appbar,
  Button,
  Chip,
  Dialog,
  HelperText,
  Portal,
  SegmentedButtons,
  Text,
  TextInput,
  TouchableRipple,
} from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';

import { extractErrorMessage } from '@/api/client';
import {
  createCategory,
  createEntry,
  listCategories,
  listPaymentModes,
  uploadAttachment,
} from '@/api/endpoints';
import type { Category, EntryType, PaymentMode } from '@/api/types';
import { Screen } from '@/components/Screen';
import { useAppSelector } from '@/state/hooks';
import { palette } from '@/theme';
import { parseAmount } from '@/utils/money';

export default function NewEntryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ bookId: string }>();
  const bookId = params.bookId;
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
  const [attachment, setAttachment] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [creatingCategory, setCreatingCategory] = useState(false);

  const pickFromGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError('Photo library permission is required to attach a receipt.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setAttachment(result.assets[0]);
    }
  };

  const captureFromCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setError('Camera permission is required to take a photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setAttachment(result.assets[0]);
    }
  };

  const submitNewCategory = async () => {
    const name = newCategoryName.trim();
    if (!name || !businessId) return;
    setCreatingCategory(true);
    try {
      const created = await createCategory(businessId, { name });
      setCategories((prev) => [...prev, created]);
      setCategoryId(created.id);
      setNewCategoryOpen(false);
      setNewCategoryName('');
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setCreatingCategory(false);
    }
  };

  useEffect(() => {
    if (!businessId) return;
    Promise.all([listCategories(businessId), listPaymentModes(businessId)])
      .then(([cats, pms]) => {
        setCategories(cats);
        setPaymentModes(pms);
      })
      .catch((e) => setError(extractErrorMessage(e)));
  }, [businessId]);

  const onChangeDate = (_: unknown, selected?: Date) => {
    if (Platform.OS !== 'ios') setShowDate(false);
    if (selected) {
      const next = new Date(occurredAt);
      next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
      setOccurredAt(next);
    }
  };

  const onChangeTime = (_: unknown, selected?: Date) => {
    if (Platform.OS !== 'ios') setShowTime(false);
    if (selected) {
      const next = new Date(occurredAt);
      next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
      setOccurredAt(next);
    }
  };

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
      const created = await createEntry(businessId, String(bookId), {
        type,
        amount_cents: cents,
        occurred_at: occurredAt.toISOString(),
        description: description.trim() || undefined,
        category_id: categoryId ?? undefined,
        payment_mode_id: paymentModeId ?? undefined,
      });
      if (attachment) {
        const filename = attachment.fileName ?? `receipt-${Date.now()}.jpg`;
        await uploadAttachment(businessId, String(bookId), created.id, {
          uri: attachment.uri,
          name: filename,
          type: attachment.mimeType ?? 'image/jpeg',
        });
      }
      router.back();
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Appbar.Header style={styles.header}>
        <Appbar.BackAction color={palette.white} onPress={() => router.back()} />
        <Appbar.Content color={palette.white} title="Add entry" />
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
          <Button
            mode="outlined"
            icon="plus"
            onPress={() => setNewCategoryOpen(true)}
            compact
          >
            Other / new
          </Button>
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

        <Text variant="labelLarge" style={styles.section}>
          Attachment
        </Text>
        <View style={styles.attachmentRow}>
          <Button mode="outlined" icon="camera" onPress={captureFromCamera}>
            {attachment ? 'Retake' : 'Take photo'}
          </Button>
          <Button mode="outlined" icon="image" onPress={pickFromGallery}>
            {attachment ? 'Replace' : 'Gallery'}
          </Button>
          {attachment ? (
            <>
              <Image source={{ uri: attachment.uri }} style={styles.thumb} />
              <Chip
                compact
                icon="close"
                onPress={() => setAttachment(null)}
                style={styles.removeChip}
              >
                Remove
              </Chip>
            </>
          ) : null}
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
      <Portal>
        <Dialog visible={newCategoryOpen} onDismiss={() => setNewCategoryOpen(false)}>
          <Dialog.Title>New category</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Category name"
              value={newCategoryName}
              onChangeText={setNewCategoryName}
              mode="outlined"
              autoFocus
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setNewCategoryOpen(false)}>Cancel</Button>
            <Button
              onPress={submitNewCategory}
              loading={creatingCategory}
              disabled={creatingCategory || !newCategoryName.trim()}
            >
              Create
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: palette.black },
  input: { marginBottom: 12 },
  section: { marginTop: 12, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  attachmentRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  thumb: { width: 64, height: 64, borderRadius: 6 },
  removeChip: { alignSelf: 'center' },
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
