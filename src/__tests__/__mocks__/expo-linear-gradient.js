// T1: Mock expo-linear-gradient for Jest — prevents requireNativeViewManager errors
const React = require('react');
const LinearGradient = (props) => React.createElement('View', props);
module.exports = {
  __esModule: true,
  default: LinearGradient,
  LinearGradient,
};
