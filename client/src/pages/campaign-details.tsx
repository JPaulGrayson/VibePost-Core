import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Calendar, ChevronLeft, Plus, Send, Edit, Trash2, Save, Search, MessageCircle, Wand2, ImagePlus, Upload, Copy, ExternalLink, Sparkles, Download } from "lucide-react";
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
    imageUrl: "",
  });
  const quickPostFileRef = useRef<HTMLInputElement>(null);

  const [automationResults, setAutomationResults] = useState<any[]>([]);
  const [keywordList, setKeywordList] = useState("vibe coding, app development, AI tools");

  // Manual Post Creator state
  const [manualPost, setManualPost] = useState({
    originalTweet: "",
    originalAuthor: "",
    generatedReply: "",
    imageUrl: "",
    strategy: "vibe_scout" as string,
    arenaUrl: "",
    customImagePrompt: "",
  });
  const [isGeneratingReply, setIsGeneratingReply] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    mutationFn: async (postData: { content: string; template?: string; mediaUrl?: string }) => {
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
      setNewPost({ content: "", template: "custom", imageUrl: "" });
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

  // Generate AI reply for manual post
  const generateAIReply = async () => {
    if (!manualPost.originalTweet.trim()) {
      toast({ title: "Error", description: "Please paste a tweet first", variant: "destructive" });
      return;
    }
    
    setIsGeneratingReply(true);
    try {
      const response = await fetch("/api/generate-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalTweet: manualPost.originalTweet,
          originalAuthor: manualPost.originalAuthor || "unknown",
          strategy: manualPost.strategy,
        }),
      });
      
      if (!response.ok) throw new Error("Failed to generate reply");
      const data = await response.json();
      
      setManualPost(prev => ({ ...prev, generatedReply: data.reply, arenaUrl: data.arenaUrl || "" }));
      setShowPreview(true);
      toast({ title: "Reply Generated", description: "AI has crafted a response for you" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to generate reply", variant: "destructive" });
    } finally {
      setIsGeneratingReply(false);
    }
  };

  // Generate AI image for the post
  const generateAIImage = async () => {
    // Clear existing image first so user sees it's regenerating
    setManualPost(prev => ({ ...prev, imageUrl: "" }));
    setIsGeneratingImage(true);
    try {
      const response = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: manualPost.originalTweet || "coding and technology",
          style: "tech-professional",
          customPrompt: manualPost.customImagePrompt || undefined,
        }),
      });
      
      if (!response.ok) throw new Error("Failed to generate image");
      const data = await response.json();
      
      // Add cache-busting timestamp to force browser to fetch new image
      const separator = data.imageUrl.includes('?') ? '&' : '?';
      const imageUrlWithCache = data.imageUrl + `${separator}t=${Date.now()}`;
      setManualPost(prev => ({ ...prev, imageUrl: imageUrlWithCache }));
      toast({ title: "Image Generated", description: "AI image is ready" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to generate image", variant: "destructive" });
    } finally {
      setIsGeneratingImage(false);
    }
  };

  // Handle image file upload
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setManualPost(prev => ({ ...prev, imageUrl: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  // Save manual post to campaign
  const saveManualPost = async () => {
    if (!manualPost.generatedReply.trim()) {
      toast({ title: "Error", description: "Generate a reply first", variant: "destructive" });
      return;
    }

    try {
      await addPostToCampaign.mutateAsync({
        content: manualPost.generatedReply,
        template: "custom",
        mediaUrl: manualPost.imageUrl || undefined,
      });
      
      // Reset form
      setManualPost({
        originalTweet: "",
        originalAuthor: "",
        generatedReply: "",
        imageUrl: "",
        strategy: "vibe_scout",
        arenaUrl: "",
        customImagePrompt: "",
      });
      setShowPreview(false);
      toast({ title: "Saved!", description: "Post added to campaign" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to save post", variant: "destructive" });
    }
  };

  // Copy reply to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied!", description: "Reply copied to clipboard" });
  };

  // Download image to device
  const downloadImage = async () => {
    if (!manualPost.imageUrl) return;
    
    try {
      const response = await fetch(manualPost.imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vibepost-image-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast({ title: "Downloaded!", description: "Image saved to your device" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to download image", variant: "destructive" });
    }
  };

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
      mediaUrl: newPost.imageUrl || undefined,
    }, {
      onSuccess: () => {
        setNewPost({ content: "", template: "custom", imageUrl: "" });
      }
    });
  };

  const handleQuickPostImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setNewPost(prev => ({ ...prev, imageUrl: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const strategyOptions = [
    { value: "vibe_scout", label: "🎯 Vibe Coding Scout", description: "Helpful developer friend" },
    { value: "spaghetti_detective", label: "🍝 Spaghetti Detective", description: "Debug messy code" },
    { value: "bootcamp_savior", label: "🎓 Bootcamp Savior", description: "Help learning devs" },
    { value: "arena_referee", label: "🏛️ Arena Referee", description: "AI model comparison" },
    { value: "code_flowchart", label: "📊 Code Flowchart", description: "Visualize code logic" },
  ];

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
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button className="bg-green-600 hover:bg-green-700">
                  <Calendar className="w-4 h-4 mr-2" />
                  Schedule Campaign
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Schedule Campaign?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will schedule all {posts.length} draft posts to be published.
                    <br /><br />
                    <strong>Note:</strong> To prevent spam detection, posts will be spaced out automatically.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => launchCampaign.mutate()}
                    disabled={launchCampaign.isPending || posts.length === 0}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {launchCampaign.isPending ? "Scheduling..." : "Confirm Schedule"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
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

      {/* Manual Post Creator */}
      <Card className="mb-6 border-2 border-dashed border-purple-500/30 bg-gradient-to-br from-slate-900/50 to-purple-900/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-purple-300">
            <Wand2 className="w-5 h-5" />
            Manual Post Creator
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Paste a tweet you found, and AI will craft a perfect response with an image
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Step 1: Paste Tweet */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-blue-500/20 text-blue-300">Step 1</Badge>
              <Label>Paste Tweet Text</Label>
            </div>
            <Textarea
              value={manualPost.originalTweet}
              onChange={(e) => setManualPost({ ...manualPost, originalTweet: e.target.value })}
              placeholder="Paste the tweet content you want to respond to..."
              rows={3}
              className="bg-slate-800/50"
            />
            <Input
              value={manualPost.originalAuthor}
              onChange={(e) => setManualPost({ ...manualPost, originalAuthor: e.target.value })}
              placeholder="@username (optional)"
              className="bg-slate-800/50 w-48"
            />
          </div>

          {/* Step 2: Choose Strategy & Generate */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-green-500/20 text-green-300">Step 2</Badge>
              <Label>Choose Strategy & Generate Reply</Label>
            </div>
            <div className="flex gap-3 flex-wrap">
              <Select value={manualPost.strategy} onValueChange={(value) => setManualPost({ ...manualPost, strategy: value })}>
                <SelectTrigger className="w-64 bg-slate-800/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {strategyOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={generateAIReply}
                disabled={isGeneratingReply || !manualPost.originalTweet.trim()}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {isGeneratingReply ? (
                  <>Generating...</>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Generate Reply
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Step 3: Add Image */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-orange-500/20 text-orange-300">Step 3</Badge>
              <Label>Add Image (Optional)</Label>
            </div>
            
            {/* Custom Image Prompt */}
            <div className="space-y-2">
              <Input
                placeholder="Custom image prompt (e.g., 'train going over broken trestle bridge')"
                value={manualPost.customImagePrompt}
                onChange={(e) => setManualPost({ ...manualPost, customImagePrompt: e.target.value })}
                className="bg-slate-800 border-slate-600"
              />
              <p className="text-xs text-gray-500">Leave empty to auto-generate from tweet context</p>
            </div>
            
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={generateAIImage}
                disabled={isGeneratingImage}
              >
                {isGeneratingImage ? "Generating..." : (
                  <>
                    <ImagePlus className="w-4 h-4 mr-2" />
                    AI Generate
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-4 h-4 mr-2" />
                Upload
              </Button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageUpload}
                accept="image/*"
                className="hidden"
              />
              {manualPost.imageUrl && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setManualPost({ ...manualPost, imageUrl: "" })}
                  className="text-red-400"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
            {manualPost.imageUrl && (
              <div className="mt-2 space-y-2">
                <img 
                  src={manualPost.imageUrl} 
                  alt="Post image" 
                  className="max-w-xs rounded-lg border border-slate-600"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={downloadImage}
                  className="text-green-400 hover:text-green-300"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download Image
                </Button>
              </div>
            )}
          </div>

          {/* Preview & Actions */}
          {showPreview && manualPost.generatedReply && (
            <div className="space-y-4 pt-4 border-t border-slate-700">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-yellow-500/20 text-yellow-300">Preview</Badge>
              </div>
              
              {/* Original Tweet Preview */}
              <div className="bg-slate-800/70 rounded-lg p-4 border-l-4 border-blue-500">
                <p className="text-xs text-blue-400 mb-1">Original Tweet {manualPost.originalAuthor && `from ${manualPost.originalAuthor}`}</p>
                <p className="text-sm text-gray-300">{manualPost.originalTweet}</p>
              </div>

              {/* Generated Reply */}
              <div className="bg-slate-800/70 rounded-lg p-4 border-l-4 border-purple-500">
                <p className="text-xs text-purple-400 mb-1">Your Reply</p>
                <Textarea
                  value={manualPost.generatedReply}
                  onChange={(e) => setManualPost({ ...manualPost, generatedReply: e.target.value })}
                  rows={4}
                  className="bg-transparent border-none p-0 resize-none"
                />
                <div className="flex items-center justify-between mt-3">
                  <span className="text-xs text-gray-500">{manualPost.generatedReply.length}/280 characters</span>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(manualPost.generatedReply)}
                    >
                      <Copy className="w-4 h-4 mr-1" />
                      Copy
                    </Button>
                  </div>
                </div>
              </div>

              {/* Arena Link Verification */}
              {manualPost.arenaUrl && (
                <div className="bg-green-900/30 rounded-lg p-3 border border-green-600/50 flex items-center gap-3">
                  <span className="text-green-400 text-xl">✓</span>
                  <div className="flex-1">
                    <p className="text-xs text-green-400 font-medium">Arena Link Included</p>
                    <a 
                      href={manualPost.arenaUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-xs text-green-300 hover:underline truncate block"
                    >
                      {manualPost.arenaUrl}
                    </a>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.open(manualPost.arenaUrl, '_blank')}
                    className="text-green-400"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3">
                <Button
                  onClick={saveManualPost}
                  disabled={addPostToCampaign.isPending}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {addPostToCampaign.isPending ? "Saving..." : "Save to Campaign"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => copyToClipboard(manualPost.generatedReply)}
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copy & Post Manually
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Add Post (Simple) */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Plus className="w-4 h-4" />
            Quick Add Post
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            id="content"
            value={newPost.content}
            onChange={(e) => setNewPost({ ...newPost, content: e.target.value })}
            placeholder="Write a quick post..."
            rows={2}
          />
          
          {/* Image Upload for Quick Post */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => quickPostFileRef.current?.click()}
            >
              <Upload className="w-4 h-4 mr-1" />
              Add Image
            </Button>
            <input
              type="file"
              ref={quickPostFileRef}
              onChange={handleQuickPostImageUpload}
              accept="image/*"
              className="hidden"
            />
            {newPost.imageUrl && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setNewPost({ ...newPost, imageUrl: "" })}
                className="text-red-400"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
          
          {/* Image Preview */}
          {newPost.imageUrl && (
            <div className="mt-2">
              <img 
                src={newPost.imageUrl} 
                alt="Post image" 
                className="max-w-[200px] rounded-lg border border-slate-600"
              />
            </div>
          )}
          
          <Button
            size="sm"
            onClick={handleAddPost}
            disabled={!newPost.content.trim() || addPostToCampaign.isPending}
          >
            {addPostToCampaign.isPending ? "Adding..." : "Add Post"}
          </Button>
        </CardContent>
      </Card>

      {/* Lead Finder (formerly Campaign Automation) */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="w-5 h-5" />
            Lead Finder
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
              Find relevant posts across social media to engage with manually.
            </p>

            <div className="mt-3">
              <Label className="text-xs text-muted-foreground mb-2 block">Recommended Tags:</Label>
              <div className="flex flex-wrap gap-2">
                {[
                  "#SlowTravel", "#DigitalNomad", "#HiddenGems", "#TravelGram",
                  "#Wanderlust", "#SoloTravel", "#AdventureTravel", "#SustainableTravel"
                ].map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="cursor-pointer hover:bg-secondary/80"
                    onClick={() => {
                      const current = keywordList.split(',').map(k => k.trim()).filter(k => k);
                      if (!current.includes(tag)) {
                        setKeywordList(current.length > 0 ? `${keywordList}, ${tag}` : tag);
                      }
                    }}
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
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
              "Searching for leads..."
            ) : (
              <>
                <Search className="w-4 h-4 mr-2" />
                Find Leads
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
                        <Badge className={`text-white ${result.platform === 'twitter' ? 'bg-blue-500' :
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
                  <div className="flex items-start justify-between gap-4">
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
                    {post.mediaUrl && (
                      <img 
                        src={post.mediaUrl} 
                        alt="Post media" 
                        className="w-24 h-24 object-cover rounded-lg border border-slate-600"
                      />
                    )}
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