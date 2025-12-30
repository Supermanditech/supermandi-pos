import NetInfo from "@react-native-community/netinfo";

export async function isOnline(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return Boolean(state.isConnected);
}

export function subscribeNetworkStatus(callback: (online: boolean) => void): () => void {
  return NetInfo.addEventListener((state) => {
    callback(Boolean(state.isConnected));
  });
}
