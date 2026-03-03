'use client';

// T-113: Breadcrumb navigation for Supplier Portal

import Link from 'next/link';

interface BreadcrumbItem {
  label: string;
  path?: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export default function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav className="flex items-center gap-2 text-[13px] text-slate-500 dark:text-slate-400 mb-4">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-2">
          {i > 0 && <span className="text-slate-300 dark:text-slate-600">&rsaquo;</span>}
          {(item.path || item.href) ? (
            <Link href={(item.path || item.href)!} className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 no-underline">
              {item.label}
            </Link>
          ) : (
            <span className="text-slate-800 dark:text-slate-100 font-medium">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
