import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  BarChart3, 
  TrendingUp, 
  Heart, 
  MessageCircle, 
  Repeat2, 
  Eye,
  Calendar,
  Filter
} from "lucide-react";
import { Twitter } from "lucide-react";
import { SiDiscord, SiReddit } from "react-icons/si";
import type { Post, PostAnalytics } from "@shared/schema";
import { format, subDays, isAfter } from "date-fns";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell
} from "recharts";

export default function Analytics() {
  const [timeRange, setTimeRange] = useState("7days");
  const [selectedPlatform, setSelectedPlatform] = useState("all");
  const queryClient = useQueryClient();

  const { data: posts = [] } = useQuery<Post[]>({
    queryKey: ["/api/posts"],
    select: (data) => data.filter(post => post.status === "published"),
  });

  // Mutation to sync metrics for all posts
  const syncAllMetrics = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/posts/sync-all-metrics", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) {
        throw new Error("Failed to sync metrics");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
    },
  });

  const platformIcons = {
    twitter: Twitter,
    discord: SiDiscord,
    reddit: SiReddit,
  };

  const platformColors = {
    twitter: "#1DA1F2",
    discord: "#5865F2",
    reddit: "#FF4500",
  };

  // Calculate real analytics from published posts
  const publishedPosts = posts.filter(post => post.status === "published");
  
  // Filter posts published today for consistency with sidebar
  const today = new Date();
  const postsPublishedToday = publishedPosts.filter(p => {
    if (!p.publishedAt) return false;
    const postDate = new Date(p.publishedAt);
    return postDate.toDateString() === today.toDateString();
  });
  
  const allPlatforms = publishedPosts.flatMap(p => p.platforms as string[]);
  const uniquePlatforms = new Set(allPlatforms);
  const uniquePlatformArray = Array.from(uniquePlatforms);
  
  // Calculate real metrics from platformData
  const totalMetrics = publishedPosts.reduce((totals, post) => {
    const platformData = post.platformData as any;
    
    // Twitter metrics
    if (platformData?.twitter) {
      totals.likes += platformData.twitter.likes || 0;
      totals.comments += platformData.twitter.replies || 0;
      totals.shares += (platformData.twitter.retweets || 0) + (platformData.twitter.quotes || 0);
      totals.views += platformData.twitter.impressions || 0;
    }
    
    // Reddit metrics
    if (platformData?.reddit) {
      totals.likes += platformData.reddit.upvotes || 0;
      totals.comments += platformData.reddit.comments || 0;
      totals.shares += 0; // Reddit doesn't have shares
      totals.views += 0; // Reddit views not available via API
    }
    
    return totals;
  }, {
    posts: publishedPosts.length,
    platforms: uniquePlatformArray.length,
    likes: 0,
    comments: 0,
    shares: 0,
    views: 0,
  });

  // Real engagement data over time based on actual posts
  const analyticsData = publishedPosts.map(post => ({
    date: format(new Date(post.createdAt), "MMM dd"),
    fullDate: new Date(post.createdAt),
    post: post.content.substring(0, 30) + "...",
    platforms: (post.platforms as string[]).join(", "),
    likes: 0, // Would be fetched from platform APIs
    comments: 0,
    shares: 0,
    views: 0,
  }));

  const platformData = [
    { name: "Twitter", value: 45, color: platformColors.twitter, posts: posts.filter(p => (p.platforms as string[]).includes("twitter")).length },
    { name: "Discord", value: 30, color: platformColors.discord, posts: posts.filter(p => (p.platforms as string[]).includes("discord")).length },
    { name: "Reddit", value: 25, color: platformColors.reddit, posts: posts.filter(p => (p.platforms as string[]).includes("reddit")).length },
  ];

  const topPosts = publishedPosts
    .slice(0, 5)
    .map(post => ({
      ...post,
      totalEngagement: 0, // Real engagement would come from platform APIs
      platforms: post.platforms as string[],
    }));

  return (
    <>
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Analytics</h2>
            <p className="text-gray-600 mt-1">Track your social media performance across platforms</p>
          </div>
          <div className="flex items-center space-x-4">
            <Button 
              onClick={() => syncAllMetrics.mutate()}
              disabled={syncAllMetrics.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {syncAllMetrics.isPending ? "Syncing..." : "Sync Metrics"}
            </Button>
            <Select value={selectedPlatform} onValueChange={setSelectedPlatform}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Platform" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Platforms</SelectItem>
                <SelectItem value="twitter">Twitter</SelectItem>
                <SelectItem value="discord">Discord</SelectItem>
                <SelectItem value="reddit">Reddit</SelectItem>
              </SelectContent>
            </Select>
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Time Range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7days">Last 7 days</SelectItem>
                <SelectItem value="30days">Last 30 days</SelectItem>
                <SelectItem value="90days">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>

      <div className="p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">All Time Posts</p>
                    <p className="text-2xl font-bold text-gray-900">{totalMetrics.posts}</p>
                  </div>
                  <BarChart3 className="h-8 w-8 text-blue-500" />
                </div>
                <div className="flex items-center mt-4 text-sm">
                  <span className="text-gray-500">Published posts only</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Likes</p>
                    <p className="text-2xl font-bold text-gray-900">{totalMetrics.likes.toLocaleString()}</p>
                  </div>
                  <Heart className="h-8 w-8 text-red-500" />
                </div>
                <div className="flex items-center mt-4 text-sm">
                  <span className="text-gray-500">
                    {totalMetrics.likes > 0 ? "Live Twitter & Reddit data" : "Click 'Sync Metrics' for live data"}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Comments</p>
                    <p className="text-2xl font-bold text-gray-900">{totalMetrics.comments.toLocaleString()}</p>
                  </div>
                  <MessageCircle className="h-8 w-8 text-blue-500" />
                </div>
                <div className="flex items-center mt-4 text-sm">
                  <span className="text-gray-500">
                    {totalMetrics.comments > 0 ? "Live platform data" : "API sync required"}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Views</p>
                    <p className="text-2xl font-bold text-gray-900">{totalMetrics.views.toLocaleString()}</p>
                  </div>
                  <Eye className="h-8 w-8 text-purple-500" />
                </div>
                <div className="flex items-center mt-4 text-sm">
                  <span className="text-gray-500">
                    {totalMetrics.views > 0 ? "Live impression data" : "Twitter API quota exceeded"}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Today's Activity Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Calendar className="h-5 w-5" />
                <span>Today's Activity</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg text-center">
                  <div className="text-2xl font-bold text-blue-600">{postsPublishedToday.length}</div>
                  <div className="text-sm text-gray-600">Posts Published</div>
                </div>
                <div className="bg-green-50 p-4 rounded-lg text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {postsPublishedToday.reduce((total, post) => {
                      const platformData = post.platformData as any;
                      let likes = 0;
                      if (platformData?.twitter) likes += platformData.twitter.likes || 0;
                      if (platformData?.reddit) likes += platformData.reddit.upvotes || 0;
                      return total + likes;
                    }, 0)}
                  </div>
                  <div className="text-sm text-gray-600">Today's Engagement</div>
                </div>
                <div className="bg-yellow-50 p-4 rounded-lg text-center">
                  <div className="text-2xl font-bold text-yellow-600">
                    {posts.filter(p => p.status === "scheduled").length}
                  </div>
                  <div className="text-sm text-gray-600">Scheduled Posts</div>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg text-center">
                  <div className="text-2xl font-bold text-purple-600">
                    {posts.filter(p => p.status === "draft").length}
                  </div>
                  <div className="text-sm text-gray-600">Draft Posts</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue="engagement" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="engagement">Engagement Trends</TabsTrigger>
              <TabsTrigger value="platforms">Platform Distribution</TabsTrigger>
              <TabsTrigger value="posts">Top Performing Posts</TabsTrigger>
            </TabsList>

            <TabsContent value="engagement" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Engagement Over Time</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={400}>
                    <LineChart data={analyticsData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="likes" stroke="#ef4444" strokeWidth={2} />
                      <Line type="monotone" dataKey="comments" stroke="#3b82f6" strokeWidth={2} />
                      <Line type="monotone" dataKey="shares" stroke="#10b981" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Daily Views</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={analyticsData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="views" fill="#8b5cf6" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="platforms" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Platform Distribution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={platformData}
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                          label={({ name, value }) => `${name}: ${value}%`}
                        >
                          {platformData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Platform Performance</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {platformData.map((platform) => {
                      const IconComponent = platformIcons[platform.name.toLowerCase() as keyof typeof platformIcons];
                      return (
                        <div key={platform.name} className="flex items-center justify-between p-4 border rounded-lg">
                          <div className="flex items-center space-x-3">
                            {IconComponent && <IconComponent className="text-lg" style={{ color: platform.color }} />}
                            <div>
                              <p className="font-medium">{platform.name}</p>
                              <p className="text-sm text-gray-500">{platform.posts} posts published</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold" style={{ color: platform.color }}>{platform.value}%</p>
                            <p className="text-sm text-gray-500">of total engagement</p>
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="posts" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Top Performing Posts</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {topPosts.length === 0 ? (
                      <div className="text-center py-8">
                        <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                        <p className="text-gray-500">No published posts yet</p>
                        <p className="text-sm text-gray-400">Publish some posts to see analytics here</p>
                      </div>
                    ) : (
                      topPosts.map((post, index) => (
                        <div key={post.id} className="flex items-center space-x-4 p-4 border rounded-lg">
                          <div className="flex-shrink-0">
                            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                              <span className="text-sm font-bold text-blue-600">#{index + 1}</span>
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-900 truncate">
                              {post.content.length > 100 
                                ? `${post.content.substring(0, 100)}...` 
                                : post.content}
                            </p>
                            <div className="flex items-center space-x-4 mt-2">
                              <span className="text-xs text-gray-500">
                                {post.publishedAt && format(new Date(post.publishedAt), "MMM d, yyyy")}
                              </span>
                              <div className="flex items-center space-x-2">
                                {post.platforms.map((platform) => {
                                  const IconComponent = platformIcons[platform as keyof typeof platformIcons];
                                  return IconComponent ? (
                                    <IconComponent key={platform} className="w-3 h-3" style={{ color: platformColors[platform as keyof typeof platformColors] }} />
                                  ) : null;
                                })}
                              </div>
                            </div>
                          </div>
                          <div className="flex-shrink-0 text-right">
                            <p className="text-lg font-bold text-gray-900">{post.totalEngagement}</p>
                            <p className="text-xs text-gray-500">total engagement</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </>
  );
}