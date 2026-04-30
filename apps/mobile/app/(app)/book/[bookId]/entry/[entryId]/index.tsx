import { useCallback, useState } from 'react';
import { Image, Linking, ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Appbar,
  Button,
  Card,
  Dialog,
  IconButton,
  List,
  Portal,
  Text,
} from 'react-native-paper';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

import { extractErrorMessage, getApiBaseUrl } from '@/api/client';
import {
  deleteAttachment,
  deleteEntry,
  getEntry,
  listAttachments,
  listCategories,
  listPaymentModes,
  uploadAttachment,
  type Attachment,
} from '@/api/endpoints';
import type { Category, Entry, PaymentMode } from '@/api/types';
import { Screen } from '@/components/Screen';
import { useAppSelector } from '@/state/hooks';
import { palette } from '@/theme';
import { formatCents } from '@/utils/money';
import * as ImagePicker from 'expo-image-picker';

export default function EntryDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ bookId: string; entryId: string }>();
  const businessId = useAppSelector((s) => s.auth.activeBusinessId);
  const token = useAppSelector((s) => s.auth.accessToken);
  const [entry, setEntry] = useState<Entry | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [paymentModes, setPaymentModes] = useState<PaymentMode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    if (!businessId || !params.bookId || !params.entryId) return;
    setLoading(true);
    setError(null);
    try {
      const [e, atts, cats, pms] = await Promise.all([
        getEntry(businessId, String(params.bookId), String(params.entryId)),
        listAttachments(businessId, String(params.bookId), String(params.entryId)),
        listCategories(businessId),
        listPaymentModes(businessId),
      ]);
      setEntry(e);
      setAttachments(atts);
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

  const onDelete = async () => {
    if (!businessId || !entry || !params.bookId) return;
    try {
      await deleteEntry(businessId, String(params.bookId), entry.id);
      router.back();
    } catch (e) {
      setError(extractErrorMessage(e));
    }
  };

  const onAddAttachment = async () => {
    if (!businessId || !entry || !params.bookId) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError('Photo library permission is required.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    try {
      await uploadAttachment(businessId, String(params.bookId), entry.id, {
        uri: asset.uri,
        name: asset.fileName ?? `receipt-${Date.now()}.jpg`,
        type: asset.mimeType ?? 'image/jpeg',
      });
      await load();
    } catch (e) {
      setError(extractErrorMessage(e));
    }
  };

  const onRemoveAttachment = async (attId: string) => {
    if (!businessId || !entry || !params.bookId) return;
    try {
      await deleteAttachment(businessId, String(params.bookId), entry.id, attId);
      await load();
    } catch (e) {
      setError(extractErrorMessage(e));
    }
  };

  const openAttachment = (att: Attachment) => {
    const base = getApiBaseUrl();
    const sep = att.download_url.includes('?') ? '&' : '?';
    const url = `${base}${att.download_url}${sep}token=${encodeURIComponent(token ?? '')}`;
    Linking.openURL(url).catch(() => undefined);
  };

  if (!entry && loading) {
    return (
      <Screen>
        <ActivityIndicator />
      </Screen>
    );
  }

  if (!entry) {
    return (
      <Screen>
        <Text>{error ?? 'Entry not found'}</Text>
      </Screen>
    );
  }

  const cat = categories.find((c) => c.id === entry.category_id);
  const pm = paymentModes.find((p) => p.id === entry.payment_mode_id);
  const isIn = entry.type === 'in';

  return (
    <>
      <Appbar.Header style={styles.header}>
        <Appbar.BackAction color={palette.white} onPress={() => router.back()} />
        <Appbar.Content color={palette.white} title="Entry" />
        <Appbar.Action
          icon="pencil"
          color={palette.white}
          onPress={() =>
            router.push({
              pathname: '/(app)/book/[bookId]/entry/[entryId]/edit',
              params: { bookId: String(params.bookId), entryId: entry.id },
            })
          }
        />
        <Appbar.Action
          icon="delete-outline"
          color={palette.white}
          onPress={() => setConfirmDelete(true)}
        />
      </Appbar.Header>
      <ScrollView contentContainerStyle={styles.content}>
        <Card mode="outlined" style={styles.card}>
          <Card.Content>
            <Text variant="labelSmall" style={styles.muted}>
              {isIn ? 'CASH IN' : 'CASH OUT'}
            </Text>
            <Text
              variant="displaySmall"
              style={[styles.amount, { color: isIn ? palette.cashIn : palette.cashOut }]}
            >
              {formatCents(entry.amount_cents)}
            </Text>
            <Text variant="bodyMedium" style={styles.muted}>
              {new Date(entry.occurred_at).toLocaleString()}
            </Text>
          </Card.Content>
        </Card>

        {entry.description ? (
          <Card mode="outlined" style={styles.card}>
            <Card.Content>
              <Text variant="labelSmall" style={styles.muted}>NOTE</Text>
              <Text variant="bodyLarge">{entry.description}</Text>
            </Card.Content>
          </Card>
        ) : null}

        <Card mode="outlined" style={styles.card}>
          <List.Item
            title="Category"
            description={cat?.name ?? '—'}
            left={(p2) => <List.Icon {...p2} icon="tag-outline" />}
          />
          <List.Item
            title="Payment mode"
            description={pm?.name ?? '—'}
            left={(p2) => <List.Icon {...p2} icon="credit-card-outline" />}
          />
        </Card>

        <View style={styles.attHeader}>
          <Text variant="titleMedium">Attachments</Text>
          <Button mode="outlined" icon="paperclip" compact onPress={onAddAttachment}>
            Add
          </Button>
        </View>
        {attachments.length === 0 ? (
          <Text variant="bodySmall" style={styles.muted}>No attachments yet.</Text>
        ) : (
          <View style={styles.grid}>
            {attachments.map((att) => {
              const isImage = (att.mime_type ?? '').startsWith('image/');
              const base = getApiBaseUrl();
              const previewUrl = `${base}${att.download_url}?token=${encodeURIComponent(token ?? '')}`;
              return (
                <Card mode="outlined" key={att.id} style={styles.attCard}>
                  {isImage ? (
                    <Image source={{ uri: previewUrl }} style={styles.preview} />
                  ) : (
                    <View style={styles.fileBox}>
                      <List.Icon icon="file-document-outline" />
                    </View>
                  )}
                  <View style={styles.attMeta}>
                    <Text variant="bodySmall" numberOfLines={1}>
                      {att.original_filename ?? 'file'}
                    </Text>
                    <View style={{ flexDirection: 'row' }}>
                      <IconButton
                        icon="open-in-new"
                        size={18}
                        onPress={() => openAttachment(att)}
                      />
                      <IconButton
                        icon="delete-outline"
                        size={18}
                        onPress={() => onRemoveAttachment(att.id)}
                      />
                    </View>
                  </View>
                </Card>
              );
            })}
          </View>
        )}

        {error ? (
          <Text style={{ color: palette.cashOut, marginTop: 12 }}>{error}</Text>
        ) : null}
      </ScrollView>

      <Portal>
        <Dialog visible={confirmDelete} onDismiss={() => setConfirmDelete(false)}>
          <Dialog.Title>Delete this entry?</Dialog.Title>
          <Dialog.Content>
            <Text>This will remove the entry and its attachments. This cannot be undone.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmDelete(false)}>Cancel</Button>
            <Button
              textColor={palette.cashOut}
              onPress={() => {
                setConfirmDelete(false);
                onDelete();
              }}
            >
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
  content: { padding: 16, paddingBottom: 48 },
  card: { marginBottom: 12, backgroundColor: palette.surface },
  amount: { fontWeight: '700', marginVertical: 4 },
  muted: { color: palette.textMuted },
  attHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 8,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  attCard: { width: '48%', backgroundColor: palette.surface },
  preview: { width: '100%', height: 120, resizeMode: 'cover' },
  fileBox: {
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.background,
  },
  attMeta: {
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
