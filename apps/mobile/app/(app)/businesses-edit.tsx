import { useEffect, useState } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { Appbar, Button, Dialog, HelperText, Portal, Text, TextInput } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { extractErrorMessage } from '@/api/client';
import { deleteBusiness, fetchMe, listBusinesses, requestOtp, updateBusiness } from '@/api/endpoints';
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
  const [otpDialog, setOtpDialog] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpBusy, setOtpBusy] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);

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
              const msg = extractErrorMessage(e);
              if (msg !== 'otp_required') {
                Alert.alert('Error', msg);
                return;
              }
              try {
                const me = await fetchMe();
                await requestOtp(me.phone, 'sensitive');
              } catch (sendErr) {
                Alert.alert('Error', extractErrorMessage(sendErr));
                return;
              }
              setOtpCode('');
              setOtpError(null);
              setOtpDialog(true);
            }
          },
        },
      ],
    );
  };

  const onConfirmOtpDelete = async () => {
    if (!businessId) return;
    if (!otpCode.trim()) {
      setOtpError('Enter the OTP');
      return;
    }
    setOtpBusy(true);
    setOtpError(null);
    try {
      await deleteBusiness(businessId, otpCode.trim());
      setOtpDialog(false);
      dispatch(setActiveBusiness(null));
      router.replace('/(app)/businesses');
    } catch (err) {
      setOtpError(extractErrorMessage(err));
    } finally {
      setOtpBusy(false);
    }
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
      <Portal>
        <Dialog visible={otpDialog} onDismiss={() => setOtpDialog(false)}>
          <Dialog.Title>Confirm with Telegram OTP</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium" style={{ marginBottom: 12 }}>
              2FA is enabled. Enter the 6-digit code we just sent to your Telegram.
            </Text>
            <TextInput
              label="OTP"
              value={otpCode}
              onChangeText={setOtpCode}
              mode="outlined"
              keyboardType="number-pad"
            />
            <HelperText type="error" visible={!!otpError}>{otpError ?? ' '}</HelperText>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setOtpDialog(false)}>Cancel</Button>
            <Button onPress={onConfirmOtpDelete} loading={otpBusy} disabled={otpBusy}>
              Delete
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
  deleteBtn: { marginTop: 24, borderColor: palette.cashOut },
});
