import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Search, Reply, ExternalLink, Calendar, User, AlertTriangle, Info, Loader2, Send } from "lucide-react";
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
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selectedPosts, setSelectedPosts] = useState<Set<string>>(new Set());
  const [bulkReplyText, setBulkReplyText] = useState("");
  const { toast } = useToast();

  const searchMutation = useMutation({
    mutationFn: async ({ keyword, platforms }: { keyword: string; platforms: string[] }) => {
      const response = await fetch(`/api/search/${encodeURIComponent(keyword)}?platforms=${platforms.join(',')}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to search topics');
      }
      return response.json();
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

  const replyMutation = useMutation({
    mutationFn: async ({ platform, postId, replyText }: { platform: string; postId: string; replyText: string }) => {
      const response = await fetch(`/api/reply/${platform}/${postId}`, {
        method: "POST",
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ replyText }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to post reply');
      }
      return response.json();
    },
    onSuccess: (data, variables) => {
      toast({
        title: "Reply posted",
        description: `Successfully replied to ${variables.platform} post`,
      });
      setReplyTexts(prev => ({ ...prev, [`${variables.platform}-${variables.postId}`]: "" }));
    },
    onError: (error: Error) => {
      toast({
        title: "Reply failed",
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

    searchMutation.mutate({ keyword: keyword.trim(), platforms: selectedPlatforms });
  };

  const handleReply = (platform: string, postId: string) => {
    const replyKey = `${platform}-${postId}`;
    const replyText = replyTexts[replyKey];
    
    if (!replyText?.trim()) {
      toast({
        title: "Enter reply text",
        description: "Please enter your reply message",
        variant: "destructive",
      });
      return;
    }

    replyMutation.mutate({ platform, postId, replyText: replyText.trim() });
  };

  const useTemplate = (platform: string, postId: string, template: string) => {
    setReplyTexts(prev => ({ ...prev, [`${platform}-${postId}`]: template }));
  };

  const togglePostSelection = (platform: string, postId: string) => {
    const key = `${platform}-${postId}`;
    setSelectedPosts(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  const selectAllTwitterPosts = () => {
    const twitterPosts = searchResults.filter(r => r.platform === 'twitter');
    const allKeys = twitterPosts.map(r => `${r.platform}-${r.id}`);
    setSelectedPosts(new Set(allKeys));
  };

  const clearSelection = () => {
    setSelectedPosts(new Set());
  };

  const bulkReplyMutation = useMutation({
    mutationFn: async (posts: { platform: string; postId: string; replyText: string }[]) => {
      const results = await Promise.allSettled(
        posts.map(async ({ platform, postId, replyText }) => {
          const response = await fetch(`/api/reply/${platform}/${postId}`, {
            method: "POST",
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ replyText }),
          });
          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to post reply');
          }
          return { platform, postId, success: true };
        })
      );
      return results;
    },
    onSuccess: (results) => {
      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      
      toast({
        title: "Bulk replies completed",
        description: `${succeeded} replies posted successfully${failed > 0 ? `, ${failed} failed` : ''}`,
      });
      
      // Clear selections and reset form
      setSelectedPosts(new Set());
      setBulkReplyText("");
    },
    onError: (error: Error) => {
      toast({
        title: "Bulk reply failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleBulkReply = () => {
    if (!bulkReplyText.trim()) {
      toast({
        title: "Enter reply text",
        description: "Please enter your bulk reply message",
        variant: "destructive",
      });
      return;
    }

    const selectedTwitterPosts = Array.from(selectedPosts)
      .filter(key => key.startsWith('twitter-'))
      .map(key => {
        const postId = key.replace('twitter-', '');
        return { platform: 'twitter', postId, replyText: bulkReplyText.trim() };
      });

    if (selectedTwitterPosts.length === 0) {
      toast({
        title: "No posts selected",
        description: "Please select Twitter posts to reply to",
        variant: "destructive",
      });
      return;
    }

    bulkReplyMutation.mutate(selectedTwitterPosts);
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
              placeholder="Enter keyword (e.g., 'Vibe Coding', 'React tutorial')"
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
        </CardContent>
      </Card>

      {searchResults.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold">Search Results ({searchResults.length})</h2>
            <Badge variant="outline" className="text-sm">
              {selectedPosts.size} selected for bulk reply
            </Badge>
          </div>

          {/* Bulk Reply Controls */}
          {searchResults.some(r => r.platform === 'twitter') && (
            <Card className="border-blue-200 bg-blue-50/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Reply className="w-5 h-5" />
                  Bulk Reply to Twitter Posts
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={selectAllTwitterPosts}
                    disabled={searchResults.filter(r => r.platform === 'twitter').length === 0}
                  >
                    Select All Twitter Posts ({searchResults.filter(r => r.platform === 'twitter').length})
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearSelection}
                    disabled={selectedPosts.size === 0}
                  >
                    Clear Selection
                  </Button>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Quick Templates:</label>
                  <div className="grid grid-cols-2 gap-2">
                    {CAMPAIGN_TEMPLATES.map((template, index) => (
                      <Button
                        key={index}
                        variant="outline"
                        size="sm"
                        onClick={() => setBulkReplyText(template.message)}
                        className="text-xs h-auto py-2 px-3 whitespace-normal"
                      >
                        {template.name}
                      </Button>
                    ))}
                  </div>
                </div>

                <Textarea
                  placeholder="Enter your bulk reply message..."
                  value={bulkReplyText}
                  onChange={(e) => setBulkReplyText(e.target.value)}
                  className="min-h-[100px]"
                />

                <Button
                  onClick={handleBulkReply}
                  disabled={bulkReplyMutation.isPending || !bulkReplyText.trim() || selectedPosts.size === 0}
                  className="w-full"
                >
                  {bulkReplyMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Posting {selectedPosts.size} replies...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Reply to {selectedPosts.size} Selected Posts
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}
          
          {searchResults.map((result, index) => (
            <Card key={`${result.platform}-${result.id}`} className="border-l-4" style={{ borderLeftColor: getPlatformColor(result.platform) === 'bg-blue-500' ? '#3b82f6' : getPlatformColor(result.platform) === 'bg-orange-500' ? '#f97316' : '#6366f1' }}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    {result.platform === 'twitter' && (
                      <Checkbox
                        checked={selectedPosts.has(`${result.platform}-${result.id}`)}
                        onCheckedChange={() => togglePostSelection(result.platform, result.id)}
                        className="mr-2"
                      />
                    )}
                    {getPlatformIcon(result.platform)}
                    <Badge variant="secondary" className={`${getPlatformColor(result.platform)} text-white`}>
                      {result.platform.toUpperCase()}
                    </Badge>
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
                    <Reply className="w-4 h-4" />
                    <span className="text-sm font-medium">Reply to this post:</span>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">Quick Templates:</label>
                    <div className="grid grid-cols-2 gap-2">
                      {CAMPAIGN_TEMPLATES.map((template, index) => (
                        <Button
                          key={index}
                          variant="outline"
                          size="sm"
                          onClick={() => useTemplate(result.platform, result.id, template.message)}
                          className="text-xs h-auto py-2 px-3 whitespace-normal"
                        >
                          {template.name}
                        </Button>
                      ))}
                    </div>
                  </div>
                  
                  <Textarea
                    placeholder="Enter your reply message or use a template above..."
                    value={replyTexts[`${result.platform}-${result.id}`] || ""}
                    onChange={(e) => setReplyTexts(prev => ({ ...prev, [`${result.platform}-${result.id}`]: e.target.value }))}
                    className="min-h-[120px]"
                  />
                  
                  <div className="flex space-x-2">
                    <Button
                      onClick={() => handleReply(result.platform, result.id)}
                      disabled={replyMutation.isPending || !replyTexts[`${result.platform}-${result.id}`]?.trim() || result.platform !== 'twitter'}
                      size="sm"
                      className="flex-1"
                    >
                      {replyMutation.isPending ? "Posting..." : "Post Reply"}
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
      )}
      
      {searchMutation.isPending && (
        <Card>
          <CardContent className="p-6 text-center">
            <div className="space-y-2">
              <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
              <p className="text-muted-foreground">Searching across platforms...</p>
            </div>
          </CardContent>
        </Card>
      )}
      
      {!searchMutation.isPending && searchResults.length === 0 && keyword && (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            <Search className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No results found for "{keyword}". Try different keywords or select different platforms.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}