"use client";

interface Props {
  children: React.ReactNode;
}

export default function SellerDashboard({
  children,
}: Props) {
  return (
    <div className="max-w-7xl mx-auto p-6 md:p-8">
      {children}
    </div>
  );
}