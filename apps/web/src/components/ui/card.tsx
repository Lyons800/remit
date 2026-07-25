import type { HTMLAttributes } from 'react';

import { cn } from '../../lib/utils';

export function Card({
  className,
  ...properties
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-lg border border-border bg-card', className)}
      {...properties}
    />
  );
}

export function CardHeader({
  className,
  ...properties
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-col gap-1 border-b border-border p-4', className)}
      {...properties}
    />
  );
}

export function CardTitle({
  className,
  ...properties
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn('text-sm font-semibold text-foreground', className)}
      {...properties}
    />
  );
}

export function CardContent({
  className,
  ...properties
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4', className)} {...properties} />;
}
