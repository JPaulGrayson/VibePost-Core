import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useEffect } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { PostcardDraft, ArenaVerdict } from "@shared/schema";
import { RefreshCw, Plane, Code2, Quote } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
    const { data: drafts, isLoading } = useQuery<PostcardDraft[]>({
        queryKey: ["/api/postcard-drafts"],
        refetchInterval: 30000 // Poll for new drafts every 30s
    });

    // Fetch current campaign state
    const { data: campaignData } = useQuery<CampaignResponse>({
        queryKey: ["/api/sniper/campaign"],
    });

    const { toast } = useToast();
    const [searchQuery, setSearchQuery] = useState("");
    const [activeCampaign, setActiveCampaign] = useState<string>("logicart"); // Default to LogicArt

    // Sync local state when campaign data loads from server (only on initial load)
    const [hasInitialized, setHasInitialized] = useState(false);
    useEffect(() => {
        if (campaignData?.currentCampaign && !hasInitialized) {
            // Map server campaign to UI campaign (quote_tweet is logicart with arena_referee strategy)
            if (campaignData.currentCampaign === 'logicart' && campaignData.activeStrategy === 'arena_referee') {
                setActiveCampaign('quote_tweet');
            } else {
                setActiveCampaign(campaignData.currentCampaign);
            }
            setHasInitialized(true);
        }
    }, [campaignData?.currentCampaign, campaignData?.activeStrategy, hasInitialized]);

    const filteredDrafts = drafts?.filter(draft => {
        // Filter by campaign type and strategy
        if (activeCampaign === 'quote_tweet') {
            // Show only arena_referee drafts (Quote Tweets)
            return draft.strategy === 'arena_referee' || draft.actionType === 'quote_tweet';
        }
        
        const campaignMatch = draft.campaignType === activeCampaign || 
            (!(draft.campaignType) && activeCampaign === 'turai'); // Legacy drafts default to turai
        
        if (!campaignMatch) return false;
        
        // For logicart, exclude arena_referee drafts (they show in Quote Tweet)
        if (activeCampaign === 'logicart' && (draft.strategy === 'arena_referee' || draft.actionType === 'quote_tweet')) {
            return false;
        }
        
        // Then filter by search query
        return draft.originalAuthorHandle.toLowerCase().includes(searchQuery.toLowerCase()) ||
            draft.originalTweetText.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (draft.detectedLocation && draft.detectedLocation.toLowerCase().includes(searchQuery.toLowerCase()));
    }).sort((a, b) => (b.score || 0) - (a.score || 0)); // Sort by Score DESC

    // Switch campaign mutation with optimistic updates
    const switchCampaign = useMutation({
        mutationFn: async (campaignType: string) => {
            // Quote Tweet uses logicart campaign + arena_referee strategy
            if (campaignType === 'quote_tweet') {
                // First switch to logicart, then switch strategy to arena_referee
                await apiRequest("POST", "/api/sniper/campaign", { campaignType: 'logicart' });
                const strategyRes = await apiRequest("POST", "/api/sniper/strategy", { strategy: 'arena_referee' });
                return { 
                    config: { emoji: '💬', name: 'Quote Tweet (Arena Referee)' },
                    isQuoteTweet: true,
                    ...(await strategyRes.json())
                };
            }
            const res = await apiRequest("POST", "/api/sniper/campaign", { campaignType });
            return res.json();
        },
        onMutate: async (campaignType: string) => {
            // Optimistically update local state immediately
            const previousCampaign = activeCampaign;
            setActiveCampaign(campaignType);
            return { previousCampaign };
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["/api/sniper/campaign"] });
            toast({
                title: `Campaign Switched! ${data.config.emoji}`,
                description: `Now hunting for ${data.config.name} leads.`,
            });
        },
        onError: (error, _variables, context) => {
            // Rollback on error
            if (context?.previousCampaign) {
                setActiveCampaign(context.previousCampaign);
            }
            toast({
                variant: "destructive",
                title: "Failed to switch campaign",
                description: String(error),
            });
        }
    });

    const manualHunt = useMutation({
        mutationFn: async () => {
            // Quote Tweet uses logicart campaign + arena_referee strategy
            if (activeCampaign === 'quote_tweet') {
                // Ensure we're on logicart with arena_referee before hunting
                await apiRequest("POST", "/api/sniper/campaign", { campaignType: 'logicart' });
                await apiRequest("POST", "/api/sniper/strategy", { strategy: 'arena_referee' });
            }
            // Send the actual backend campaign type
            const backendCampaign = activeCampaign === 'quote_tweet' ? 'logicart' : activeCampaign;
            const res = await apiRequest("POST", "/api/debug/hunt", { campaignType: backendCampaign });
            return res.json();
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["/api/postcard-drafts"] });
            const stats = data.result?.stats;
            const debug = data.debug;
            
            // Show strategy being used
            const strategyInfo = debug ? `[${debug.strategyName}]` : '';
            
            if (stats) {
                toast({
                    title: `Hunt Complete! ${strategyInfo}`,
                    description: `Searched ${stats.keywordsSearched} keywords, found ${stats.tweetsFound} tweets, created ${stats.draftsCreated} drafts, skipped ${stats.duplicatesSkipped} duplicates.`,
                });
            } else {
                toast({
                    title: `Hunt Complete! ${strategyInfo}`,
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

    // Switch LogicArt strategy mutation
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

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold mb-4">🧙‍♂️ Wizard's Tower (Lead Review Queue)</h1>

            {/* Campaign Selector */}
            <div className="mb-6 p-4 bg-card rounded-lg border">
                <div className="flex items-center gap-4">
                    <label className="text-sm font-medium text-muted-foreground whitespace-nowrap">Active Campaign</label>
                    <Select
                        value={activeCampaign}
                        onValueChange={(value) => switchCampaign.mutate(value)}
                        disabled={switchCampaign.isPending}
                    >
                        <SelectTrigger className="w-[280px]" data-testid="campaign-selector">
                            <SelectValue placeholder="Select campaign" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="turai" data-testid="campaign-turai">
                                <div className="flex items-center gap-2">
                                    <Plane className="h-4 w-4" />
                                    <span>✈️ Turai Travel</span>
                                    <Badge variant="secondary" className="ml-1 text-xs">
                                        {drafts?.filter(d => d.campaignType === 'turai' || !d.campaignType).length || 0}
                                    </Badge>
                                </div>
                            </SelectItem>
                            <SelectItem value="logicart" data-testid="campaign-logicart">
                                <div className="flex items-center gap-2">
                                    <Code2 className="h-4 w-4" />
                                    <span>🧠 LogicArt Replies</span>
                                    <Badge variant="secondary" className="ml-1 text-xs">
                                        {drafts?.filter(d => d.campaignType === 'logicart' && d.strategy !== 'arena_referee' && d.actionType !== 'quote_tweet').length || 0}
                                    </Badge>
                                </div>
                            </SelectItem>
                            <SelectItem value="quote_tweet" data-testid="campaign-quote-tweet">
                                <div className="flex items-center gap-2">
                                    <Quote className="h-4 w-4" />
                                    <span>💬 Quote Tweet (Arena)</span>
                                    <Badge variant="secondary" className="ml-1 text-xs">
                                        {drafts?.filter(d => d.strategy === 'arena_referee' || d.actionType === 'quote_tweet').length || 0}
                                    </Badge>
                                </div>
                            </SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                    {activeCampaign === 'turai' 
                        ? 'Hunting for travelers planning trips - promoting AI Tour Guide'
                        : activeCampaign === 'quote_tweet'
                        ? 'Finding AI debates, running through Arena, generating Quote Tweets with verdicts'
                        : 'Hunting for developers with coding questions - promoting AI Debug Arena'}
                </p>

                {/* Strategy Selector (LogicArt only - exclude arena_referee as it's a separate campaign) */}
                {activeCampaign === 'logicart' && campaignData?.availableStrategies && campaignData.availableStrategies.length > 0 && (
                    <div className="mt-4 pt-4 border-t">
                        <label className="text-sm font-medium text-muted-foreground mb-2 block">Active Strategy</label>
                        <div className="grid grid-cols-3 gap-2">
                            {campaignData.availableStrategies.filter(s => s.id !== 'arena_referee').map((strategy) => (
                                <Button
                                    key={strategy.id}
                                    variant={campaignData.activeStrategy === strategy.id ? "default" : "outline"}
                                    size="sm"
                                    className="flex flex-col items-start h-[72px] py-2 px-3 overflow-hidden"
                                    onClick={() => switchStrategy.mutate(strategy.id)}
                                    disabled={switchStrategy.isPending}
                                    data-testid={`strategy-${strategy.id}`}
                                    title={strategy.description}
                                >
                                    <span className="font-medium text-sm truncate w-full">{strategy.emoji} {strategy.name}</span>
                                    <span className="text-xs text-muted-foreground text-left w-full overflow-hidden" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{strategy.description}</span>
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
                            Manual Hunt ✈️
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
                {isLoading ? (
                    <div className="text-center py-8 text-muted-foreground">
                        <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                        <p>Loading queue...</p>
                    </div>
                ) : filteredDrafts?.length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground">No drafts found matching your search.</p>
                ) : (
                    filteredDrafts?.map((draft) => (
                        <DraftCard key={draft.id} draft={draft} campaignType={activeCampaign} />
                    ))
                )}
            </div>
        </div>
    );
}

function DraftCard({ draft, campaignType = 'turai' }: { draft: PostcardDraft; campaignType?: string }) {
    const [text, setText] = useState(draft.draftReplyText || "");
    const score = draft.score || 0;
    const { toast } = useToast();
    
    // Check if this is a Quote Tweet draft (Arena Referee)
    const isQuoteTweet = draft.actionType === 'quote_tweet';
    const arenaVerdict = draft.arenaVerdict as ArenaVerdict | null;

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
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/postcard-drafts"] });
            toast({
                title: "Image Regenerated! 🎨",
                description: "New image generated for this draft.",
            });
        },
        onError: (error) => {
            console.error("Failed to regenerate image:", error);
            toast({
                variant: "destructive",
                title: "Image Regeneration Failed",
                description: "Check console for details.",
            });
        }
    });

    return (
        <Card>
            <CardContent className="pt-6 grid md:grid-cols-2 gap-4">
                {/* Left: Context */}
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
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

                    {/* Arena Referee Verdict Display */}
                    {isQuoteTweet && arenaVerdict && (
                        <div className="mb-3 p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-lg">🏛️</span>
                                <span className="font-bold text-purple-400">Arena Referee Verdict</span>
                                <Badge className="bg-purple-600 text-white">Quote Tweet</Badge>
                            </div>
                            <p className="text-sm">
                                <span className="font-medium">🏆 Winner:</span> {arenaVerdict.winner || 'Pending'}
                            </p>
                            {arenaVerdict.reasoning && (
                                <p className="text-xs text-muted-foreground mt-1 italic">
                                    "{arenaVerdict.reasoning.substring(0, 150)}..."
                                </p>
                            )}
                        </div>
                    )}

                    <label className="text-xs font-bold">{isQuoteTweet ? "Quote Tweet Text:" : "Draft Reply:"}</label>
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
                {isQuoteTweet ? (
                    <Button 
                        onClick={() => {
                            // Open Twitter Quote Tweet intent with pre-filled text
                            const originalUrl = `https://twitter.com/${draft.originalAuthorHandle}/status/${draft.originalTweetId}`;
                            const encodedText = encodeURIComponent(text);
                            const encodedUrl = encodeURIComponent(originalUrl);
                            window.open(`https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`, '_blank');
                            toast({
                                title: "Quote Tweet Window Opened! 🏛️",
                                description: "Paste your verdict and hit Tweet when ready.",
                            });
                        }}
                        className="bg-purple-600 hover:bg-purple-700"
                        data-testid="btn-quote-tweet"
                    >
                        Quote Tweet 🏛️
                    </Button>
                ) : (
                    <Button onClick={() => approve.mutate()} disabled={approve.isPending}>
                        {approve.isPending ? "Publishing..." : "Approve & Send 🚀"}
                    </Button>
                )}
            </CardFooter>
        </Card>
    );
}
