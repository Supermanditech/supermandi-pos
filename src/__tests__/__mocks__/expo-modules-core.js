// T1: Mock expo-modules-core for Jest — prevents EventEmitter native module errors
const React = require('react');
module.exports = {
  EventEmitter: class EventEmitter {
    addListener() { return { remove: () => {} }; }
    removeAllListeners() {}
    emit() {}
  },
  NativeModulesProxy: new Proxy({}, { get: () => () => {} }),
  requireNativeModule: () => new Proxy({}, { get: () => () => {} }),
  requireOptionalNativeModule: () => null,
  requireNativeViewManager: () => (props) => React.createElement('View', props),
};
