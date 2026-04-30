import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

interface Props {
  title: string;
  subtitle?: string;
}

export function Empty({ title, subtitle }: Props) {
  return (
    <View style={styles.wrap}>
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
  title: { textAlign: 'center' },
  subtitle: { textAlign: 'center', opacity: 0.6 },
});
