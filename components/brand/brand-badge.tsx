import Image from "next/image";

type BrandBadgeProps = {
  context?: "product" | "company";
  compact?: boolean;
};

export function BrandBadge({
  context = "product",
  compact = false,
}: BrandBadgeProps) {
  if (context === "company") {
    return (
      <div className="flex items-center gap-3">
        <Image
          alt="Ingeniometrix"
          className="h-auto w-[148px] sm:w-[180px]"
          height={36}
          priority
          src="/brand/ingeniometrix-lockup-320.png"
          width={182}
        />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-3">
      <Image
        alt="Ingeniometrix"
        className={`${compact ? "w-8" : "w-9"} h-auto`}
        height={36}
        priority
        src="/brand/ingeniometrix-mark-64.png"
        width={36}
      />
      <div className="min-w-0">
        <p className="truncate font-[var(--font-heading)] text-lg font-semibold tracking-tight text-[var(--color-plum)]">
          Ingeniometrix
        </p>
        {compact ? null : (
          <p className="truncate text-xs text-[var(--color-muted)]">
            Asistencia etica para tesis de posgrado
          </p>
        )}
      </div>
    </div>
  );
}
