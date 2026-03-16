import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";

// STG-557: Confetti celebration animation for sale success

const COLORS = ["#2563EB", "#14B8A6", "#F59E0B", "#DC2626", "#16A34A", "#7C3AED"];
const PARTICLE_COUNT = 20;

type Particle = { x: Animated.Value; y: Animated.Value; rot: Animated.Value; color: string; size: number };

export default function Confetti({ active }: { active: boolean }) {
  const particles = useRef<Particle[]>(
    Array.from({ length: PARTICLE_COUNT }, () => ({
      x: new Animated.Value(Math.random() * 400 - 50),
      y: new Animated.Value(-20),
      rot: new Animated.Value(0),
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      size: 6 + Math.random() * 6,
    }))
  ).current;

  useEffect(() => {
    if (!active) return;
    particles.forEach((p) => {
      p.y.setValue(-20);
      p.x.setValue(Math.random() * 350);
      p.rot.setValue(0);
      const duration = 1200 + Math.random() * 800;
      const delay = Math.random() * 400;
      Animated.parallel([
        Animated.timing(p.y, { toValue: 600, duration, delay, useNativeDriver: true }),
        Animated.timing(p.rot, { toValue: 720, duration, delay, useNativeDriver: true }),
      ]).start();
    });
  }, [active, particles]);

  if (!active) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {particles.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: "absolute",
            width: p.size,
            height: p.size,
            borderRadius: 2,
            backgroundColor: p.color,
            transform: [
              { translateX: p.x },
              { translateY: p.y },
              { rotate: p.rot.interpolate({ inputRange: [0, 720], outputRange: ["0deg", "720deg"] }) },
            ],
            opacity: p.y.interpolate({ inputRange: [0, 500, 600], outputRange: [1, 1, 0] }),
          }}
        />
      ))}
    </View>
  );
}
