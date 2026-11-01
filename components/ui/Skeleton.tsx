/** Blocos de carregamento com a mesma silhueta das telas (sem “tela branca”). */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-white/[0.06] ${className}`} />;
}

export function PageSkeleton({ title = true }: { title?: boolean }) {
  return (
    <div className="space-y-4">
      {title ? (
        <div className="space-y-2">
          <Skeleton className="h-7 w-52 max-w-[70%]" />
          <Skeleton className="h-3.5 w-72 max-w-[90%]" />
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}
