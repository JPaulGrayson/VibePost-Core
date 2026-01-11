import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Twitter, MessageCircle, Repeat2, Heart, Share, User, ExternalLink } from "lucide-react";
import { SiDiscord, SiReddit } from "react-icons/si";

interface PostPreviewProps {
  content: string;
  selectedPlatforms: string[];
  mediaUrls?: string[];
}

export default function PostPreview({ content, selectedPlatforms, mediaUrls = [] }: PostPreviewProps) {
  const platformPreviews = selectedPlatforms.map(platform => {
    switch (platform) {
      case "twitter":
        return (
          <TwitterPreview key={platform} content={content} mediaUrls={mediaUrls} />
        );
      case "discord":
        return (
          <DiscordPreview key={platform} content={content} mediaUrls={mediaUrls} />
        );
      case "reddit":
        return (
          <RedditPreview key={platform} content={content} mediaUrls={mediaUrls} />
        );
      default:
        return null;
    }
  });

  return (
    <div className="space-y-4">
      {platformPreviews}
    </div>
  );
}

function TwitterPreview({ content, mediaUrls = [] }: { content: string; mediaUrls?: string[] }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-3">
          <Twitter className="text-blue-400 text-lg" />
          <span className="font-medium text-gray-900">Twitter/X Preview</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          asChild
        >
          <a href="https://twitter.com" target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4 mr-1" />
            Open
          </a>
        </Button>
      </div>
      <Card className="bg-white">
        <CardContent className="p-4">
          <div className="flex items-start space-x-3">
            <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center">
              <User className="text-gray-600 h-5 w-5" />
            </div>
            <div className="flex-1">
              <div className="flex items-center space-x-2 mb-2">
                <span className="font-semibold text-gray-900">Your Name</span>
                <span className="text-gray-500">@yourusername</span>
                <span className="text-gray-500">·</span>
                <span className="text-gray-500">now</span>
              </div>
              <div className="text-gray-900 whitespace-pre-line mb-3">
                {content}
              </div>
              {mediaUrls.length > 0 && (
                <div className={`grid gap-1 mb-3 rounded-xl overflow-hidden ${mediaUrls.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                  {mediaUrls.slice(0, 4).map((url, idx) => {
                    const isVideo = url.match(/\.(mp4|mov|webm)$/i);
                    return isVideo ? (
                      <video 
                        key={idx} 
                        src={url} 
                        className="w-full h-32 object-cover bg-gray-100"
                        controls
                      />
                    ) : (
                      <img 
                        key={idx} 
                        src={url} 
                        alt={`Media ${idx + 1}`} 
                        className="w-full h-32 object-cover bg-gray-100"
                      />
                    );
                  })}
                </div>
              )}
              <div className="flex items-center space-x-6 text-gray-500">
                <Button variant="ghost" size="sm" className="p-0 h-auto hover:text-blue-500">
                  <MessageCircle className="mr-1 h-4 w-4" />
                  <span className="text-sm">Reply</span>
                </Button>
                <Button variant="ghost" size="sm" className="p-0 h-auto hover:text-green-500">
                  <Repeat2 className="mr-1 h-4 w-4" />
                  <span className="text-sm">Retweet</span>
                </Button>
                <Button variant="ghost" size="sm" className="p-0 h-auto hover:text-red-500">
                  <Heart className="mr-1 h-4 w-4" />
                  <span className="text-sm">Like</span>
                </Button>
                <Button variant="ghost" size="sm" className="p-0 h-auto hover:text-blue-500">
                  <Share className="mr-1 h-4 w-4" />
                  <span className="text-sm">Share</span>
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DiscordPreview({ content, mediaUrls = [] }: { content: string; mediaUrls?: string[] }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-3">
          <SiDiscord className="text-indigo-500 text-lg" />
          <span className="font-medium text-gray-900">Discord Preview</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          asChild
        >
          <a href="https://discord.com" target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4 mr-1" />
            Open
          </a>
        </Button>
      </div>
      <Card className="bg-white">
        <CardContent className="p-4">
          <div className="flex items-start space-x-3">
            <div className="w-8 h-8 bg-indigo-500 rounded-full flex items-center justify-center">
              <User className="text-white h-4 w-4" />
            </div>
            <div className="flex-1">
              <div className="flex items-center space-x-2 mb-1">
                <span className="font-medium text-gray-900">Your Name</span>
                <span className="text-xs text-gray-500">Today at 12:00 PM</span>
              </div>
              <div className="text-gray-900 whitespace-pre-line">
                {content}
              </div>
              {mediaUrls.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {mediaUrls.slice(0, 4).map((url, idx) => {
                    const isVideo = url.match(/\.(mp4|mov|webm)$/i);
                    return isVideo ? (
                      <video key={idx} src={url} className="max-w-[200px] rounded" controls />
                    ) : (
                      <img key={idx} src={url} alt={`Media ${idx + 1}`} className="max-w-[200px] rounded" />
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function RedditPreview({ content, mediaUrls = [] }: { content: string; mediaUrls?: string[] }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-3">
          <SiReddit className="text-orange-500 text-lg" />
          <span className="font-medium text-gray-900">Reddit Preview</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          asChild
        >
          <a href="https://reddit.com/r/ChatGPT" target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4 mr-1" />
            Open
          </a>
        </Button>
      </div>
      <Card className="bg-white">
        <CardContent className="p-4">
          <div className="border-l-2 border-orange-500 pl-4">
            <div className="flex items-center space-x-2 mb-2">
              <span className="text-sm text-gray-600">r/ChatGPT</span>
              <span className="text-gray-400">•</span>
              <span className="text-sm text-gray-600">Posted by u/yourusername</span>
              <span className="text-sm text-gray-500">now</span>
            </div>
            <div className="text-gray-900 whitespace-pre-line">
              {content}
            </div>
            {mediaUrls.length > 0 && (
              <div className="mt-2">
                {mediaUrls.slice(0, 1).map((url, idx) => {
                  const isVideo = url.match(/\.(mp4|mov|webm)$/i);
                  return isVideo ? (
                    <video key={idx} src={url} className="max-w-full rounded" controls />
                  ) : (
                    <img key={idx} src={url} alt="Post media" className="max-w-full rounded" />
                  );
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
