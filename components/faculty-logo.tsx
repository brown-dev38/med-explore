import Image from "next/image";
import { cn } from "@/lib/utils";

export function FacultyLogo({ className }: { className?: string }) {
  return (
    <Image
      src="/LogoMed2.png"
      alt="คณะแพทยศาสตร์ มหาวิทยาลัยพะเยา"
      width={64}
      height={64}
      sizes="64px"
      loading="eager"
      className={cn("size-12 shrink-0 object-contain", className)}
    />
  );
}
