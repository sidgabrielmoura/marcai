import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Carregando página"
      className="mx-auto w-full max-w-6xl p-6 md:p-12 flex flex-col gap-4"
    >
      <span className="sr-only">Carregando seu espaço de trabalho...</span>
      <Skeleton className="h-9 w-52 rounded-xl bg-[var(--neutral-200)]" />
      <Skeleton className="h-3 w-72 max-w-full rounded-full bg-[var(--neutral-200)] mb-6" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((item) => (
          <Skeleton
            key={item}
            className="h-32 bg-white rounded-2xl shadow-none"
          />
        ))}
      </div>
      <Skeleton className="h-72 bg-white rounded-2xl mt-2 shadow-none" />
    </div>
  );
}
