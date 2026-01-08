import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Search, Reply, ExternalLink, Calendar, User, AlertTriangle, Info, Loader2, Send, Crosshair } from "lucide-react";
import { SiX, SiReddit, SiDiscord } from "react-icons/si";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface SearchResult {
  platform: string;
  id: string;
  author: string;
  content: string;
  url: string;
  createdAt: string;
  score?: number;
}

const CAMPAIGN_TEMPLATES = [
  {
    name: "VibeAppZ Beta Launch",
    message: "🚀 Check out VibeAppZ - launching beta app store with 85% revenue share for developers! First 100 beta testers get FREE access. Perfect for indie devs looking to maximize earnings!"
  },
  {
    name: "Developer Revenue Share",
    message: "Hey! If you're building apps, you might love VibeAppZ - we give developers 85% revenue share (vs App Store's 70%). First upload is FREE, and beta testers get premium access!"
  },
  {
    name: "Free Beta Access",
    message: "Free first upload + 85% revenue share on VibeAppZ! We're in beta with only 100 spots for early access. Perfect timing if you're launching soon 🎯"
  },
  {
    name: "Coding Community",
    message: "Fellow developer here! Working on VibeAppZ - an app store built for devs by devs. 85% revenue share, first 100 beta testers get free access. Would love your feedback!"
  }
];

export default function TopicSearch() {
  const [keyword, setKeyword] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState(["twitter", "reddit"]);
  const [strictMode, setStrictMode] = useState(false);
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const { toast } = useToast();

  // Get active campaign from server
  const { data: campaignData } = useQuery<{ activeCampaign: string }>({
    queryKey: ["/api/sniper/campaign"],
  });
  const activeCampaign = campaignData?.activeCampaign || 'logicart';

  const searchMutation = useMutation({
    mutationFn: async ({ keyword, platforms, strictMode }: { keyword: string; platforms: string[], strictMode: boolean }) => {
      const response = await fetch("/api/keywords/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ keyword, platforms, strictMode }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || error.error || error.message || 'Failed to search topics');
      }
      const data = await response.json();
      return data.results || [];
    },
    onSuccess: (data) => {
      setSearchResults(data);
      toast({
        title: "Search completed",
        description: `Found ${data.length} posts matching "${keyword}"`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Search failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const sniperMutation = useMutation({
    mutationFn: async ({ tweetId, authorHandle, text, campaignType }: { tweetId: string; authorHandle: string; text: string; campaignType: string }) => {
      const response = await fetch("/api/sniper/draft-from-search", {
        method: "POST",
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tweetId, authorHandle, text, campaignType }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to send to sniper queue');
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Sent to Sniper Queue",
        description: `Draft for ${data.campaign === 'logicart' ? 'LogicArt' : 'Turai'} is being generated.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to send",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSearch = () => {
    if (!keyword.trim()) {
      toast({
        title: "Enter a keyword",
        description: "Please enter a keyword to search for",
        variant: "destructive",
      });
      return;
    }

    if (selectedPlatforms.length === 0) {
      toast({
        title: "Select platforms",
        description: "Please select at least one platform to search",
        variant: "destructive",
      });
      return;
    }

    searchMutation.mutate({ keyword: keyword.trim(), platforms: selectedPlatforms, strictMode });
  };

  const handleSendToSniper = (platform: string, postId: string, author: string, content: string) => {
    if (platform !== 'twitter') return;
    sniperMutation.mutate({ tweetId: postId, authorHandle: author, text: content, campaignType: activeCampaign });
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'twitter': return <SiX className="w-4 h-4" />;
      case 'reddit': return <SiReddit className="w-4 h-4" />;
      case 'discord': return <SiDiscord className="w-4 h-4" />;
      default: return null;
    }
  };

  const getPlatformColor = (platform: string) => {
    switch (platform) {
      case 'twitter': return 'bg-blue-500';
      case 'reddit': return 'bg-orange-500';
      case 'discord': return 'bg-indigo-500';
      default: return 'bg-gray-500';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center space-x-2">
        <Search className="w-6 h-6" />
        <h1 className="text-3xl font-bold">Topic Search</h1>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          <strong>Search Status:</strong> X/Twitter search is fully operational using v2 API.
          Reddit has limited search access for script apps. Discord search is not available through webhooks.
          All platforms work perfectly for posting content.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Search for Topics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex space-x-2">
            <Input
              placeholder="Enter keyword (e.g., 'Paris travel', 'Kyoto hidden gems')"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1"
            />
            <Button
              onClick={handleSearch}
              disabled={searchMutation.isPending}
              className="min-w-[100px]"
            >
              {searchMutation.isPending ? "Searching..." : "Search"}
            </Button>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Platforms to search:</label>
            <div className="flex space-x-4">
              {[
                { id: 'twitter', label: 'X/Twitter', icon: <SiX className="w-4 h-4" /> },
                { id: 'reddit', label: 'Reddit', icon: <SiReddit className="w-4 h-4" /> },
                { id: 'discord', label: 'Discord', icon: <SiDiscord className="w-4 h-4" /> }
              ].map((platform) => (
                <label key={platform.id} className="flex items-center space-x-2 cursor-pointer">
                  <Checkbox
                    checked={selectedPlatforms.includes(platform.id)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedPlatforms(prev => [...prev, platform.id]);
                      } else {
                        setSelectedPlatforms(prev => prev.filter(p => p !== platform.id));
                      }
                    }}
                  />
                  {platform.icon}
                  <span className="text-sm">{platform.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center space-x-2 pt-2">
            <Checkbox
              id="strict-mode"
              checked={strictMode}
              onCheckedChange={(checked) => setStrictMode(checked as boolean)}
            />
            <label
              htmlFor="strict-mode"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
            >
              Travel Intent Mode (Strict)
            </label>
            <span className="text-xs text-muted-foreground ml-2">
              (Filters for "planning a trip", "recommendations", etc. + removes spam)
            </span>
          </div>
        </CardContent>
      </Card>

      {searchResults.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold">Search Results ({searchResults.length})</h2>

          </div>



          {searchResults.map((result, index) => (
            <Card key={`${result.platform}-${result.id}`} className="border-l-4" style={{ borderLeftColor: getPlatformColor(result.platform) === 'bg-blue-500' ? '#3b82f6' : getPlatformColor(result.platform) === 'bg-orange-500' ? '#f97316' : '#6366f1' }}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    {getPlatformIcon(result.platform)}
                    <Badge variant="secondary" className={`${getPlatformColor(result.platform)} text-white`}>
                      {result.platform.toUpperCase()}
                    </Badge>
                    {result.score !== undefined && (
                      <Badge variant="outline" className={result.score > 80 ? "border-green-500 text-green-500" : "border-gray-300"}>
                        Score: {result.score}
                      </Badge>
                    )}
                    <div className="flex items-center space-x-1 text-sm text-muted-foreground">
                      <User className="w-3 h-3" />
                      <span>@{result.author}</span>
                      <Calendar className="w-3 h-3 ml-2" />
                      <span>{formatDate(result.createdAt)}</span>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(result.url, '_blank')}
                  >
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="bg-muted p-3 rounded-md">
                  <p className="text-sm whitespace-pre-wrap">{result.content}</p>
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Crosshair className="w-4 h-4" />
                    <span className="text-sm font-medium">Sniper Actions:</span>
                  </div>

                  <div className="flex space-x-2">
                    <Button
                      onClick={() => handleSendToSniper(result.platform, result.id, result.author, result.content)}
                      disabled={sniperMutation.isPending || result.platform !== 'twitter'}
                      size="sm"
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                    >
                      {sniperMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Crosshair className="w-4 h-4 mr-2" />
                          Send to Sniper Queue
                        </>
                      )}
                    </Button>
                    {result.platform !== 'twitter' && (
                      <Badge variant="secondary" className="text-xs">
                        Twitter only
                      </Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )
      }

      {
        searchMutation.isPending && (
          <Card>
            <CardContent className="p-6 text-center">
              <div className="space-y-2">
                <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
                <p className="text-muted-foreground">Searching across platforms...</p>
              </div>
            </CardContent>
          </Card>
        )
      }

      {
        !searchMutation.isPending && searchResults.length === 0 && keyword && (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              <Search className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No results found for "{keyword}". Try different keywords or select different platforms.</p>
            </CardContent>
          </Card>
        )
      }
    </div >
  );
}