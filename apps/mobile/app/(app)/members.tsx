import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { Appbar, Button, Card, Chip, FAB, Menu, Text } from 'react-native-paper';
import { useFocusEffect, useRouter } from 'expo-router';

import { extractErrorMessage } from '@/api/client';
import { listMembers, removeMember, updateMember } from '@/api/endpoints';
import type { Member, MemberRole } from '@/api/types';
import { Empty } from '@/components/Empty';
import { Screen } from '@/components/Screen';
import { useAppSelector } from '@/state/hooks';
import { palette } from '@/theme';

const ROLES: MemberRole[] = ['partner', 'staff', 'viewer'];

const ROLE_COLORS: Record<MemberRole, string> = {
  owner: palette.black,
  partner: palette.ink,
  staff: '#3F3F46',
  viewer: palette.textMuted,
};

export default function MembersScreen() {
  const router = useRouter();
  const businessId = useAppSelector((s) => s.auth.activeBusinessId);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openMenuFor, setOpenMenuFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    setError(null);
    try {
      const list = await listMembers(businessId);
      setMembers(list);
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const myUserId = useAppSelector((s) => s.auth.user?.id);
  const myMembership = members.find((m) => m.user_id === myUserId);
  const myRole = myMembership?.role;
  const canManage = myRole === 'owner' || myRole === 'partner';

  const onChangeRole = async (member: Member, role: MemberRole) => {
    if (!businessId) return;
    setOpenMenuFor(null);
    try {
      await updateMember(businessId, member.id, role);
      await load();
    } catch (e) {
      Alert.alert('Could not update role', extractErrorMessage(e));
    }
  };

  const onRemove = (member: Member) => {
    if (!businessId) return;
    Alert.alert(
      'Remove member',
      `Remove ${member.user_name ?? member.user_phone ?? 'this member'} from the business?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeMember(businessId, member.id);
              await load();
            } catch (e) {
              Alert.alert('Could not remove member', extractErrorMessage(e));
            }
          },
        },
      ],
    );
  };

  return (
    <>
      <Appbar.Header style={styles.header}>
        <Appbar.BackAction onPress={() => router.back()} color={palette.white} />
        <Appbar.Content title="Members" color={palette.white} />
      </Appbar.Header>
      <Screen padded={false}>
        {error ? (
          <View style={styles.error}>
            <Text>{error}</Text>
          </View>
        ) : null}
        <FlatList
          data={members}
          keyExtractor={(m) => m.id}
          refreshing={loading}
          onRefresh={load}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 96 }}
          ListEmptyComponent={
            !loading ? (
              <Empty
                title="Just you so far"
                subtitle="Invite partners or staff to share this business."
              />
            ) : null
          }
          renderItem={({ item }) => (
            <Card mode="outlined" style={styles.card}>
              <Card.Content>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text variant="titleMedium">
                      {item.user_name ?? item.user_phone ?? 'Member'}
                    </Text>
                    {item.user_phone ? (
                      <Text variant="bodySmall" style={styles.phone}>
                        {item.user_phone}
                      </Text>
                    ) : null}
                  </View>
                  <Chip
                    compact
                    style={{ backgroundColor: ROLE_COLORS[item.role] }}
                    textStyle={{ color: palette.white }}
                  >
                    {item.role}
                  </Chip>
                </View>
                <View style={styles.statusRow}>
                  <Chip compact mode="outlined">
                    {item.status}
                  </Chip>
                  {canManage && item.role !== 'owner' ? (
                    <View style={styles.actions}>
                      <Menu
                        visible={openMenuFor === item.id}
                        onDismiss={() => setOpenMenuFor(null)}
                        anchor={
                          <Button
                            mode="outlined"
                            compact
                            onPress={() => setOpenMenuFor(item.id)}
                          >
                            Change role
                          </Button>
                        }
                      >
                        {ROLES.filter((r) => r !== item.role).map((r) => (
                          <Menu.Item
                            key={r}
                            title={r}
                            onPress={() => onChangeRole(item, r)}
                          />
                        ))}
                      </Menu>
                      <Button
                        mode="text"
                        textColor={palette.cashOut}
                        compact
                        onPress={() => onRemove(item)}
                      >
                        Remove
                      </Button>
                    </View>
                  ) : null}
                </View>
              </Card.Content>
            </Card>
          )}
        />
        <FAB
          icon="account-plus"
          color={palette.white}
          style={styles.fab}
          onPress={() => router.push('/(app)/members-invite')}
        />
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: palette.black },
  error: { padding: 16 },
  card: { backgroundColor: palette.surface },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  phone: { color: palette.textMuted, marginTop: 2 },
  statusRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  actions: { flexDirection: 'row', gap: 8, marginLeft: 'auto' },
  fab: { position: 'absolute', right: 16, bottom: 24, backgroundColor: palette.black },
});
