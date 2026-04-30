import { useState } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { Button, Chip, Text, TextInput } from 'react-native-paper';
import { useRouter } from 'expo-router';

import { extractErrorMessage } from '@/api/client';
import { inviteMember } from '@/api/endpoints';
import type { MemberRole } from '@/api/types';
import { Screen } from '@/components/Screen';
import { useAppSelector } from '@/state/hooks';
import { palette } from '@/theme';

const ROLE_OPTIONS: MemberRole[] = ['partner', 'staff', 'viewer'];

export default function InviteMemberScreen() {
  const router = useRouter();
  const businessId = useAppSelector((s) => s.auth.activeBusinessId);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<MemberRole>('staff');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    if (!businessId) return;
    if (!phone.trim()) {
      Alert.alert('Phone required', 'Enter the phone number to invite.');
      return;
    }
    setSubmitting(true);
    try {
      await inviteMember(businessId, {
        phone: phone.trim(),
        role,
        name: name.trim() || undefined,
      });
      router.back();
    } catch (e) {
      Alert.alert('Could not invite', extractErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <Text variant="headlineSmall" style={styles.title}>
        Invite a member
      </Text>
      <Text variant="bodyMedium" style={styles.subtitle}>
        They&apos;ll see this business once they sign in with the same phone number.
      </Text>
      <TextInput
        label="Phone number"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        mode="outlined"
        autoCapitalize="none"
        style={styles.input}
      />
      <TextInput
        label="Name (optional)"
        value={name}
        onChangeText={setName}
        mode="outlined"
        style={styles.input}
      />
      <Text variant="labelLarge" style={styles.label}>
        Role
      </Text>
      <Text variant="bodySmall" style={styles.roleHint}>
        Partner: full access. Staff: can add/edit entries. Viewer: read-only.
      </Text>
      <Chip
        selected={role === 'partner'}
        onPress={() => setRole('partner')}
        style={styles.chip}
      >
        Partner
      </Chip>
      <Chip
        selected={role === 'staff'}
        onPress={() => setRole('staff')}
        style={styles.chip}
      >
        Staff
      </Chip>
      <Chip
        selected={role === 'viewer'}
        onPress={() => setRole('viewer')}
        style={styles.chip}
      >
        Viewer
      </Chip>
      <Button
        mode="contained"
        onPress={onSubmit}
        loading={submitting}
        disabled={submitting || !ROLE_OPTIONS.includes(role)}
        style={styles.submit}
      >
        Send invite
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: 8 },
  subtitle: { color: palette.textMuted, marginBottom: 16 },
  input: { marginBottom: 12 },
  label: { marginTop: 8 },
  roleHint: { color: palette.textMuted, marginBottom: 8 },
  chip: { marginBottom: 8, alignSelf: 'flex-start' },
  submit: { marginTop: 16 },
});
