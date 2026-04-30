import { StyleSheet, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';

import { palette } from '@/theme';

interface Props {
  title: string;
  subtitle?: string;
  icon?: string;
}

export function Empty({ title, subtitle, icon = 'inbox-outline' }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.iconWrap}>
        <Icon source={icon} size={36} color={palette.textMuted} />
      </View>
      <Text variant="titleMedium" style={styles.title}>
        {title}
      </Text>
      {subtitle ? (
        <Text variant="bodyMedium" style={styles.subtitle}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 32, alignItems: 'center', justifyContent: 'center', gap: 8 },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    marginBottom: 4,
  },
  title: { textAlign: 'center', color: palette.text },
  subtitle: { textAlign: 'center', color: palette.textMuted },
});
