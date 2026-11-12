import { cn } from "@/lib/utils";

export function SiteFooter({ className }: { className?: string }) {
  return (
    <footer className={cn("shrink-0 border-t bg-card/70 text-muted-foreground", className)}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-4 text-xs leading-relaxed sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6 lg:px-8">
        <p className="font-medium">MedExplore · ระบบสะสมดาว</p>
        <p className="sm:text-right">© 2026 คณะแพทยศาสตร์ มหาวิทยาลัยพะเยา</p>
      </div>
    </footer>
  );
}
