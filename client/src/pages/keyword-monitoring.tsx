import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Plus, Eye, MessageCircle, ExternalLink, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface SearchResult {
  platform: string;
  id: string;
  author: string;
  content: string;
  url: string;
  createdAt: string;
}

export default function KeywordMonitoring() {
  const { toast } = useToast();
  const [searchKeyword, setSearchKeyword] = useState("vibe coding");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(["twitter", "reddit"]);
  const [replyTemplate, setReplyTemplate] = useState("Hey! Check out VibeAppZ - we're launching a beta app store with 85% revenue share for developers. First 100 testers get FREE access! 🚀");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [testResults, setTestResults] = useState<{
    twitter: { success: boolean; message: string; needsSetup?: boolean };
    reddit: { success: boolean; message: string };
  } | null>(null);

  // Test API connections mutation
  const testMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("GET", "/api/keywords/test");
      return await response.json();
    },
    onSuccess: (data) => {
      setTestResults(data);
      const allWorking = data.twitter.success && data.reddit.success;
      toast({
        title: allWorking ? "All APIs Working" : "API Issues Found",
        description: allWorking ? "All platform APIs are configured and working" : "Some platform APIs need attention",
        variant: allWorking ? "default" : "destructive"
      });
    },
    onError: (error) => {
      toast({
        title: "Test Failed",
        description: "Failed to test API connections",
        variant: "destructive"
      });
    }
  });

  // Search mutation
  const searchMutation = useMutation({
    mutationFn: async (data: { keyword: string; platforms: string[] }) => {
      const response = await apiRequest("POST", "/api/keywords/search", data);
      return await response.json();
    },
    onSuccess: (data: any) => {
      setSearchResults(data.results || []);
      toast({
        title: "Search Complete",
        description: `Found ${data.totalFound} posts mentioning "${data.keyword}"`
      });
    },
    onError: (error) => {
      console.error("Search error:", error);
      const errorMsg = error.message || "Unknown error occurred";
      toast({
        title: "Search Failed",
        description: errorMsg,
        variant: "destructive"
      });
    }
  });

  // Auto-reply mutation
  const replyMutation = useMutation({
    mutationFn: async (data: { postId: string; platform: string; replyText: string }) => {
      return await apiRequest("POST", "/api/keywords/auto-reply", data);
    },
    onSuccess: () => {
      toast({
        title: "Reply Posted",
        description: "Your reply was posted successfully!"
      });
    },
    onError: (error) => {
      toast({
        title: "Reply Failed",
        description: "Could not post reply. API configuration needed.",
        variant: "destructive"
      });
    }
  });

  const handleSearch = () => {
    if (!searchKeyword.trim()) {
      toast({
        title: "Enter Keyword",
        description: "Please enter a keyword to search for",
        variant: "destructive"
      });
      return;
    }
    searchMutation.mutate({ keyword: searchKeyword, platforms: selectedPlatforms });
  };

  const handleReply = (result: SearchResult) => {
    replyMutation.mutate({
      postId: result.id,
      platform: result.platform,
      replyText: replyTemplate
    });
  };

  const handlePlatformChange = (platform: string, checked: boolean) => {
    if (checked) {
      setSelectedPlatforms([...selectedPlatforms, platform]);
    } else {
      setSelectedPlatforms(selectedPlatforms.filter(p => p !== platform));
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

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Keyword Monitoring</h1>
          <p className="text-muted-foreground mt-2">
            Search for mentions of your keywords across social media platforms and automatically engage with potential customers.
          </p>
        </div>
      </div>

      {/* Search Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Search for Keywords
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="keyword">Keyword to Search</Label>
            <Input
              id="keyword"
              placeholder="e.g., vibe coding, app development"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="mt-1"
            />
          </div>

          <div>
            <Label>Select Platforms</Label>
            <div className="flex gap-4 mt-2">
              {[
                { id: 'twitter', name: 'Twitter/X', icon: '𝕏' },
                { id: 'reddit', name: 'Reddit', icon: '🟠' },
                { id: 'discord', name: 'Discord', icon: '💬' }
              ].map(platform => (
                <div key={platform.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={platform.id}
                    checked={selectedPlatforms.includes(platform.id)}
                    onCheckedChange={(checked) => handlePlatformChange(platform.id, checked as boolean)}
                  />
                  <Label htmlFor={platform.id} className="flex items-center gap-1">
                    <span>{platform.icon}</span>
                    {platform.name}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {/* API Connection Test Section */}
          <div className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-800">
            <div className="flex items-center justify-between mb-3">
              <Label className="text-sm font-medium">API Connection Status</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => testMutation.mutate()}
                disabled={testMutation.isPending}
              >
                {testMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Search className="h-4 w-4 mr-1" />
                )}
                Test Connections
              </Button>
            </div>

            {testResults && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${testResults.twitter.success ? 'bg-green-500' : 'bg-red-500'}`}></span>
                  <span className="text-sm">Twitter/X:</span>
                  <span className={`text-sm ${testResults.twitter.success ? 'text-green-600' : 'text-red-600'}`}>
                    {testResults.twitter.message}
                  </span>
                  {testResults.twitter.needsSetup && (
                    <Button variant="link" size="sm" className="p-0 h-auto" asChild>
                      <a href="/settings">Configure in Settings</a>
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${testResults.reddit.success ? 'bg-green-500' : 'bg-red-500'}`}></span>
                  <span className="text-sm">Reddit:</span>
                  <span className={`text-sm ${testResults.reddit.success ? 'text-green-600' : 'text-red-600'}`}>
                    {testResults.reddit.message}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div>
            <Label htmlFor="reply-template">Auto-Reply Template</Label>
            <Textarea
              id="reply-template"
              placeholder="Your reply template when engaging with found posts..."
              value={replyTemplate}
              onChange={(e) => setReplyTemplate(e.target.value)}
              className="mt-1 min-h-[100px]"
            />
          </div>

          <Button
            onClick={handleSearch}
            disabled={searchMutation.isPending || selectedPlatforms.length === 0}
            className="w-full"
          >
            {searchMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Searching...
              </>
            ) : (
              <>
                <Search className="h-4 w-4 mr-2" />
                Search for "{searchKeyword}"
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Search Results */}
      {searchResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Found Posts ({searchResults.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {searchResults.map((result, index) => (
                <div key={index} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge className={`text-white ${getPlatformColor(result.platform)}`}>
                        {result.platform}
                      </Badge>
                      <span className="font-medium">{result.author}</span>
                      <span className="text-sm text-muted-foreground">
                        {new Date(result.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(result.url, '_blank')}
                      >
                        <ExternalLink className="h-4 w-4 mr-1" />
                        View
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleReply(result)}
                        disabled={replyMutation.isPending}
                      >
                        {replyMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <MessageCircle className="h-4 w-4 mr-1" />
                        )}
                        Reply
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm bg-muted p-3 rounded">
                    {result.content}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {searchResults.length === 0 && !searchMutation.isPending && (
        <Card>
          <CardContent className="text-center py-12">
            <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Results Yet</h3>
            <p className="text-muted-foreground">
              Search for keywords to find potential customers across social media platforms.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}