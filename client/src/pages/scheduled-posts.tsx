import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Clock, Edit2, Trash2, Play, Pause, Plane, Code2 } from "lucide-react";
import { Twitter, MessageSquare } from "lucide-react";
import { SiDiscord, SiReddit } from "react-icons/si";
import type { Post } from "@shared/schema";
import { format, isAfter, isBefore, addDays } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// Helper to detect campaign type from post content/data
function getCampaignType(post: Post): 'turai' | 'logigo' | 'unknown' {
  const platformData = post.platformData as Record<string, any> | null | undefined;
  
  if (platformData) {
    for (const platform of Object.keys(platformData)) {
      const campaignValue = platformData[platform]?.campaign;
      if (campaignValue) {
        const normalized = String(campaignValue).toLowerCase();
        if (normalized === 'turai') return 'turai';
        if (normalized === 'logigo') return 'logigo';
      }
    }
  }
  
  const content = (post.content || '').toLowerCase();
  const turaiKeywords = ['travel', 'destination', 'tour', 'mystical', 'crystal ball', 'paris', 'london', 'tokyo', 'rome', 'barcelona', 'spirit', 'magic', 'wander', 'postcard'];
  const logigoKeywords = ['code', 'debugging', 'vibe coding', 'logigo', 'flowchart', 'founder account', 'visualiz', 'diagram', 'agent', 'cursor', 'claude'];
  
  const hasTuraiKeyword = turaiKeywords.some(kw => content.includes(kw));
  const hasLogigoKeyword = logigoKeywords.some(kw => content.includes(kw));
  
  if (hasLogigoKeyword && !hasTuraiKeyword) return 'logigo';
  if (hasTuraiKeyword) return 'turai';
  
  return 'turai';
}

export default function ScheduledPosts() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [timeFilter, setTimeFilter] = useState("all");
  const [campaignFilter, setCampaignFilter] = useState("all");

  const { data: allPosts = [], isLoading } = useQuery<Post[]>({
    queryKey: ["/api/posts"],
  });

  const scheduledPosts = allPosts.filter(post => post.status === "scheduled");

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

  const publishNowMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("POST", `/api/posts/${id}/publish`);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Post published!",
        description: "Your scheduled post has been published immediately.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to publish post. Please try again.",
        variant: "destructive",
      });
    },
  });

  const cancelScheduleMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("PATCH", `/api/posts/${id}`, { status: "draft" });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Schedule cancelled",
        description: "Post moved back to drafts.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
    },
  });

  const getTimeUntilPost = (scheduledAt: string | Date) => {
    const scheduled = new Date(scheduledAt);
    const now = new Date();
    const diff = scheduled.getTime() - now.getTime();

    if (diff < 0) return "Overdue";

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  // Campaign counts
  const turaiCount = scheduledPosts.filter(p => getCampaignType(p) === 'turai').length;
  const logigoCount = scheduledPosts.filter(p => getCampaignType(p) === 'logigo').length;

  const filteredPosts = scheduledPosts.filter(post => {
    const matchesSearch = post.content.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Campaign filter
    const campaign = getCampaignType(post);
    const matchesCampaign = campaignFilter === "all" || campaign === campaignFilter;

    if (!matchesCampaign) return false;
    if (timeFilter === "all") return matchesSearch;

    if (!post.scheduledAt) return false;

    const scheduled = new Date(post.scheduledAt);
    const now = new Date();

    switch (timeFilter) {
      case "today":
        return matchesSearch && isAfter(scheduled, now) && isBefore(scheduled, addDays(now, 1));
      case "week":
        return matchesSearch && isAfter(scheduled, now) && isBefore(scheduled, addDays(now, 7));
      case "overdue":
        return matchesSearch && isBefore(scheduled, now);
      default:
        return matchesSearch;
    }
  });

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="max-w-6xl mx-auto">
          <div className="animate-pulse space-y-4">
            {[...Array(3)].map((_, i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <header className="bg-card shadow-sm border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Scheduled Posts</h2>
            <p className="text-muted-foreground mt-1">Manage your upcoming scheduled content</p>
          </div>
          <div className="text-sm text-muted-foreground">
            {filteredPosts.length} scheduled posts
          </div>
        </div>
      </header>

      <div className="p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Input
                    placeholder="Search scheduled posts..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <div className="sm:w-48">
                  <Select value={campaignFilter} onValueChange={setCampaignFilter} data-testid="select-campaign-filter">
                    <SelectTrigger>
                      <SelectValue placeholder="Filter by campaign" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Campaigns ({scheduledPosts.length})</SelectItem>
                      <SelectItem value="turai">Turai ({turaiCount})</SelectItem>
                      <SelectItem value="logigo">LogiGo ({logigoCount})</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:w-48">
                  <Select value={timeFilter} onValueChange={setTimeFilter} data-testid="select-time-filter">
                    <SelectTrigger>
                      <SelectValue placeholder="Filter by time" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Scheduled</SelectItem>
                      <SelectItem value="today">Today</SelectItem>
                      <SelectItem value="week">This Week</SelectItem>
                      <SelectItem value="overdue">Overdue</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Scheduled Posts List */}
          <div className="space-y-4">
            {filteredPosts.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">No scheduled posts</h3>
                  <p className="text-muted-foreground">
                    {searchTerm || timeFilter !== "all"
                      ? "Try adjusting your filters to see more posts."
                      : "Schedule your first post to see it here!"}
                  </p>
                </CardContent>
              </Card>
            ) : (
              filteredPosts.map((post) => {
                const isOverdue = post.scheduledAt && isBefore(new Date(post.scheduledAt), new Date());
                const campaign = getCampaignType(post);
                const campaignStyles = {
                  turai: { border: 'border-l-4 border-l-blue-500', badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300', icon: Plane },
                  logigo: { border: 'border-l-4 border-l-purple-500', badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300', icon: Code2 },
                  unknown: { border: 'border-l-4 border-l-gray-400', badge: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300', icon: null }
                };
                const style = campaignStyles[campaign];
                const CampaignIcon = style.icon;

                return (
                  <Card key={post.id} className={`${style.border} ${isOverdue ? "border-red-200 bg-red-50 dark:bg-red-950" : ""}`} data-testid={`card-scheduled-${post.id}`}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-2">
                            <Badge className={style.badge} data-testid={`badge-campaign-${post.id}`}>
                              {CampaignIcon && <CampaignIcon className="h-3 w-3 mr-1" />}
                              {campaign === 'turai' ? 'Turai' : campaign === 'logigo' ? 'LogiGo' : 'Other'}
                            </Badge>
                            <Badge className={isOverdue ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}>
                              {isOverdue ? "Overdue" : "Scheduled"}
                            </Badge>
                            {post.template && (
                              <Badge variant="outline" className="capitalize">
                                {post.template}
                              </Badge>
                            )}
                          </div>

                          <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                            {post.scheduledAt && (
                              <>
                                <div className="flex items-center space-x-1">
                                  <Clock className="h-4 w-4" />
                                  <span>
                                    {format(new Date(post.scheduledAt), "MMM d, yyyy 'at' h:mm a")}
                                  </span>
                                </div>
                                <div className="flex items-center space-x-1">
                                  <Calendar className="h-4 w-4" />
                                  <span className={isOverdue ? "text-red-600 font-medium" : "text-blue-600 font-medium"}>
                                    {getTimeUntilPost(post.scheduledAt)}
                                  </span>
                                </div>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => publishNowMutation.mutate(post.id)}
                            disabled={publishNowMutation.isPending}
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm">
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => cancelScheduleMutation.mutate(post.id)}
                            disabled={cancelScheduleMutation.isPending}
                          >
                            <Pause className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent>
                      <p className="text-foreground mb-4 whitespace-pre-line">
                        {post.content.length > 200
                          ? `${post.content.substring(0, 200)}...`
                          : post.content}
                      </p>

                      {/* Platforms */}
                      <div className="flex items-center space-x-3">
                        {(post.platforms as string[]).map((platform) => {
                          const IconComponent = platformIcons[platform as keyof typeof platformIcons];
                          const iconColor = platformColors[platform as keyof typeof platformColors];

                          return (
                            <div key={platform} className="flex items-center space-x-1">
                              {IconComponent && <IconComponent className={`${iconColor} text-sm`} />}
                              <span className="text-sm text-muted-foreground capitalize">{platform}</span>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </div>
      </div>
    </>
  );
}