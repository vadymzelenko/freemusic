export function PageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <header className="px-4 pt-6 pb-3">
      <div className="flex items-end justify-between gap-3">
        <h1 className="text-[28px] font-bold leading-none tracking-tight">{title}</h1>
        {children}
      </div>
    </header>
  );
}
