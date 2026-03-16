import React, { useMemo, useState } from "react";
import { View, Pressable, StyleSheet, Text } from "react-native";
import { useThemeColors } from "../../theme";
import type { ColorPalette } from "../../theme";

// STG-563: Expandable (+) section for tax, batch, trade terms in counter purchase

type ExpandableDetailsProps = {
  title: string;
  children: React.ReactNode;
};

export default function ExpandableDetails({ title, children }: ExpandableDetailsProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.container}>
      <Pressable style={styles.trigger} onPress={() => setExpanded(!expanded)} accessibilityRole="button" accessibilityState={{ expanded }}>
        <View style={styles.plusIcon}><Text style={styles.plusText}>{expanded ? "−" : "+"}</Text></View>
        <Text style={styles.triggerText}>{title}</Text>
      </Pressable>
      {expanded ? <View style={styles.content}>{children}</View> : null}
    </View>
  );
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: { marginTop: 8 },
    trigger: { flexDirection: "row", alignItems: "center", gap: 6 },
    plusIcon: { width: 20, height: 20, borderRadius: 7, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
    plusText: { fontSize: 14, fontWeight: "800", color: colors.primary },
    triggerText: { fontSize: 11, fontWeight: "700", color: colors.primary },
    content: { marginTop: 8, padding: 10, backgroundColor: colors.background, borderRadius: 10 },
  });
}
