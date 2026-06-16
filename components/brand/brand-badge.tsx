import Image from "next/image";

type BrandBadgeProps = {
  context?: "product" | "company";
  compact?: boolean;
};

export function BrandBadge({
  context = "product",
  compact = false,
}: BrandBadgeProps) {
  if (context === "company" || compact) {
    return (
      <div className="flex items-center gap-3">
        <Image
          alt="Ingeniometrix"
          className={
            compact
              ? "h-auto w-[132px] sm:w-[170px] lg:w-[184px]"
              : "h-auto w-[174px] sm:w-[220px] lg:w-[248px]"
          }
          height={48}
          priority
          sizes={
            compact
              ? "(max-width: 640px) 132px, (max-width: 1024px) 170px, 184px"
              : "(max-width: 640px) 174px, (max-width: 1024px) 220px, 248px"
          }
          src="/brand/ingeniometrix-lockup-640.png"
          width={248}
        />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-3">
      <Image
        alt="Ingeniometrix"
        className={`${compact ? "w-10 sm:w-11" : "w-11 sm:w-12"} h-auto shrink-0`}
        height={48}
        priority
        sizes={compact ? "(max-width: 640px) 40px, 44px" : "(max-width: 640px) 44px, 48px"}
        src="/brand/ingeniometrix-mark-64.png"
        width={48}
      />
      <div className="min-w-0">
        <p className="truncate font-[var(--font-heading)] text-[1.15rem] font-semibold tracking-tight text-[var(--color-plum)] sm:text-xl">
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
