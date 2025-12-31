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
  Cell,
  Legend
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

  // Get the date range based on selected time range
  const getDateRangeStart = () => {
    switch (timeRange) {
      case "7days": return subDays(new Date(), 7);
      case "30days": return subDays(new Date(), 30);
      case "90days": return subDays(new Date(), 90);
      default: return subDays(new Date(), 7);
    }
  };
  const dateRangeStart = getDateRangeStart();

  // Filter posts by time range
  const filteredPosts = publishedPosts.filter(post => {
    const postDate = new Date(post.publishedAt || post.createdAt);
    return isAfter(postDate, dateRangeStart);
  });

  // Aggregate engagement data by day (not per-post)
  const dailyAggregatedData = (() => {
    // Create a map to store daily totals
    const dailyTotals: Record<string, { date: string; likes: number; comments: number; shares: number; views: number; posts: number }> = {};

    // Initialize all days in the range with zeros
    const days = timeRange === "7days" ? 7 : timeRange === "30days" ? 30 : 90;
    for (let i = days - 1; i >= 0; i--) {
      const d = subDays(new Date(), i);
      const key = format(d, "yyyy-MM-dd");
      const label = days <= 7 ? format(d, "EEE") : days <= 30 ? format(d, "MMM d") : format(d, "MM/dd");
      dailyTotals[key] = { date: label, likes: 0, comments: 0, shares: 0, views: 0, posts: 0 };
    }

    // Aggregate posts into daily buckets
    filteredPosts.forEach(post => {
      const postDate = new Date(post.publishedAt || post.createdAt);
      const key = format(postDate, "yyyy-MM-dd");

      if (dailyTotals[key]) {
        const platformData = post.platformData as any;
        dailyTotals[key].posts += 1;

        if (platformData?.twitter) {
          dailyTotals[key].likes += platformData.twitter.likes || 0;
          dailyTotals[key].comments += platformData.twitter.replies || 0;
          dailyTotals[key].shares += (platformData.twitter.retweets || 0) + (platformData.twitter.quotes || 0);
          dailyTotals[key].views += platformData.twitter.impressions || 0;
        }

        if (platformData?.reddit) {
          dailyTotals[key].likes += platformData.reddit.upvotes || 0;
          dailyTotals[key].comments += platformData.reddit.comments || 0;
        }
      }
    });

    // Convert to array sorted by date
    return Object.entries(dailyTotals)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([_, data]) => data);
  })();

  // Use daily aggregated data for charts
  const analyticsData = dailyAggregatedData;

  // Calculate engagement per platform
  let twitterEngagement = 0;
  let discordEngagement = 0;
  let redditEngagement = 0;

  publishedPosts.forEach(post => {
    const pData = post.platformData as any;
    if (pData?.twitter) {
      twitterEngagement += (pData.twitter.likes || 0) + (pData.twitter.replies || 0) + (pData.twitter.retweets || 0) + (pData.twitter.quotes || 0);
    }
    if (pData?.reddit) {
      redditEngagement += (pData.reddit.upvotes || 0) + (pData.reddit.comments || 0);
    }
  });

  const totalEngagement = twitterEngagement + discordEngagement + redditEngagement;
  const getPercentage = (val: number) => totalEngagement > 0 ? Math.round((val / totalEngagement) * 100) : 0;

  const platformData = [
    { name: "Twitter", value: getPercentage(twitterEngagement), color: platformColors.twitter, posts: posts.filter(p => (p.platforms as string[]).includes("twitter")).length },
    { name: "Discord", value: getPercentage(discordEngagement), color: platformColors.discord, posts: posts.filter(p => (p.platforms as string[]).includes("discord")).length },
    { name: "Reddit", value: getPercentage(redditEngagement), color: platformColors.reddit, posts: posts.filter(p => (p.platforms as string[]).includes("reddit")).length },
  ];

  const topPosts = publishedPosts
    .map(post => {
      const pData = post.platformData as any;
      let engagement = 0;
      if (pData?.twitter) {
        engagement += (pData.twitter.likes || 0) + (pData.twitter.replies || 0) + (pData.twitter.retweets || 0) + (pData.twitter.quotes || 0);
      }
      if (pData?.reddit) {
        engagement += (pData.reddit.upvotes || 0) + (pData.reddit.comments || 0);
      }
      return { ...post, totalEngagement: engagement, platforms: post.platforms as string[] };
    })
    .sort((a, b) => b.totalEngagement - a.totalEngagement)
    .slice(0, 5);

  return (
    <>
      {/* Header */}
      <header className="bg-card shadow-sm border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Analytics</h2>
            <p className="text-muted-foreground mt-1">Track your social media performance across platforms</p>
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
                    <p className="text-sm font-medium text-muted-foreground">All Time Posts</p>
                    <p className="text-2xl font-bold text-foreground">{totalMetrics.posts}</p>
                  </div>
                  <BarChart3 className="h-8 w-8 text-blue-500" />
                </div>
                <div className="flex items-center mt-4 text-sm">
                  <span className="text-muted-foreground">Published posts only</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Total Likes</p>
                    <p className="text-2xl font-bold text-foreground">{totalMetrics.likes.toLocaleString()}</p>
                  </div>
                  <Heart className="h-8 w-8 text-red-500" />
                </div>
                <div className="flex items-center mt-4 text-sm">
                  <span className="text-muted-foreground">
                    {totalMetrics.likes > 0 ? "Live Twitter & Reddit data" : "Click 'Sync Metrics' for live data"}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Total Comments</p>
                    <p className="text-2xl font-bold text-foreground">{totalMetrics.comments.toLocaleString()}</p>
                  </div>
                  <MessageCircle className="h-8 w-8 text-blue-500" />
                </div>
                <div className="flex items-center mt-4 text-sm">
                  <span className="text-muted-foreground">
                    {totalMetrics.comments > 0 ? "Live platform data" : "API sync required"}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Total Retweets</p>
                    <p className="text-2xl font-bold text-foreground">{totalMetrics.shares.toLocaleString()}</p>
                  </div>
                  <Repeat2 className="h-8 w-8 text-green-500" />
                </div>
                <div className="flex items-center mt-4 text-sm">
                  <span className="text-muted-foreground">
                    {totalMetrics.shares > 0 ? "Retweets + Quote tweets" : "Sync to see shares"}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Total Views</p>
                    <p className="text-2xl font-bold text-foreground">{totalMetrics.views.toLocaleString()}</p>
                  </div>
                  <Eye className="h-8 w-8 text-purple-500" />
                </div>
                <div className="flex items-center mt-4 text-sm">
                  <span className="text-muted-foreground">
                    {totalMetrics.views > 0 ? "Live impression data" : "No view data available"}
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
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg text-center">
                  <div className="text-2xl font-bold text-blue-600">{postsPublishedToday.length}</div>
                  <div className="text-sm text-muted-foreground">Posts Published</div>
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
                  <div className="text-sm text-muted-foreground">Today's Likes</div>
                </div>
                <div className="bg-teal-50 p-4 rounded-lg text-center">
                  <div className="text-2xl font-bold text-teal-600">
                    {postsPublishedToday.reduce((total, post) => {
                      const platformData = post.platformData as any;
                      let retweets = 0;
                      if (platformData?.twitter) {
                        retweets += (platformData.twitter.retweets || 0) + (platformData.twitter.quotes || 0);
                      }
                      return total + retweets;
                    }, 0)}
                  </div>
                  <div className="text-sm text-muted-foreground">Today's Retweets</div>
                </div>
                <div className="bg-yellow-50 p-4 rounded-lg text-center">
                  <div className="text-2xl font-bold text-yellow-600">
                    {posts.filter(p => p.status === "scheduled").length}
                  </div>
                  <div className="text-sm text-muted-foreground">Scheduled Posts</div>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg text-center">
                  <div className="text-2xl font-bold text-purple-600">
                    {posts.filter(p => p.status === "draft").length}
                  </div>
                  <div className="text-sm text-muted-foreground">Draft Posts</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue="engagement" className="space-y-6">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="engagement">Engagement Trends</TabsTrigger>
              <TabsTrigger value="platforms">Platform Distribution</TabsTrigger>
              <TabsTrigger value="posts">Top Performing Posts</TabsTrigger>
              <TabsTrigger value="comments">Comments</TabsTrigger>
              <TabsTrigger value="recent">Recent Activity</TabsTrigger>
            </TabsList>

            <TabsContent value="engagement" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Engagement Over Time</span>
                    <span className="text-sm font-normal text-muted-foreground">
                      {filteredPosts.length} posts in selected range
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={400}>
                    <LineChart data={analyticsData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis
                        dataKey="date"
                        tick={{ fill: '#9ca3af', fontSize: 12 }}
                        axisLine={{ stroke: '#4b5563' }}
                      />
                      <YAxis
                        tick={{ fill: '#9ca3af', fontSize: 12 }}
                        axisLine={{ stroke: '#4b5563' }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1f2937',
                          border: '1px solid #374151',
                          borderRadius: '8px'
                        }}
                        labelStyle={{ color: '#f9fafb', fontWeight: 'bold' }}
                        formatter={(value: number, name: string) => [
                          value.toLocaleString(),
                          name.charAt(0).toUpperCase() + name.slice(1)
                        ]}
                      />
                      <Legend
                        wrapperStyle={{ paddingTop: '20px' }}
                        formatter={(value) => <span style={{ color: '#9ca3af' }}>{value.charAt(0).toUpperCase() + value.slice(1)}</span>}
                      />
                      <Line type="monotone" dataKey="likes" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} name="likes" />
                      <Line type="monotone" dataKey="comments" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name="comments" />
                      <Line type="monotone" dataKey="shares" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} name="shares" />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Daily Views & Posts</span>
                    <span className="text-sm font-normal text-muted-foreground">
                      {analyticsData.reduce((sum, d) => sum + d.views, 0).toLocaleString()} total views
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={analyticsData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis
                        dataKey="date"
                        tick={{ fill: '#9ca3af', fontSize: 12 }}
                        axisLine={{ stroke: '#4b5563' }}
                      />
                      <YAxis
                        yAxisId="left"
                        tick={{ fill: '#9ca3af', fontSize: 12 }}
                        axisLine={{ stroke: '#4b5563' }}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        tick={{ fill: '#9ca3af', fontSize: 12 }}
                        axisLine={{ stroke: '#4b5563' }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1f2937',
                          border: '1px solid #374151',
                          borderRadius: '8px'
                        }}
                        labelStyle={{ color: '#f9fafb', fontWeight: 'bold' }}
                        formatter={(value: number, name: string) => [
                          value.toLocaleString(),
                          name === 'views' ? 'Views' : 'Posts'
                        ]}
                      />
                      <Legend
                        wrapperStyle={{ paddingTop: '10px' }}
                        formatter={(value) => <span style={{ color: '#9ca3af' }}>{value === 'views' ? 'Views' : 'Posts Published'}</span>}
                      />
                      <Bar yAxisId="left" dataKey="views" fill="#8b5cf6" name="views" radius={[4, 4, 0, 0]} />
                      <Bar yAxisId="right" dataKey="posts" fill="#3b82f6" name="posts" radius={[4, 4, 0, 0]} />
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
                              <p className="text-sm text-muted-foreground">{platform.posts} posts published</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold" style={{ color: platform.color }}>{platform.value}%</p>
                            <p className="text-sm text-muted-foreground">of total engagement</p>
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
                        <p className="text-muted-foreground">No published posts yet</p>
                        <p className="text-sm text-muted-foreground">Publish some posts to see analytics here</p>
                      </div>
                    ) : (
                      topPosts.map((post, index) => {
                        const platformData = post.platformData as any;
                        const tweetId = platformData?.twitter?.tweetId || platformData?.twitter?.id;
                        const twitterUrl = tweetId ? `https://twitter.com/MaxTruth_Seeker/status/${tweetId}` : null;

                        return (
                          <div key={post.id} className="flex items-center space-x-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                            <div className="flex-shrink-0">
                              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                                <span className="text-sm font-bold text-blue-600">#{index + 1}</span>
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-foreground truncate">
                                {post.content.length > 100
                                  ? `${post.content.substring(0, 100)}...`
                                  : post.content}
                              </p>
                              <div className="flex items-center space-x-4 mt-2">
                                <span className="text-xs text-muted-foreground">
                                  {post.publishedAt && format(new Date(post.publishedAt), "MMM d, yyyy")}
                                </span>
                                {twitterUrl && (
                                  <a href={twitterUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline">
                                    View on Twitter ↗
                                  </a>
                                )}
                              </div>
                            </div>
                            <div className="flex-shrink-0 text-right">
                              <p className="text-lg font-bold text-foreground">{post.totalEngagement}</p>
                              <p className="text-xs text-muted-foreground">engagement</p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="comments" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Posts with Comments</span>
                    <Badge variant="outline" className="text-lg">
                      {publishedPosts.filter(p => {
                        const pData = p.platformData as any;
                        return (pData?.twitter?.replies || 0) > 0;
                      }).length} posts
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {publishedPosts
                      .filter(p => {
                        const pData = p.platformData as any;
                        return (pData?.twitter?.replies || 0) > 0;
                      })
                      .sort((a, b) => {
                        const aData = a.platformData as any;
                        const bData = b.platformData as any;
                        return (bData?.twitter?.replies || 0) - (aData?.twitter?.replies || 0);
                      })
                      .slice(0, 20)
                      .map((post) => {
                        const platformData = post.platformData as any;
                        const tweetId = platformData?.twitter?.tweetId || platformData?.twitter?.id;
                        const twitterUrl = tweetId ? `https://twitter.com/MaxTruth_Seeker/status/${tweetId}` : null;
                        const replies = platformData?.twitter?.replies || 0;
                        const likes = platformData?.twitter?.likes || 0;
                        const retweets = platformData?.twitter?.retweets || 0;

                        return (
                          <div key={post.id} className="flex items-start space-x-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                            <div className="flex-shrink-0">
                              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                                <MessageCircle className="w-6 h-6 text-blue-600" />
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-foreground mb-2">
                                {post.content.length > 150
                                  ? `${post.content.substring(0, 150)}...`
                                  : post.content}
                              </p>
                              <div className="flex items-center space-x-4 text-sm text-muted-foreground mb-2">
                                <span className="flex items-center gap-1">
                                  <MessageCircle className="w-4 h-4 text-blue-500" />
                                  <span className="font-semibold text-blue-500">{replies}</span> comments
                                </span>
                                <span className="flex items-center gap-1">
                                  <Heart className="w-4 h-4 text-red-500" />
                                  {likes}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Repeat2 className="w-4 h-4 text-green-500" />
                                  {retweets}
                                </span>
                              </div>
                              <div className="flex items-center space-x-4">
                                <span className="text-xs text-muted-foreground">
                                  {post.publishedAt && format(new Date(post.publishedAt), "MMM d, h:mm a")}
                                </span>
                                {twitterUrl && (
                                  <a 
                                    href={twitterUrl} 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className="text-xs text-blue-500 hover:underline font-medium"
                                  >
                                    View Comments on Twitter ↗
                                  </a>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    {publishedPosts.filter(p => {
                      const pData = p.platformData as any;
                      return (pData?.twitter?.replies || 0) > 0;
                    }).length === 0 && (
                      <div className="text-center py-8">
                        <MessageCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                        <p className="text-muted-foreground">No comments yet</p>
                        <p className="text-sm text-muted-foreground">Keep posting and engaging with your audience!</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="recent" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Recent Activity Stream</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {publishedPosts
                      .sort((a, b) => new Date(b.publishedAt || 0).getTime() - new Date(a.publishedAt || 0).getTime())
                      .slice(0, 20)
                      .map((post) => {
                        const platformData = post.platformData as any;
                        const isAutoReply = platformData?.twitter?.autoPublished;
                        const tweetId = platformData?.twitter?.tweetId || platformData?.twitter?.id;
                        const twitterUrl = tweetId ? `https://twitter.com/MaxTruth_Seeker/status/${tweetId}` : null;

                        return (
                          <div key={post.id} className="flex items-center space-x-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                            <div className="flex-shrink-0">
                              {isAutoReply ? (
                                <Badge variant="secondary" className="bg-purple-100 text-purple-800">Auto-Reply</Badge>
                              ) : (
                                <Badge variant="outline">Post</Badge>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-foreground truncate">
                                {post.content?.substring(0, 100)}{post.content?.length > 100 ? '...' : ''}
                              </p>
                              <div className="flex items-center space-x-4 mt-2">
                                <span className="text-xs text-muted-foreground">
                                  {post.publishedAt && format(new Date(post.publishedAt), "MMM d, h:mm a")}
                                </span>
                                {/* Engagement metrics */}
                                {platformData?.twitter?.metrics && (
                                  <div className="flex items-center space-x-3 text-xs text-muted-foreground">
                                    <span className="flex items-center gap-1">
                                      <Heart className="w-3 h-3" />
                                      {platformData.twitter.metrics.like_count || 0}
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <Repeat2 className="w-3 h-3" />
                                      {platformData.twitter.metrics.retweet_count || 0}
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <Eye className="w-3 h-3" />
                                      {platformData.twitter.metrics.impression_count || 0}
                                    </span>
                                  </div>
                                )}
                                {twitterUrl && (
                                  <a href={twitterUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline">
                                    View on Twitter ↗
                                  </a>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
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