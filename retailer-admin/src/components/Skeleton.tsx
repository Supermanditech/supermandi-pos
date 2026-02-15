export function Skeleton({ width = '100%', height = 16, borderRadius = 4 }: { width?: string | number; height?: number; borderRadius?: number }) {
  return <div className="skeleton" style={{ width, height, borderRadius }} />;
}
