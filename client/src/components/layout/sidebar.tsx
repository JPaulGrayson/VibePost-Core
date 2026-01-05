import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Edit,
  History,
  Calendar,
  BarChart3,
  TrendingUp,
  Settings,
  Share2,
  Twitter,
  MessageSquare,
  Circle,
  Target,
  Search,
  Inbox,
  Sparkles,
  Film
} from "lucide-react";

import { SiDiscord, SiReddit } from "react-icons/si";
import type { PlatformConnection } from "@shared/schema";

export default function Sidebar() {
  const [location] = useLocation();

  const { data: platforms = [] } = useQuery<PlatformConnection[]>({
    queryKey: ["/api/platforms"],
  });

  const navItems = [
    { href: "/create", icon: Edit, label: "Create Post", active: location === "/" || location === "/create" },
    { href: "/history", icon: History, label: "Post History", active: location === "/history" },
    { href: "/scheduled", icon: Calendar, label: "Scheduled Posts", active: location === "/scheduled" },
    { href: "/campaigns", icon: Target, label: "Campaigns", active: location === "/campaigns" },
    { href: "/sniper-queue", icon: Sparkles, label: "Wizard's Tower", active: location === "/sniper-queue" },
    { href: "/video-slideshows", icon: Film, label: "Video Posts", active: location === "/video-slideshows" },
    { href: "/topic-search", icon: Search, label: "Topic Search", active: location === "/topic-search" || location === "/search" },
    { href: "/analytics", icon: BarChart3, label: "Analytics", active: location === "/analytics" },
    { href: "/growth-reports", icon: TrendingUp, label: "Growth Reports", active: location === "/growth-reports" },
    { href: "/settings", icon: Settings, label: "Settings", active: location === "/settings" },
  ];

  const platformIcons = {
    twitter: Twitter,
    discord: SiDiscord,
    reddit: SiReddit,
  };

  const platformColors = {
    twitter: "text-blue-400",
    discord: "text-indigo-500",
    reddit: "text-orange-500",
  };

  return (
    <aside className="w-64 bg-sidebar border-r border-sidebar-border flex flex-col">
      {/* Logo Header */}
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
            <Share2 className="text-primary-foreground text-lg" />
          </div>
          <h1 className="text-xl font-bold text-sidebar-foreground">VibePost</h1>
        </div>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 p-4 space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href}>
              <div className={`nav-link ${item.active ? 'active' : ''}`}>
                <Icon size={20} />
                <span>{item.label}</span>
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Platform Connection Status */}
      <div className="p-4 border-t border-sidebar-border">
        <h3 className="text-sm font-semibold text-muted-foreground mb-3">Connected Platforms</h3>
        <div className="space-y-2">
          {platforms.map((platform) => {
            const IconComponent = platformIcons[platform.platform as keyof typeof platformIcons];
            const iconColor = platformColors[platform.platform as keyof typeof platformColors];

            return (
              <div key={platform.platform} className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  {IconComponent && <IconComponent className={`${iconColor} text-sm`} />}
                  <span className="text-sm text-sidebar-foreground capitalize">{platform.platform}</span>
                </div>
                <div title={platform.isConnected ? "Connected" : "Not Connected"}>
                  <Circle
                    className={`w-2 h-2 ${platform.isConnected ? 'text-green-500 fill-current' : 'text-muted fill-current'}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* System Health Status */}
      <HealthStatusSection />
    </aside>
  );
}

function HealthStatusSection() {
  const { data: status } = useQuery<any>({
    queryKey: ["/api/health/detailed"],
    refetchInterval: 30000, // Check every 30s
  });

  if (!status) return null;

  return (
    <div className="p-4 border-t border-sidebar-border">
      <h3 className="text-sm font-semibold text-muted-foreground mb-3">System Health</h3>
      <div className="space-y-2">
        {/* Sniper Status */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-sidebar-foreground">Sniper</span>
          <div className="flex items-center space-x-2" title={status.sniper?.isRunning ? "Auto-Pilot Active" : "Stopped"}>
            <span className="text-xs text-muted-foreground">{status.sniper?.isRunning ? "Active" : "Stopped"}</span>
            <Circle className={`w-2 h-2 ${status.sniper?.isRunning ? 'text-green-500 fill-current' : 'text-red-500 fill-current'}`} />
          </div>
        </div>

        {/* Turai Status */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-sidebar-foreground">Turai API</span>
          <div className="flex items-center space-x-2" title={status.turai?.url}>
            <span className="text-xs text-muted-foreground capitalize">{status.turai?.status === 'connected' ? 'Online' : 'Offline'}</span>
            <Circle className={`w-2 h-2 ${status.turai?.status === 'connected' ? 'text-green-500 fill-current' : 'text-red-500 fill-current'}`} />
          </div>
        </div>

        {/* Last Draft Info */}
        {status.lastDraft && (
          <div className="pt-1 border-t border-sidebar-border mt-1">
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-muted-foreground">Last Draft:</span>
              <span className="text-[10px] text-sidebar-foreground">
                {new Date(status.lastDraft.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

