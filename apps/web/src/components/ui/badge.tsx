import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';

import { cn } from '../../lib/utils';

/* midday-style: square, bordered, mono microtype, monochrome */
const badgeVariants = cva(
  'inline-flex items-center border px-2 py-0.5 text-[11px] font-medium tracking-wide whitespace-nowrap uppercase',
  {
    defaultVariants: { variant: 'default' },
    variants: {
      variant: {
        default: 'border-border text-foreground',
        destructive: 'border-destructive/50 text-destructive',
        outline: 'border-border text-muted-foreground',
        warning: 'border-border text-muted-foreground',
      },
    },
  },
);

type BadgeProperties = HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...properties }: BadgeProperties) {
  return (
    <span
      className={cn(badgeVariants({ className, variant }))}
      style={{ fontFamily: 'var(--font-geist-mono), monospace' }}
      {...properties}
    />
  );
}
