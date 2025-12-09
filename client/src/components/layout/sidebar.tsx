import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Edit,
  History,
  Calendar,
  BarChart3,
  Settings,
  Share2,
  Twitter,
  MessageSquare,
  Circle,
  Target,
  Search,
  Inbox,
  Sparkles,
  Sunrise,
  Film,
  Link2
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
    { href: "/daily-postcard", icon: Sunrise, label: "Daily Postcard", active: location === "/daily-postcard" },
    { href: "/thread-tours", icon: Link2, label: "Thread Tours", active: location === "/thread-tours" },
    { href: "/video-slideshows", icon: Film, label: "Video Slideshows", active: location === "/video-slideshows" },
    { href: "/topic-search", icon: Search, label: "Topic Search", active: location === "/topic-search" || location === "/search" },
    { href: "/analytics", icon: BarChart3, label: "Analytics", active: location === "/analytics" },
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
    </aside>
  );
}
