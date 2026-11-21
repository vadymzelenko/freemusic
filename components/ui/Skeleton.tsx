import { tx } from "@/lib/i18n";
export function TrackRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-2">
      <div className="skeleton h-12 w-12 rounded-md" />
      <div className="flex-1 space-y-2">
        <div className="skeleton h-3.5 w-2/3 rounded" />
        <div className="skeleton h-3 w-1/3 rounded" />
      </div>
      <div className="skeleton h-3 w-8 rounded" />
    </div>
  );
}

export function TrackListSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div aria-busy="true" aria-label={tx("Загрузка")}>
      {Array.from({ length: count }, (_, i) => (
        <TrackRowSkeleton key={i} />
      ))}
    </div>
  );
}
