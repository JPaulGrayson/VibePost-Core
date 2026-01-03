import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { PostcardDraft, PostComment } from "@shared/schema";
import { RefreshCw, Plane, Code2, MessageCircle, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface CampaignConfig {
    id: string;
    name: string;
    emoji: string;
    description: string;
}

interface StrategyConfig {
    id: string;
    name: string;
    emoji: string;
    description: string;
    keywords: string[];
    replyPersona: {
        tone: string;
        hook: string;
        templateExample: string;
    };
}

interface CampaignResponse {
    currentCampaign: string;
    config: CampaignConfig;
    activeStrategy: string | null;
    strategyConfig: StrategyConfig | null;
    availableStrategies: StrategyConfig[];
}

export default function SniperQueue() {
    const [queueEnabled, setQueueEnabled] = useState(false);
    const [viewMode, setViewMode] = useState<"pending" | "published">("pending");
    const [publishedDateFilter, setPublishedDateFilter] = useState<"today" | "7days" | "30days">("today");
    const [publishedCampaignFilter, setPublishedCampaignFilter] = useState<"all" | "turai" | "logigo">("all");
    
    const { data: drafts, isLoading, refetch: refetchDrafts } = useQuery<PostcardDraft[]>({
        queryKey: ["/api/postcard-drafts"],
        enabled: queueEnabled, // Only fetch when user enables it
        refetchInterval: queueEnabled ? 30000 : false // Poll only when enabled
    });

    // Fetch published drafts for the Published tab with filters
    const { data: publishedDrafts, isLoading: isLoadingPublished } = useQuery<PostcardDraft[]>({
        queryKey: ["/api/postcard-drafts/published", publishedDateFilter, publishedCampaignFilter],
        queryFn: async () => {
            const params = new URLSearchParams();
            params.set("days", publishedDateFilter === "today" ? "1" : publishedDateFilter === "7days" ? "7" : "30");
            if (publishedCampaignFilter !== "all") params.set("campaign", publishedCampaignFilter);
            const res = await fetch(`/api/postcard-drafts/published?${params}`);
            if (!res.ok) throw new Error("Failed to fetch");
            return res.json();
        },
        enabled: viewMode === "published",
    });

    // Fetch current campaign state
    const { data: campaignData } = useQuery<CampaignResponse>({
        queryKey: ["/api/sniper/campaign"],
    });

    const { toast } = useToast();
    const [searchQuery, setSearchQuery] = useState("");
    const [campaignFilter, setCampaignFilter] = useState<"all" | "turai" | "logigo">("all");
    
    // Derive state from server data - don't initialize with defaults that may conflict
    const activeCampaign = campaignData?.currentCampaign || "turai";
    const activeStrategy = campaignData?.activeStrategy || "vibe_scout";

    const filteredDrafts = drafts?.filter(draft => {
        // Campaign filter
        if (campaignFilter !== "all") {
            const draftCampaign = (draft as any).campaignType || "turai";
            if (draftCampaign !== campaignFilter) return false;
        }
        // Text search filter
        return draft.originalAuthorHandle.toLowerCase().includes(searchQuery.toLowerCase()) ||
            draft.originalTweetText.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (draft.detectedLocation && draft.detectedLocation.toLowerCase().includes(searchQuery.toLowerCase()));
    }).sort((a, b) => (b.score || 0) - (a.score || 0)); // Sort by Score DESC
    
    // Count drafts by campaign type
    const turaiCount = drafts?.filter(d => ((d as any).campaignType || "turai") === "turai").length || 0;
    const logigoCount = drafts?.filter(d => (d as any).campaignType === "logigo").length || 0;

    // Switch campaign mutation
    const switchCampaign = useMutation({
        mutationFn: async (campaignType: string) => {
            const res = await apiRequest("POST", "/api/sniper/campaign", { campaignType });
            return res.json();
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["/api/sniper/campaign"] });
            toast({
                title: `Campaign Switched! ${data.config.emoji}`,
                description: `Now hunting for ${data.config.name} leads.`,
            });
        },
        onError: (error) => {
            toast({
                variant: "destructive",
                title: "Failed to switch campaign",
                description: String(error),
            });
        }
    });

    // Switch LogiGo strategy mutation
    const switchStrategy = useMutation({
        mutationFn: async (strategy: string) => {
            const res = await apiRequest("POST", "/api/sniper/strategy", { strategy });
            return res.json();
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["/api/sniper/campaign"] });
            toast({
                title: `Strategy Changed! ${data.strategyConfig.emoji}`,
                description: data.strategyConfig.description,
            });
        },
        onError: (error) => {
            toast({
                variant: "destructive",
                title: "Failed to switch strategy",
                description: String(error),
            });
        }
    });

    const manualHunt = useMutation({
        mutationFn: async () => {
            const res = await apiRequest("POST", "/api/debug/hunt", { campaignType: activeCampaign });
            return res.json();
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["/api/postcard-drafts"] });
            const stats = data.result?.stats;
            if (stats) {
                toast({
                    title: `Hunt Complete! ${activeCampaign === 'logigo' ? '🧠' : '🧙‍♂️'}`,
                    description: `Found ${stats.tweetsFound} tweets, created ${stats.draftsCreated} new drafts.`,
                });
            } else {
                toast({
                    title: "Hunt Complete!",
                    description: `Generated ${data.result?.draftsGenerated || 0} new drafts.`,
                });
            }
        },
        onError: (error) => {
            console.error("Hunt failed:", error);
            toast({
                variant: "destructive",
                title: "Hunt Failed",
                description: "Check console for details.",
            });
        }
    });

    const wipeDb = useMutation({
        mutationFn: async () => {
            const res = await apiRequest("POST", "/api/debug/wipe");
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/postcard-drafts"] });
            toast({
                title: "Database Wiped",
                description: "All drafts have been removed.",
            });
        },
        onError: (error) => {
            console.error("Wipe failed:", error);
            toast({
                variant: "destructive",
                title: "Wipe Failed",
                description: "Failed to wipe database.",
            });
        }
    });

    if (isLoading) return <div>Loading Queue...</div>;

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold mb-4">🧙‍♂️ Wizard's Tower (Lead Review Queue)</h1>

            {/* Campaign Selector Tabs */}
            <div className="mb-6 p-4 bg-card rounded-lg border">
                <label className="text-sm font-medium text-muted-foreground mb-2 block">Active Campaign</label>
                <Tabs
                    value={activeCampaign}
                    onValueChange={(value) => switchCampaign.mutate(value)}
                    className="w-full"
                >
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="turai" className="flex items-center gap-2" disabled={switchCampaign.isPending}>
                            <Plane className="h-4 w-4" />
                            <span>✈️ Turai Travel</span>
                        </TabsTrigger>
                        <TabsTrigger value="logigo" className="flex items-center gap-2" disabled={switchCampaign.isPending}>
                            <Code2 className="h-4 w-4" />
                            <span>🧠 LogiGo Vibe Coding</span>
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
                <p className="text-xs text-muted-foreground mt-2">
                    {activeCampaign === 'turai'
                        ? "Hunting for travelers planning trips - promoting AI Tour Guide"
                        : "Hunting for developers struggling with code - promoting code visualization"
                    }
                </p>

                {/* Strategy Selector (LogiGo only) */}
                {activeCampaign === 'logigo' && campaignData?.availableStrategies && (
                    <div className="mt-4 pt-4 border-t">
                        <label className="text-sm font-medium text-muted-foreground mb-2 block">Active Strategy</label>
                        <div className="grid grid-cols-3 gap-2">
                            {campaignData.availableStrategies.map((strategy) => (
                                <Button
                                    key={strategy.id}
                                    variant={activeStrategy === strategy.id ? "default" : "outline"}
                                    size="sm"
                                    className="flex flex-col items-start h-auto py-2 px-3"
                                    onClick={() => switchStrategy.mutate(strategy.id)}
                                    disabled={switchStrategy.isPending}
                                    data-testid={`strategy-${strategy.id}`}
                                >
                                    <span className="font-medium">{strategy.emoji} {strategy.name}</span>
                                    <span className="text-xs text-muted-foreground text-left line-clamp-2">{strategy.description}</span>
                                </Button>
                            ))}
                        </div>
                        {campaignData.strategyConfig && (
                            <div className="mt-3 p-3 bg-muted/50 rounded-lg">
                                <p className="text-xs font-medium mb-1">Reply Hook:</p>
                                <p className="text-xs text-muted-foreground italic">"{campaignData.strategyConfig.replyPersona.hook}"</p>
                                <p className="text-xs font-medium mt-2 mb-1">Example Reply:</p>
                                <p className="text-xs text-muted-foreground italic">"{campaignData.strategyConfig.replyPersona.templateExample}"</p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* View Mode Toggle */}
            <div className="mb-6 flex gap-2">
                <Button
                    variant={viewMode === "pending" ? "default" : "outline"}
                    onClick={() => setViewMode("pending")}
                    data-testid="view-pending"
                >
                    📋 Pending Queue
                </Button>
                <Button
                    variant={viewMode === "published" ? "default" : "outline"}
                    onClick={() => setViewMode("published")}
                    data-testid="view-published"
                >
                    <MessageCircle className="mr-2 h-4 w-4" />
                    Published & Comments
                </Button>
            </div>

            {/* Queue Filter - Only show in pending view */}
            {viewMode === "pending" && queueEnabled && (
                <div className="mb-4 flex gap-2 items-center">
                    <span className="text-sm text-muted-foreground mr-2">Filter:</span>
                    <Button
                        variant={campaignFilter === "all" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setCampaignFilter("all")}
                    >
                        All ({turaiCount + logigoCount})
                    </Button>
                    <Button
                        variant={campaignFilter === "turai" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setCampaignFilter("turai")}
                        className={campaignFilter === "turai" ? "" : "border-blue-500/50 text-blue-400"}
                    >
                        ✈️ Turai ({turaiCount})
                    </Button>
                    <Button
                        variant={campaignFilter === "logigo" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setCampaignFilter("logigo")}
                        className={campaignFilter === "logigo" ? "" : "border-purple-500/50 text-purple-400"}
                    >
                        🧠 LogiGo ({logigoCount})
                    </Button>
                </div>
            )}

            {/* Pending Queue View */}
            {viewMode === "pending" && (
                <>
                    <div className="mb-6 flex gap-4">
                        <Input
                            placeholder="Search by username, text, or location..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="max-w-md"
                        />
                        <Button
                            variant="outline"
                            onClick={() => manualHunt.mutate()}
                            disabled={manualHunt.isPending}
                        >
                            {manualHunt.isPending ? (
                                <>
                                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                                    Hunting...
                                </>
                            ) : (
                                <>
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    Manual Hunt ({activeCampaign === 'logigo' ? '🧠' : '✈️'})
                                </>
                            )}
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() => {
                                if (confirm("Are you sure you want to wipe ALL drafts? This cannot be undone.")) {
                                    wipeDb.mutate();
                                }
                            }}
                            disabled={wipeDb.isPending}
                        >
                            {wipeDb.isPending ? "Wiping..." : "Wipe DB"}
                        </Button>
                    </div>

                    <div className="grid gap-6">
                        {!queueEnabled ? (
                            <div className="text-center py-12 border border-dashed rounded-lg">
                                <p className="text-muted-foreground mb-4">Queue not loaded. Click below to load drafts.</p>
                                <Button 
                                    onClick={() => setQueueEnabled(true)}
                                    data-testid="load-queue-btn"
                                >
                                    Load Queue
                                </Button>
                            </div>
                        ) : isLoading ? (
                            <div className="text-center py-12">
                                <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
                                <p className="text-muted-foreground">Loading drafts...</p>
                            </div>
                        ) : (
                            <>
                                {filteredDrafts?.map((draft) => (
                                    <DraftCard key={draft.id} draft={draft} />
                                ))}
                                {filteredDrafts?.length === 0 && <p>No drafts found matching your search.</p>}
                            </>
                        )}
                    </div>
                </>
            )}

            {/* Published View with Comments */}
            {viewMode === "published" && (
                <div className="space-y-6">
                    {/* Filters for Published View */}
                    <div className="flex flex-wrap gap-4 items-center">
                        <div className="flex gap-2 items-center">
                            <span className="text-sm text-muted-foreground">Date:</span>
                            <Button
                                variant={publishedDateFilter === "today" ? "default" : "outline"}
                                size="sm"
                                onClick={() => setPublishedDateFilter("today")}
                                data-testid="filter-today"
                            >
                                Today
                            </Button>
                            <Button
                                variant={publishedDateFilter === "7days" ? "default" : "outline"}
                                size="sm"
                                onClick={() => setPublishedDateFilter("7days")}
                                data-testid="filter-7days"
                            >
                                Last 7 Days
                            </Button>
                            <Button
                                variant={publishedDateFilter === "30days" ? "default" : "outline"}
                                size="sm"
                                onClick={() => setPublishedDateFilter("30days")}
                                data-testid="filter-30days"
                            >
                                Last 30 Days
                            </Button>
                        </div>
                        <div className="flex gap-2 items-center">
                            <span className="text-sm text-muted-foreground">Campaign:</span>
                            <Button
                                variant={publishedCampaignFilter === "all" ? "default" : "outline"}
                                size="sm"
                                onClick={() => setPublishedCampaignFilter("all")}
                            >
                                All
                            </Button>
                            <Button
                                variant={publishedCampaignFilter === "turai" ? "default" : "outline"}
                                size="sm"
                                onClick={() => setPublishedCampaignFilter("turai")}
                                className={publishedCampaignFilter === "turai" ? "" : "border-blue-500/50 text-blue-400"}
                            >
                                ✈️ Turai
                            </Button>
                            <Button
                                variant={publishedCampaignFilter === "logigo" ? "default" : "outline"}
                                size="sm"
                                onClick={() => setPublishedCampaignFilter("logigo")}
                                className={publishedCampaignFilter === "logigo" ? "" : "border-purple-500/50 text-purple-400"}
                            >
                                🧠 LogiGo
                            </Button>
                        </div>
                    </div>
                    
                    <div className="grid gap-6">
                    {isLoadingPublished ? (
                        <div className="text-center py-12">
                            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
                            <p className="text-muted-foreground">Loading published posts...</p>
                        </div>
                    ) : publishedDrafts?.length === 0 ? (
                        <Card>
                            <CardContent className="p-8 text-center">
                                <MessageCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                                <h3 className="text-lg font-medium mb-2">No Published Posts Yet</h3>
                                <p className="text-muted-foreground">Posts you approve will appear here with their comments.</p>
                            </CardContent>
                        </Card>
                    ) : (
                        publishedDrafts?.map((draft) => (
                            <PublishedDraftCard key={draft.id} draft={draft} />
                        ))
                    )}
                    </div>
                </div>
            )}
        </div>
    );
}

function DraftCard({ draft }: { draft: PostcardDraft }) {
    const [text, setText] = useState(draft.draftReplyText || "");
    const score = draft.score || 0;
    const { toast } = useToast();
    
    // Get campaign type from draft (default to turai for old drafts)
    const campaignType = (draft as any).campaignType || "turai";
    const isLogigo = campaignType === "logigo";

    // Score Color Logic
    let scoreColor = "bg-gray-500";
    if (score >= 90) scoreColor = "bg-green-500";
    else if (score >= 70) scoreColor = "bg-yellow-500";

    const approve = useMutation({
        mutationFn: async () => {
            await apiRequest("POST", `/api/postcard-drafts/${draft.id}/approve`, { text });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/postcard-drafts"] });
            toast({
                title: "Published! 🚀",
                description: `Reply sent to @${draft.originalAuthorHandle}`,
            });
        },
        onError: (error) => {
            console.error("Failed to publish:", error);
            toast({
                variant: "destructive",
                title: "Publish Failed",
                description: "Check console for details.",
            });
        }
    });

    const reject = useMutation({
        mutationFn: async () => {
            await apiRequest("POST", `/api/postcard-drafts/${draft.id}/reject`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/postcard-drafts"] });
            toast({
                title: "Rejected",
                description: "Draft removed from queue.",
            });
        }
    });

    const regenerateImage = useMutation({
        mutationFn: async () => {
            await apiRequest("POST", `/api/postcard-drafts/${draft.id}/regenerate-image`);
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/postcard-drafts"] })
    });

    // Campaign-specific styling
    const cardBorderClass = isLogigo 
        ? "border-l-4 border-l-purple-500" 
        : "border-l-4 border-l-blue-500";
    const campaignBadge = isLogigo 
        ? { emoji: "🧠", label: "LogiGo", className: "bg-purple-500/20 text-purple-400 border-purple-500/50" }
        : { emoji: "✈️", label: "Turai", className: "bg-blue-500/20 text-blue-400 border-blue-500/50" };

    return (
        <Card className={cardBorderClass}>
            <CardContent className="pt-6 grid md:grid-cols-2 gap-4">
                {/* Left: Context */}
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <Badge variant="outline" className={campaignBadge.className}>
                                {campaignBadge.emoji} {campaignBadge.label}
                            </Badge>
                            <Badge variant="outline">@{draft.originalAuthorHandle}</Badge>
                            <Badge className={`${scoreColor} text-white hover:${scoreColor}`}>
                                Score: {score}
                            </Badge>
                        </div>
                        <a
                            href={`https://twitter.com/${draft.originalAuthorHandle}/status/${draft.originalTweetId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-500 hover:underline"
                        >
                            View Tweet ↗
                        </a>
                    </div>
                    <p className="text-sm text-muted-foreground mb-4 border-l-2 pl-2">"{draft.originalTweetText}"</p>

                    <label className="text-xs font-bold">Draft Reply:</label>
                    <Textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        className="mt-1"
                    />
                </div>

                {/* Right: The Asset */}
                <div>
                    <div className="relative group">
                        <img
                            src={draft.turaiImageUrl || "https://placehold.co/800x600?text=Generating+Image..."}
                            alt="Generated Postcard"
                            className="rounded-md border shadow-sm w-full h-auto object-cover"
                            onError={(e) => {
                                e.currentTarget.src = "https://placehold.co/800x600?text=Image+Load+Error";
                            }}
                        />
                        <Button
                            size="icon"
                            variant="secondary"
                            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => regenerateImage.mutate()}
                            disabled={regenerateImage.isPending}
                            title="Regenerate Image"
                        >
                            <RefreshCw className={`h-4 w-4 ${regenerateImage.isPending ? 'animate-spin' : ''}`} />
                        </Button>
                    </div>
                    {draft.imageAttribution && (
                        <p className="text-xs text-muted-foreground mt-1 text-right">
                            📸 {draft.imageAttribution}
                        </p>
                    )}
                </div>
            </CardContent>

            <CardFooter className="flex justify-end gap-2 bg-muted/50 p-4">
                <Button variant="ghost" onClick={() => reject.mutate()} disabled={reject.isPending}>
                    Reject
                </Button>
                <Button onClick={() => approve.mutate()} disabled={approve.isPending}>
                    {approve.isPending ? "Publishing..." : "Approve & Send 🚀"}
                </Button>
            </CardFooter>
        </Card>
    );
}

// Published draft card with comments display
function PublishedDraftCard({ draft }: { draft: PostcardDraft }) {
    const { toast } = useToast();
    
    // Fetch comments for this draft
    const { data: comments = [], isLoading: isLoadingComments, refetch: refetchComments } = useQuery<PostComment[]>({
        queryKey: ["/api/postcard-drafts", draft.id, "comments"],
        queryFn: async () => {
            const res = await fetch(`/api/postcard-drafts/${draft.id}/comments`);
            if (!res.ok) throw new Error("Failed to fetch comments");
            return res.json();
        }
    });

    // Mutation to fetch fresh replies from Twitter
    const fetchReplies = useMutation({
        mutationFn: async () => {
            const res = await fetch(`/api/postcard-drafts/${draft.id}/fetch-replies`);
            if (!res.ok) throw new Error("Failed to fetch replies");
            return res.json();
        },
        onSuccess: (data) => {
            refetchComments();
            toast({
                title: "Comments Updated",
                description: `Found ${data.count} replies on Twitter.`,
            });
        },
        onError: () => {
            toast({
                variant: "destructive",
                title: "Failed to fetch replies",
                description: "Check the console for details.",
            });
        }
    });

    const campaignType = (draft as any).campaignType || "turai";
    const isLogigo = campaignType === "logigo";
    const cardBorderClass = isLogigo ? "border-l-4 border-l-purple-500" : "border-l-4 border-l-blue-500";
    const campaignBadge = isLogigo 
        ? { emoji: "🧠", label: "LogiGo", className: "bg-purple-500/20 text-purple-400 border-purple-500/50" }
        : { emoji: "✈️", label: "Turai", className: "bg-blue-500/20 text-blue-400 border-blue-500/50" };

    return (
        <Card className={cardBorderClass}>
            <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Badge variant="outline" className={campaignBadge.className}>
                            {campaignBadge.emoji} {campaignBadge.label}
                        </Badge>
                        <Badge variant="secondary">Published</Badge>
                        <Badge variant="outline">@{draft.originalAuthorHandle}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                        <a
                            href={`https://twitter.com/${draft.originalAuthorHandle}/status/${draft.originalTweetId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-500 hover:underline flex items-center gap-1"
                        >
                            <ExternalLink className="h-3 w-3" />
                            View on X
                        </a>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => fetchReplies.mutate()}
                            disabled={fetchReplies.isPending}
                        >
                            {fetchReplies.isPending ? (
                                <RefreshCw className="h-4 w-4 animate-spin" />
                            ) : (
                                <>
                                    <RefreshCw className="h-4 w-4 mr-1" />
                                    Fetch Comments
                                </>
                            )}
                        </Button>
                    </div>
                </div>
                {draft.publishedAt && (
                    <p className="text-xs text-muted-foreground">
                        Published {format(new Date(draft.publishedAt), "MMM d, yyyy 'at' h:mm a")}
                    </p>
                )}
            </CardHeader>
            <CardContent>
                <p className="text-sm text-muted-foreground mb-4 border-l-2 pl-2">
                    Original: "{draft.originalTweetText}"
                </p>
                <p className="text-sm mb-4">
                    <strong>Our Reply:</strong> {draft.draftReplyText}
                </p>

                {/* Comments Section */}
                <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value="comments">
                        <AccordionTrigger className="text-sm">
                            <div className="flex items-center gap-2">
                                <MessageCircle className="h-4 w-4" />
                                Comments ({comments.length})
                            </div>
                        </AccordionTrigger>
                        <AccordionContent>
                            {isLoadingComments ? (
                                <p className="text-sm text-muted-foreground">Loading comments...</p>
                            ) : comments.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    No comments found yet. Click "Fetch Comments" to check for new replies.
                                </p>
                            ) : (
                                <div className="space-y-3">
                                    {comments.map((comment) => (
                                        <div key={comment.id} className="p-3 bg-muted/50 rounded-lg">
                                            <div className="flex items-center justify-between mb-1">
                                                <a
                                                    href={`https://twitter.com/${comment.authorHandle}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-sm font-medium text-blue-500 hover:underline"
                                                >
                                                    @{comment.authorHandle}
                                                </a>
                                                {comment.metrics && (
                                                    <div className="flex gap-2 text-xs text-muted-foreground">
                                                        <span>❤️ {comment.metrics.likes || 0}</span>
                                                        <span>💬 {comment.metrics.replies || 0}</span>
                                                    </div>
                                                )}
                                            </div>
                                            <p className="text-sm">{comment.content}</p>
                                            {comment.createdAt && (
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    {format(new Date(comment.createdAt), "MMM d, h:mm a")}
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
            </CardContent>
        </Card>
    );
}
