import { View, Text, StyleSheet } from "react-native";

export function Toast({ message }: { message: string }) {
  if (!message) return null;

  return (
    <View style={styles.toast}>
      <Text style={styles.text}> Printer low on paper</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    bottom: 110,
    alignSelf: "center",
    backgroundColor: "#1f2933",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 14
  },
  text: {
    color: "#ffffff",
    fontSize: 14
  }
});
