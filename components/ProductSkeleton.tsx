import { Skeleton } from "@/components/ui/skeleton";

export default function ProductSkeleton() {
  return (
    <div className="bg-white rounded-2xl p-3 shadow-sm">
      <Skeleton className="h-44 md:h-52 w-full rounded-xl" />
      <Skeleton className="h-5 w-3/4 mt-3" />
      <Skeleton className="h-5 w-1/2 mt-2" />
      <Skeleton className="h-10 w-full mt-4 rounded-xl" />
    </div>
  );
}
