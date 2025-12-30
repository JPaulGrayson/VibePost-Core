import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, Users, Target, DollarSign, MapPin, Clock, Hash, Sparkles } from "lucide-react";

interface GrowthMetrics {
    date: string;
    followerCount: number;
    totalPosts: number;
    engagementRate: number;
    avgImpressionsPerPost: number;
    postsWithEngagement: number;
    topDestination: string;
}

interface DestinationPerformance {
    destination: string;
    totalPosts: number;
    totalEngagements: number;
    avgEngagement: number;
}

interface PatternAnalysis {
    topEmoji: { emoji: string; avgEngagement: number };
    topKeyword: { keyword: string; avgEngagement: number };
    topDestination: { name: string; avgEngagement: number };
    bestHour: { hour: number; avgEngagement: number };
    bestLength: { range: string; avgEngagement: number };
}

export default function GrowthReports() {
    // Fetch current metrics
    const { data: metrics, isLoading: metricsLoading } = useQuery<GrowthMetrics>({
        queryKey: ["/api/growth/current"],
    });

    // Fetch top destinations
    const { data: destinations, isLoading: destinationsLoading } = useQuery<DestinationPerformance[]>({
        queryKey: ["/api/growth/destinations"],
    });

    // Fetch pattern analysis
    const { data: patterns, isLoading: patternsLoading } = useQuery<PatternAnalysis>({
        queryKey: ["/api/growth/patterns"],
    });

    if (metricsLoading || destinationsLoading || patternsLoading) {
        return (
            <div className="container mx-auto p-6 space-y-6">
                <Skeleton className="h-12 w-64" />
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {[...Array(4)].map((_, i) => (
                        <Skeleton key={i} className="h-32" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-6 space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold">Growth & Monetization Reports</h1>
                <p className="text-muted-foreground mt-1">
                    Track your influencer growth and identify winning patterns
                </p>
            </div>

            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <MetricCard
                    title="Followers"
                    value={metrics?.followerCount?.toLocaleString() || "Track manually"}
                    icon={<Users className="h-4 w-4" />}
                    trend={null}
                    color="blue"
                />
                <MetricCard
                    title="Total Posts"
                    value={metrics?.totalPosts.toLocaleString() || "0"}
                    icon={<Hash className="h-4 w-4" />}
                    trend={null}
                    color="purple"
                />
                <MetricCard
                    title="Engagement Rate"
                    value={`${metrics?.engagementRate.toFixed(2)}%`}
                    icon={<TrendingUp className="h-4 w-4" />}
                    trend={metrics && metrics.engagementRate >= 7 ? "up" : null}
                    color="green"
                />
                <MetricCard
                    title="Avg Impressions"
                    value={metrics?.avgImpressionsPerPost.toFixed(1) || "0"}
                    icon={<Target className="h-4 w-4" />}
                    trend={null}
                    color="orange"
                />
            </div>

            {/* Milestone Progress */}
            <Card>
                <CardHeader>
                    <CardTitle>🎯 Milestone Progress</CardTitle>
                    <CardDescription>Track your progress toward monetization goals</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <MilestoneBar
                        label="1,000 Posts"
                        current={metrics?.totalPosts || 0}
                        target={1000}
                        color="purple"
                    />
                    <MilestoneBar
                        label="5,000 Followers"
                        current={metrics?.followerCount || 0}
                        target={5000}
                        color="blue"
                    />
                    <MilestoneBar
                        label="10% Engagement Rate"
                        current={metrics?.engagementRate || 0}
                        target={10}
                        color="green"
                    />
                    <MilestoneBar
                        label="100 Impressions/Post"
                        current={metrics?.avgImpressionsPerPost || 0}
                        target={100}
                        color="orange"
                    />
                </CardContent>
            </Card>

            {/* Two Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Top Destinations */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <MapPin className="h-5 w-5" />
                            Top Performing Destinations
                        </CardTitle>
                        <CardDescription>Focus your content on these winners</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {destinations?.slice(0, 8).map((dest, idx) => (
                                <div key={dest.destination} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                                    <div className="flex items-center gap-3">
                                        <span className="text-lg font-bold text-primary">#{idx + 1}</span>
                                        <div>
                                            <p className="font-medium">{dest.destination}</p>
                                            <p className="text-sm text-muted-foreground">{dest.totalPosts} posts</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-bold">{dest.totalEngagements}</p>
                                        <p className="text-sm text-muted-foreground">{dest.avgEngagement.toFixed(1)} avg</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                {/* Pattern Insights */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Sparkles className="h-5 w-5" />
                            Winning Patterns
                        </CardTitle>
                        <CardDescription>What works best for engagement</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <InsightCard
                            icon="🎨"
                            title="Top Emoji"
                            value={patterns?.topEmoji.emoji || "N/A"}
                            metric={`${patterns?.topEmoji.avgEngagement.toFixed(1)} avg engagements`}
                        />
                        <InsightCard
                            icon="🔑"
                            title="Top Keyword"
                            value={patterns?.topKeyword.keyword || "N/A"}
                            metric={`${patterns?.topKeyword.avgEngagement.toFixed(1)} avg engagements`}
                        />
                        <InsightCard
                            icon="🌍"
                            title="Top Destination"
                            value={patterns?.topDestination.name || "N/A"}
                            metric={`${patterns?.topDestination.avgEngagement.toFixed(1)} avg engagements`}
                        />
                        <InsightCard
                            icon="⏰"
                            title="Best Posting Time"
                            value={`${patterns?.bestHour.hour}:00 CST`}
                            metric={`${patterns?.bestHour.avgEngagement.toFixed(1)} avg engagements`}
                        />
                        <InsightCard
                            icon="📏"
                            title="Optimal Length"
                            value={patterns?.bestLength.range || "N/A"}
                            metric={`${patterns?.bestLength.avgEngagement.toFixed(1)} avg engagements`}
                        />
                    </CardContent>
                </Card>
            </div>

            {/* Recommendations */}
            <Card>
                <CardHeader>
                    <CardTitle>💡 Recommendations</CardTitle>
                    <CardDescription>Action items to improve your growth</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {metrics && metrics.engagementRate < 8 && (
                            <RecommendationCard
                                icon="📈"
                                title="Boost Engagement"
                                description="Your engagement rate is below 8%. Test different content formats and posting times."
                                priority="medium"
                            />
                        )}
                        {metrics && metrics.avgImpressionsPerPost < 100 && (
                            <RecommendationCard
                                icon="📢"
                                title="Increase Reach"
                                description="Low impressions per post. Try posting at peak times or targeting larger accounts."
                                priority="high"
                            />
                        )}
                        {patterns && (
                            <RecommendationCard
                                icon="🌍"
                                title={`Focus on ${patterns.topDestination.name}`}
                                description={`This destination averages ${patterns.topDestination.avgEngagement.toFixed(1)} engagements. Create more content here!`}
                                priority="high"
                            />
                        )}
                        {metrics && metrics.totalPosts >= 1000 && (
                            <RecommendationCard
                                icon="💰"
                                title="Ready for Monetization"
                                description="You've hit 1,000 posts! Time to set up affiliate links and start earning."
                                priority="high"
                            />
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

function MetricCard({ title, value, icon, trend, color }: {
    title: string;
    value: string;
    icon: React.ReactNode;
    trend: "up" | "down" | null;
    color: "blue" | "purple" | "green" | "orange";
}) {
    const colorClasses = {
        blue: "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400",
        purple: "bg-purple-50 text-purple-600 dark:bg-purple-950 dark:text-purple-400",
        green: "bg-green-50 text-green-600 dark:bg-green-950 dark:text-green-400",
        orange: "bg-orange-50 text-orange-600 dark:bg-orange-950 dark:text-orange-400",
    };

    return (
        <Card>
            <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-muted-foreground">{title}</p>
                    <div className={`p-2 rounded-lg ${colorClasses[color]}`}>
                        {icon}
                    </div>
                </div>
                <div className="flex items-baseline gap-2">
                    <p className="text-2xl font-bold">{value}</p>
                    {trend && (
                        <span className={`text-sm ${trend === "up" ? "text-green-600" : "text-red-600"}`}>
                            {trend === "up" ? "↑" : "↓"}
                        </span>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

function MilestoneBar({ label, current, target, color }: {
    label: string;
    current: number;
    target: number;
    color: "blue" | "purple" | "green" | "orange";
}) {
    const progress = Math.min((current / target) * 100, 100);
    const status = progress >= 100 ? "✅" : progress >= 75 ? "🟡" : "⏳";

    const colorClasses = {
        blue: "bg-blue-500",
        purple: "bg-purple-500",
        green: "bg-green-500",
        orange: "bg-orange-500",
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium flex items-center gap-2">
                    <span>{status}</span>
                    {label}
                </span>
                <span className="text-sm text-muted-foreground">
                    {current.toFixed(0)}/{target} ({progress.toFixed(1)}%)
                </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
                <div
                    className={`h-2 rounded-full transition-all ${colorClasses[color]}`}
                    style={{ width: `${progress}%` }}
                />
            </div>
        </div>
    );
}

function InsightCard({ icon, title, value, metric }: {
    icon: string;
    title: string;
    value: string;
    metric: string;
}) {
    return (
        <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
            <span className="text-2xl">{icon}</span>
            <div className="flex-1">
                <p className="text-sm font-medium text-muted-foreground">{title}</p>
                <p className="font-semibold">{value}</p>
                <p className="text-sm text-muted-foreground">{metric}</p>
            </div>
        </div>
    );
}

function RecommendationCard({ icon, title, description, priority }: {
    icon: string;
    title: string;
    description: string;
    priority: "high" | "medium" | "low";
}) {
    const borderColors = {
        high: "border-l-red-500",
        medium: "border-l-yellow-500",
        low: "border-l-blue-500",
    };

    return (
        <div className={`border-l-4 p-4 bg-muted/30 rounded ${borderColors[priority]}`}>
            <div className="flex items-start gap-3">
                <span className="text-2xl">{icon}</span>
                <div>
                    <h4 className="font-semibold mb-1">{title}</h4>
                    <p className="text-sm text-muted-foreground">{description}</p>
                </div>
            </div>
        </div>
    );
}
