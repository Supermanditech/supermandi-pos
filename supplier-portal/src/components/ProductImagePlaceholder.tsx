// T-163: Placeholder image component for products without photos
// Provides a consistent fallback visual in the supplier portal
// when a product has no image uploaded.

import { Package } from 'lucide-react';

interface ProductImagePlaceholderProps {
  /** Size variant: sm (32px), md (48px), or lg (96px) */
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses: Record<string, { container: string; icon: number }> = {
  sm: { container: 'w-8 h-8', icon: 14 },
  md: { container: 'w-12 h-12', icon: 20 },
  lg: { container: 'w-24 h-24', icon: 36 },
};

export default function ProductImagePlaceholder({
  size = 'md',
}: ProductImagePlaceholderProps) {
  const config = sizeClasses[size];

  return (
    <div
      className={`${config.container} bg-slate-100 rounded-md flex items-center justify-center flex-shrink-0`}
    >
      <Package size={config.icon} className="text-slate-400" />
    </div>
  );
}
