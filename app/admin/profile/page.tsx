import { Suspense } from "react";
import { ProfileView } from "@/components/profile-view";

export const metadata = {
  title: "โปรไฟล์ | MedExplore Star",
};

export default function AdminProfilePage() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-500">กำลังโหลด...</div>}>
      <ProfileView />
    </Suspense>
  );
}
