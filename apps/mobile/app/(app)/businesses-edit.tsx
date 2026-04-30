import { useEffect, useState } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { Appbar, Button, HelperText, TextInput } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { extractErrorMessage } from '@/api/client';
import { deleteBusiness, listBusinesses, updateBusiness } from '@/api/endpoints';
import { Screen } from '@/components/Screen';
import { setActiveBusiness } from '@/state/auth';
import { useAppDispatch } from '@/state/hooks';
import { palette } from '@/theme';

export default function EditBusinessScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ businessId: string }>();
  const businessId = params.businessId;
  const dispatch = useAppDispatch();
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [gstNumber, setGstNumber] = useState('');
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!businessId) return;
    listBusinesses()
      .then((list) => {
        const b = list.find((x) => x.id === businessId);
        if (!b) {
          setError('Business not found');
          return;
        }
        setName(b.name);
        setCurrency(b.currency);
        setGstNumber(b.gst_number ?? '');
        setAddress(b.address ?? '');
      })
      .catch((e) => setError(extractErrorMessage(e)))
      .finally(() => setLoading(false));
  }, [businessId]);

  const onSave = async () => {
    if (!businessId || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await updateBusiness(businessId, {
        name: name.trim(),
        currency: currency.trim() || 'INR',
        gst_number: gstNumber.trim() || null,
        address: address.trim() || null,
      });
      router.back();
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const onDelete = () => {
    if (!businessId) return;
    Alert.alert(
      'Delete this business?',
      'This will hide it for all members. Existing data is kept on the server but the app will no longer show it.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteBusiness(businessId);
              dispatch(setActiveBusiness(null));
              router.replace('/(app)/businesses');
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
        <Appbar.Content color={palette.white} title="Edit business" />
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
          label="Currency"
          value={currency}
          onChangeText={setCurrency}
          mode="outlined"
          autoCapitalize="characters"
          maxLength={3}
          style={styles.input}
        />
        <TextInput
          label="GST number (optional)"
          value={gstNumber}
          onChangeText={setGstNumber}
          mode="outlined"
          autoCapitalize="characters"
          style={styles.input}
        />
        <TextInput
          label="Address (optional)"
          value={address}
          onChangeText={setAddress}
          mode="outlined"
          multiline
          style={styles.input}
        />

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
          Delete business
        </Button>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: palette.black },
  input: { marginBottom: 12 },
  deleteBtn: { marginTop: 24, borderColor: palette.cashOut },
});
