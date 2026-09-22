import type { LucideIcon } from "lucide-react";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  hint?: string;
};

/** Polished placeholder for sections with nothing to show yet. */
function EmptyState({ icon: Icon, title, hint }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-10 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/[0.05] text-gray-500 ring-1 ring-white/10">
        <Icon size={19} />
      </div>

      <p className="mt-4 text-sm font-medium text-gray-400">{title}</p>

      {hint && <p className="mt-1 text-xs text-gray-600">{hint}</p>}
    </div>
  );
}

export default EmptyState;
