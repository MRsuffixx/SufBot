import { PageContainer, SkeletonCard } from '@/components/dashboard/page-primitives';

export default function DashboardLoading() {
  return (
    <PageContainer aria-label="Loading dashboard">
      <div className="h-8 w-52 animate-pulse rounded-md bg-surface-muted motion-reduce:animate-none" />
      <div className="mt-3 h-4 w-full max-w-xl animate-pulse rounded bg-surface-secondary motion-reduce:animate-none" />
      <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <SkeletonCard key={index} lines={2} />
        ))}
      </div>
    </PageContainer>
  );
}
