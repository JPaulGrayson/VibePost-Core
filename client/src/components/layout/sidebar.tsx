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
  Inbox
} from "lucide-react";
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
    { href: "/review-queue", icon: Inbox, label: "Sniper Queue", active: location === "/review-queue" },
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
    <aside className="w-64 bg-white shadow-lg border-r border-gray-200 flex flex-col">
      {/* Logo Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-social-primary rounded-lg flex items-center justify-center">
            <Share2 className="text-white text-lg" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">VibePost</h1>
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
      <div className="p-4 border-t border-gray-200">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Connected Platforms</h3>
        <div className="space-y-2">
          {platforms.map((platform) => {
            const IconComponent = platformIcons[platform.platform as keyof typeof platformIcons];
            const iconColor = platformColors[platform.platform as keyof typeof platformColors];

            return (
              <div key={platform.platform} className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  {IconComponent && <IconComponent className={`${iconColor} text-sm`} />}
                  <span className="text-sm text-gray-600 capitalize">{platform.platform}</span>
                </div>
                <div title={platform.isConnected ? "Connected" : "Not Connected"}>
                  <Circle
                    className={`w-2 h-2 ${platform.isConnected ? 'text-social-accent fill-current' : 'text-gray-300 fill-current'}`}
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
