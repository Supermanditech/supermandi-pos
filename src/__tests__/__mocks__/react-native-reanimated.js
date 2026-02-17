// T1: Mock react-native-reanimated for Jest
// Reanimated uses native Bezier/worklet modules unavailable in Jest
const React = require('react');

const NOOP = () => {};
const IDENTITY = (v) => v;
const NOOP_NODE = { __nodeID: 0 };

// Shared values mock
function useSharedValue(initialValue) {
  return { value: initialValue };
}

function useAnimatedStyle(updater) {
  return updater();
}

function useDerivedValue(updater) {
  return { value: updater() };
}

function useAnimatedScrollHandler() {
  return NOOP;
}

function withTiming(toValue) {
  return toValue;
}

function withSpring(toValue) {
  return toValue;
}

function withDecay() {
  return 0;
}

function withDelay(_, animation) {
  return animation;
}

function withSequence(...animations) {
  return animations[animations.length - 1];
}

function withRepeat(animation) {
  return animation;
}

function cancelAnimation() {}

function runOnUI(fn) { return fn; }
function runOnJS(fn) { return fn; }

const Easing = {
  linear: IDENTITY,
  ease: IDENTITY,
  quad: IDENTITY,
  cubic: IDENTITY,
  poly: () => IDENTITY,
  sin: IDENTITY,
  circle: IDENTITY,
  exp: IDENTITY,
  elastic: () => IDENTITY,
  back: () => IDENTITY,
  bounce: IDENTITY,
  bezier: () => IDENTITY,
  bezierFn: () => IDENTITY,
  in: (easing) => easing || IDENTITY,
  out: (easing) => easing || IDENTITY,
  inOut: (easing) => easing || IDENTITY,
};

// Animated component wrapper
function createAnimatedComponent(Component) {
  const AnimatedComponent = React.forwardRef((props, ref) => {
    return React.createElement(Component, { ...props, ref });
  });
  AnimatedComponent.displayName = `Animated.${Component.displayName || Component.name || 'Component'}`;
  return AnimatedComponent;
}

const { View, Text, Image, ScrollView, FlatList } = require('react-native');

module.exports = {
  __esModule: true,
  default: {
    createAnimatedComponent,
    View: createAnimatedComponent(View),
    Text: createAnimatedComponent(Text),
    Image: createAnimatedComponent(Image),
    ScrollView: createAnimatedComponent(ScrollView),
    FlatList: createAnimatedComponent(FlatList),
    call: NOOP,
    addWhitelistedNativeProps: NOOP,
    addWhitelistedUIProps: NOOP,
  },
  createAnimatedComponent,
  useSharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useAnimatedScrollHandler,
  useAnimatedGestureHandler: NOOP,
  useAnimatedReaction: NOOP,
  useAnimatedRef: () => ({ current: null }),
  useAnimatedProps: (updater) => updater(),
  withTiming,
  withSpring,
  withDecay,
  withDelay,
  withSequence,
  withRepeat,
  cancelAnimation,
  Easing,
  runOnUI,
  runOnJS,
  interpolate: (value, inputRange, outputRange) => value,
  Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
  Extrapolate: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
  SlideInRight: { duration: () => ({ duration: () => ({}) }) },
  SlideOutLeft: { duration: () => ({ duration: () => ({}) }) },
  SlideInLeft: { duration: () => ({ duration: () => ({}) }) },
  SlideOutRight: { duration: () => ({ duration: () => ({}) }) },
  FadeIn: { duration: () => ({ duration: () => ({}) }) },
  FadeOut: { duration: () => ({ duration: () => ({}) }) },
  Layout: {},
  LinearTransition: {},
  EntryExitTransition: {},
  FadingTransition: {},
  measure: NOOP,
  scrollTo: NOOP,
  makeMutable: (value) => ({ value }),
};
