import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        <div
          className="text-8xl sm:text-9xl font-black text-[#00ff88] mb-4"
          style={{ fontFamily: "'Space Mono', monospace" }}
        >
          404
        </div>

        <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight mb-3">
          PAGE NOT FOUND
        </h1>

        <p className="text-zinc-500 mb-10">
          The page you are looking for does not exist or has been moved.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/"
            className="px-8 py-4 rounded-xl bg-zinc-800 border border-zinc-700 text-white font-bold text-lg
                       hover:bg-zinc-700 transition-colors text-center"
          >
            GO HOME
          </Link>
          <Link
            href="/join"
            className="px-8 py-4 rounded-xl bg-[#00ff88] text-black font-bold text-lg
                       hover:bg-[#00cc6a] transition-colors text-center"
          >
            START PLAYING
          </Link>
        </div>
      </div>
    </div>
  );
}
