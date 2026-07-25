import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';

import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
  {
    defaultVariants: { variant: 'default' },
    variants: {
      variant: {
        default: 'bg-primary/10 text-primary',
        destructive: 'bg-destructive/10 text-destructive',
        outline: 'border border-input text-muted-foreground',
        warning: 'bg-amber-100 text-amber-900',
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
      {...properties}
    />
  );
}
