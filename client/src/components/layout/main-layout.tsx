import { ReactNode } from "react";
import Sidebar from "./sidebar";
import RecentPosts from "@/components/post/recent-posts";

interface MainLayoutProps {
  children: ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="min-h-screen flex bg-background">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
      <RecentPosts />
    </div>
  );
}
