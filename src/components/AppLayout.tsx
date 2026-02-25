import { ReactNode } from "react";
import { AppSidebar } from "./AppSidebar";
import { TopBar } from "./TopBar";

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen w-full">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <main className="flex-1 p-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
