import { Skeleton } from '@/components/ui/Skeleton';

export default function Loading() {
  return (
    <div className="flex h-[100dvh] flex-col bg-ink-950 p-2">
      <Skeleton className="h-11 w-full" />
      <div className="mt-2 grid min-h-0 flex-1 gap-2 lg:grid-cols-[264px_minmax(0,1fr)_292px]">
        <Skeleton className="hidden lg:block" />
        <div className="flex min-h-0 flex-col gap-2">
          <Skeleton className="min-h-0 flex-1" />
          <Skeleton className="h-[40dvh] lg:h-[34vh]" />
        </div>
        <Skeleton className="hidden lg:block" />
      </div>
    </div>
  );
}
