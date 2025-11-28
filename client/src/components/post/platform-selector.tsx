import { useQuery } from "@tanstack/react-query";
import { Checkbox } from "@/components/ui/checkbox";
import { Twitter, Check } from "lucide-react";
import { SiDiscord, SiReddit } from "react-icons/si";
import type { PlatformConnection } from "@shared/schema";

interface PlatformSelectorProps {
  selectedPlatforms: string[];
  onPlatformsChange: (platforms: string[]) => void;
}

export default function PlatformSelector({ selectedPlatforms, onPlatformsChange }: PlatformSelectorProps) {
  const { data: platforms = [] } = useQuery<PlatformConnection[]>({
    queryKey: ["/api/platforms"],
  });

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

  const platformMetadata = {
    twitter: "@username",
    discord: "2 servers",
    reddit: "r/ChatGPT",
  };

  const handlePlatformToggle = (platform: string, checked: boolean) => {
    if (checked) {
      onPlatformsChange([...selectedPlatforms, platform]);
    } else {
      onPlatformsChange(selectedPlatforms.filter(p => p !== platform));
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {platforms.map((platform) => {
        const IconComponent = platformIcons[platform.platform as keyof typeof platformIcons];
        const iconColor = platformColors[platform.platform as keyof typeof platformColors];
        const metadata = platformMetadata[platform.platform as keyof typeof platformMetadata];
        const isSelected = selectedPlatforms.includes(platform.platform);
        const isConnected = platform.isConnected;

        return (
          <div
            key={platform.platform}
            className={`platform-card ${isSelected ? 'selected' : ''} ${!isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={() => isConnected && handlePlatformToggle(platform.platform, !isSelected)}
          >
            <Checkbox
              checked={isSelected}
              onCheckedChange={(checked) => isConnected && handlePlatformToggle(platform.platform, checked as boolean)}
              className="sr-only"
              disabled={!isConnected}
            />
            <div className="flex items-center space-x-3 w-full">
              {IconComponent && <IconComponent className={`${iconColor} text-xl`} />}
              <div className="flex-1">
                <div className="font-medium text-gray-900 capitalize">{platform.platform}</div>
                <div className="text-sm text-gray-500">{metadata}</div>
              </div>
              <div className="flex items-center space-x-2 ml-auto">
                <div 
                  className="w-4 h-4 rounded-full border-2"
                  style={{
                    backgroundColor: isConnected ? '#10b981' : '#9ca3af',
                    borderColor: isConnected ? '#059669' : '#6b7280'
                  }}
                ></div>
                {isSelected && <Check className="text-social-primary" size={20} />}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
