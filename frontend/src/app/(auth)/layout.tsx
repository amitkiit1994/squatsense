export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-8">
      {/* Aurora blobs */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="animate-aurora absolute -top-1/4 left-1/4 h-[500px] w-[500px] rounded-full bg-orange-600/8 blur-[100px]" />
        <div className="animate-aurora-slow absolute -bottom-1/4 right-1/4 h-[400px] w-[400px] rounded-full bg-blue-600/6 blur-[100px]" />
      </div>
      {/* Grid overlay */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-grid" />
      {children}
    </div>
  );
}
