import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';

import { cn } from '../../lib/utils';

export function Table({
  className,
  ...properties
}: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table
        className={cn('w-full caption-bottom text-sm', className)}
        {...properties}
      />
    </div>
  );
}

export function TableHeader(
  properties: HTMLAttributes<HTMLTableSectionElement>,
) {
  return <thead {...properties} />;
}

export function TableBody(properties: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...properties} />;
}

export function TableRow({
  className,
  ...properties
}: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn('border-b border-border transition-colors', className)}
      {...properties}
    />
  );
}

export function TableHead({
  className,
  ...properties
}: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        'h-10 bg-muted px-4 text-left align-middle text-xs font-semibold tracking-wide text-muted-foreground uppercase',
        className,
      )}
      {...properties}
    />
  );
}

export function TableCell({
  className,
  ...properties
}: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn('px-4 py-3 align-middle', className)} {...properties} />
  );
}
