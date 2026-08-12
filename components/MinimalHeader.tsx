import Link from "next/link";
import Image from "next/image";

export default function MinimalHeader() {
  return (
    <header className="bg-white border-b border-gray-200">
      <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">

        <Link href="/" className="shrink-0 flex items-center gap-2">
          <Image
            src="/logo.png"
            loading="eager"
            alt="YOMICO"
            width={140}
            height={56}
            priority
            className="h-12 w-auto object-contain"
          />
        </Link>

        <Link
          href="/"
          className="text-sm text-gray-500 hover:text-gray-700 hover:underline"
        >
          ← Back to YOMICO
        </Link>

      </div>
    </header>
  );
}
