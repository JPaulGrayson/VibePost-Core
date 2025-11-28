import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Calendar, ChevronLeft, Plus, Send, Edit, Trash2, Save, Search, MessageCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Campaign, Post, InsertPost } from "@shared/schema";

export default function CampaignDetails() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const campaignId = parseInt(params.id!);
  
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    status: "draft" as const,
  });
  
  const [newPost, setNewPost] = useState({
    content: "",
    template: "custom" as const,
  });

  const [automationResults, setAutomationResults] = useState<any[]>([]);
  const [keywordList, setKeywordList] = useState("vibe coding, app development, AI tools");

  // Fetch campaign details
  const { data: campaign, isLoading: campaignLoading } = useQuery<Campaign>({
    queryKey: ["/api/campaigns", campaignId],
    enabled: !!campaignId,
  });

  // Fetch campaign posts
  const { data: posts = [], isLoading: postsLoading } = useQuery<Post[]>({
    queryKey: [`/api/campaigns/${campaignId}/posts`],
    enabled: !!campaignId,
  });

  // Update campaign mutation
  const updateCampaign = useMutation({
    mutationFn: async (updates: Partial<Campaign>) => {
      const response = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updates),
      });
      if (!response.ok) throw new Error("Failed to update campaign");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId] });
      setIsEditing(false);
      toast({
        title: "Campaign updated",
        description: "Your campaign has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update campaign.",
        variant: "destructive",
      });
    },
  });

  // Add post to campaign
  const addPostToCampaign = useMutation({
    mutationFn: async (postData: InsertPost) => {
      const response = await fetch("/api/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...postData,
          campaignId,
          platforms: campaign?.targetPlatforms || [],
          status: "draft",
        }),
      });
      if (!response.ok) throw new Error("Failed to add post");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaignId}/posts`] });
      setNewPost({ content: "", template: "custom" });
      toast({
        title: "Post added",
        description: "Post has been added to the campaign.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add post to campaign.",
        variant: "destructive",
      });
    },
  });

  // Launch campaign
  const launchCampaign = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/campaigns/${campaignId}/launch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) throw new Error("Failed to launch campaign");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns", campaignId] });
      toast({
        title: "Campaign launched",
        description: "Your campaign is now active!",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to launch campaign.",
        variant: "destructive",
      });
    },
  });

  // Delete campaign
  const deleteCampaign = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/campaigns/${campaignId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) throw new Error("Failed to delete campaign");
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Campaign Deleted",
        description: "Campaign has been successfully deleted.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      setLocation("/campaigns");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete campaign. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Save campaign changes
  const saveCampaign = useMutation({
    mutationFn: async (updates: Partial<Campaign>) => {
      const response = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updates),
      });
      if (!response.ok) throw new Error("Failed to save campaign");
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Campaign Saved",
        description: "Changes have been successfully saved.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaignId}`] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save campaign. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Campaign automation - search for keywords and auto-engage
  const autoEngage = useMutation({
    mutationFn: async (keywords: string[]) => {
      // Use the working search API instead of broken auto-engage
      const allResults = [];
      for (const keyword of keywords) {
        const response = await fetch(`/api/search/${encodeURIComponent(keyword)}?platforms=twitter`);
        if (response.ok) {
          const results = await response.json();
          allResults.push(...results);
        }
      }
      return { foundPosts: allResults, totalFound: allResults.length };
    },
    onSuccess: (data) => {
      setAutomationResults(data.foundPosts || []);
      toast({
        title: "Keyword Search Complete",
        description: `Found ${data.totalFound} posts to engage with`,
      });
    },
    onError: (error) => {
      console.error("Automation error:", error);
      const errorMsg = error.message || "Unknown error occurred";
      toast({
        title: "Automation Failed",
        description: errorMsg,
        variant: "destructive",
      });
    },
  });

  if (campaignLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Loading campaign...</div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Campaign not found</div>
      </div>
    );
  }

  const handleEditSubmit = () => {
    updateCampaign.mutate(editForm);
  };

  const handleAddPost = () => {
    if (!newPost.content.trim()) return;
    
    addPostToCampaign.mutate({
      content: newPost.content,
      template: newPost.template,
    });
  };

  const getPlatformBadgeColor = (platform: string) => {
    switch (platform) {
      case "twitter": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "discord": return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
      case "reddit": return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
      default: return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => setLocation("/campaigns")}
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back to Campaigns
          </Button>
        </div>
        
        <div className="flex items-center gap-2">
          <Button 
            variant="outline"
            onClick={() => {
              const campaignData = {
                name: campaign.name,
                description: campaign.description,
                posts: posts.map(p => ({ content: p.content, template: p.template })),
                platforms: campaign.targetPlatforms,
                status: campaign.status
              };
              const blob = new Blob([JSON.stringify(campaignData, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `${campaign.name.replace(/\s+/g, '_')}_campaign.json`;
              a.click();
              URL.revokeObjectURL(url);
              toast({
                title: "Campaign Exported",
                description: "Campaign data has been exported successfully.",
              });
            }}
          >
            <Save className="w-4 h-4 mr-2" />
            Export Campaign
          </Button>
          {campaign.status === "draft" && (
            <Button 
              onClick={() => launchCampaign.mutate()}
              disabled={launchCampaign.isPending || posts.length === 0}
              className="bg-green-600 hover:bg-green-700"
            >
              <Send className="w-4 h-4 mr-2" />
              {launchCampaign.isPending ? "Launching..." : "Launch Campaign"}
            </Button>
          )}
        </div>
      </div>

      {/* Campaign Info */}
      <Card className="mb-6">
        <CardHeader className="flex flex-row items-start justify-between">
          <div className="flex-1">
            {isEditing ? (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="name">Campaign Name</Label>
                  <Input
                    id="name"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    placeholder="Enter campaign name"
                  />
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    placeholder="Campaign description"
                    rows={3}
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleEditSubmit} disabled={updateCampaign.isPending}>
                    {updateCampaign.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                  <Button variant="outline" onClick={() => setIsEditing(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <CardTitle className="text-2xl">{campaign.name}</CardTitle>
                  <Badge variant={campaign.status === "active" ? "default" : "secondary"}>
                    {campaign.status}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditForm({
                        name: campaign.name,
                        description: campaign.description || "",
                        status: campaign.status as "draft",
                      });
                      setIsEditing(true);
                    }}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Campaign</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete this campaign? This action cannot be undone. All posts in this campaign will also be deleted.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction 
                          onClick={() => deleteCampaign.mutate()}
                          disabled={deleteCampaign.isPending}
                          className="bg-red-600 hover:bg-red-700"
                        >
                          {deleteCampaign.isPending ? "Deleting..." : "Delete Campaign"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
                <p className="text-muted-foreground mb-4">{campaign.description}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">Platforms:</span>
                  {campaign.targetPlatforms?.map((platform: string) => (
                    <Badge
                      key={platform}
                      variant="outline"
                      className={getPlatformBadgeColor(platform)}
                    >
                      {platform}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Add New Post */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Add Post to Campaign
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="template">Template</Label>
            <Select value={newPost.template} onValueChange={(value: any) => setNewPost({ ...newPost, template: value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="announcement">📢 Announcement</SelectItem>
                <SelectItem value="tip">💡 Tip</SelectItem>
                <SelectItem value="question">❓ Question</SelectItem>
                <SelectItem value="share">🔗 Share</SelectItem>
                <SelectItem value="custom">✨ Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <Label htmlFor="content">Post Content</Label>
            <Textarea
              id="content"
              value={newPost.content}
              onChange={(e) => setNewPost({ ...newPost, content: e.target.value })}
              placeholder="What would you like to post?"
              rows={4}
            />
          </div>
          
          <Button 
            onClick={handleAddPost}
            disabled={!newPost.content.trim() || addPostToCampaign.isPending}
          >
            {addPostToCampaign.isPending ? "Adding..." : "Add Post"}
          </Button>
        </CardContent>
      </Card>

      {/* Keyword Automation */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="w-5 h-5" />
            Campaign Automation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="keywords">Keywords to Monitor</Label>
            <Input
              id="keywords"
              value={keywordList}
              onChange={(e) => setKeywordList(e.target.value)}
              placeholder="vibe coding, app development, AI tools"
              className="mt-1"
            />
            <p className="text-sm text-muted-foreground mt-1">
              Comma-separated keywords to search for across social media platforms
            </p>
          </div>
          
          <Button
            onClick={() => {
              const keywords = keywordList.split(',').map(k => k.trim()).filter(k => k);
              autoEngage.mutate(keywords);
            }}
            disabled={autoEngage.isPending || !keywordList.trim()}
            className="w-full"
          >
            {autoEngage.isPending ? (
              "Searching for keywords..."
            ) : (
              <>
                <Search className="w-4 h-4 mr-2" />
                Find Posts to Engage With
              </>
            )}
          </Button>

          {automationResults.length > 0 && (
            <div className="mt-4">
              <h4 className="font-medium mb-3">Found Posts ({automationResults.length})</h4>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {automationResults.map((result, index) => (
                  <div key={index} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge className={`text-white ${
                          result.platform === 'twitter' ? 'bg-blue-500' :
                          result.platform === 'reddit' ? 'bg-orange-500' : 'bg-gray-500'
                        }`}>
                          {result.platform}
                        </Badge>
                        <span className="font-medium text-sm">{result.author}</span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(result.url, '_blank')}
                      >
                        <MessageCircle className="w-3 h-3 mr-1" />
                        View Post
                      </Button>
                    </div>
                    <p className="text-sm bg-muted p-2 rounded">
                      {result.content.length > 150 
                        ? result.content.substring(0, 150) + '...' 
                        : result.content}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Campaign Posts */}
      <Card>
        <CardHeader>
          <CardTitle>Campaign Posts ({posts.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {postsLoading ? (
            <div className="text-center py-8">Loading posts...</div>
          ) : posts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No posts added to this campaign yet. Add your first post above!
            </div>
          ) : (
            <div className="space-y-4">
              {posts.map((post: Post) => (
                <div key={post.id} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline">{post.template}</Badge>
                        <Badge variant={post.status === "published" ? "default" : "secondary"}>
                          {post.status}
                        </Badge>
                      </div>
                      <p className="text-sm mb-2">{post.content}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Calendar className="w-3 h-3" />
                        {new Date(post.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}