import { StyleSheet, Text, View } from 'react-native';

export default function ClaimsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Claims</Text>
      <Text style={styles.subtitle}>View and manage claims</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: 'bold' },
  subtitle: { fontSize: 16, color: '#71717a', marginTop: 8 },
});
