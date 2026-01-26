import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useState, useEffect } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { PostcardDraft, ArenaVerdict } from "@shared/schema";
import { RefreshCw, Plane, Code2, Quote, Eye, Star, ExternalLink, Send, Trash2, Upload, Video } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
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

    // Top 10 query - separate from main drafts
    const { data: topDrafts, isLoading: isLoadingTop, refetch: refetchTop } = useQuery<PostcardDraft[]>({
        queryKey: ["/api/postcard-drafts/top"],
        refetchOnWindowFocus: true,
    });

    const { toast } = useToast();
    const [searchQuery, setSearchQuery] = useState("");
    const [activeCampaign, setActiveCampaign] = useState<string>("logicart"); // Default to LogicArt
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set()); // For Top 10 batch selection
    const [isUploadingVideo, setIsUploadingVideo] = useState(false);

    // Fetch current quack launch video path
    const { data: quackMediaData } = useQuery<{ mediaPath: string }>({
        queryKey: ["/api/sniper/quack-launch/media"],
        enabled: activeCampaign === 'quack_launch',
    });

    // Sync local state when campaign data loads from server (only on initial load)
    // Skip sync if user is on top_10 tab - that's a local-only view
    const [hasInitialized, setHasInitialized] = useState(false);
    useEffect(() => {
        if (campaignData?.currentCampaign && !hasInitialized) {
            // Map server campaign to UI campaign
            // Arena Referee and Code Flowchart are separate tabs now
            if (campaignData.currentCampaign === 'logicart' && campaignData.activeStrategy === 'arena_referee') {
                setActiveCampaign('arena_referee');
            } else if (campaignData.currentCampaign === 'logicart' && campaignData.activeStrategy === 'code_flowchart') {
                setActiveCampaign('code_flowchart');
            } else if (campaignData.currentCampaign === 'logicart' && campaignData.activeStrategy === 'quack_launch') {
                setActiveCampaign('quack_launch');
            } else {
                setActiveCampaign(campaignData.currentCampaign);
            }
            setHasInitialized(true);
        }
    }, [campaignData?.currentCampaign, campaignData?.activeStrategy, hasInitialized]);
    
    // Preserve active tab in session storage so refresh doesn't lose it
    useEffect(() => {
        const savedTab = sessionStorage.getItem('sniperActiveTab');
        if (savedTab && !hasInitialized) {
            setActiveCampaign(savedTab);
            setHasInitialized(true);
        }
    }, []);
    
    useEffect(() => {
        if (hasInitialized) {
            sessionStorage.setItem('sniperActiveTab', activeCampaign);
        }
    }, [activeCampaign, hasInitialized]);

    const filteredDrafts = drafts?.filter(draft => {
        // Helper: check if draft matches search query
        const matchesSearch = !searchQuery || 
            draft.originalAuthorHandle.toLowerCase().includes(searchQuery.toLowerCase()) ||
            draft.originalTweetText.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (draft.detectedLocation && draft.detectedLocation.toLowerCase().includes(searchQuery.toLowerCase()));
        
        // Arena Referee tab - show only arena_referee drafts
        if (activeCampaign === 'arena_referee') {
            const isArena = draft.strategy === 'arena_referee' || (draft.actionType === 'quote_tweet' && draft.arenaVerdict);
            return isArena && matchesSearch;
        }
        
        // Code Flowchart tab - show only code_flowchart drafts  
        if (activeCampaign === 'code_flowchart') {
            const isFlowchart = draft.strategy === 'code_flowchart';
            return isFlowchart && matchesSearch;
        }
        
        // Quack Launch tab - show only quack_launch drafts
        if (activeCampaign === 'quack_launch') {
            const isQuackLaunch = draft.strategy === 'quack_launch';
            return isQuackLaunch && matchesSearch;
        }
        
        const campaignMatch = draft.campaignType === activeCampaign || 
            (!(draft.campaignType) && activeCampaign === 'turai'); // Legacy drafts default to turai
        
        if (!campaignMatch) return false;
        
        // For logicart, exclude Quote Tweet strategies (they have their own tabs)
        if (activeCampaign === 'logicart' && (['arena_referee', 'code_flowchart', 'quack_launch'].includes(draft.strategy || '') || draft.actionType === 'quote_tweet')) {
            return false;
        }
        
        return matchesSearch;
    }).sort((a, b) => (b.score || 0) - (a.score || 0)); // Sort by Score DESC

    // Switch campaign mutation with optimistic updates
    const switchCampaign = useMutation({
        mutationFn: async (campaignType: string) => {
            // Arena Referee and Code Flowchart use logicart campaign + specific strategy
            if (campaignType === 'arena_referee' || campaignType === 'code_flowchart' || campaignType === 'quack_launch') {
                await apiRequest("POST", "/api/sniper/campaign", { campaignType: 'logicart' });
                const strategyRes = await apiRequest("POST", "/api/sniper/strategy", { strategy: campaignType });
                const strategyName = campaignType === 'arena_referee' ? 'Arena Referee' : 
                    campaignType === 'code_flowchart' ? 'Code Flowchart' : 'Quack Launch';
                const emoji = campaignType === 'arena_referee' ? '🏛️' : 
                    campaignType === 'code_flowchart' ? '📊' : '🚀';
                return { 
                    config: { emoji, name: strategyName },
                    isQuoteTweet: true,
                    ...(await strategyRes.json())
                };
            }
            const res = await apiRequest("POST", "/api/sniper/campaign", { campaignType });
            return res.json();
        },
        onMutate: async (campaignType: string) => {
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
            // Arena Referee and Code Flowchart use logicart campaign + specific strategy
            if (activeCampaign === 'arena_referee' || activeCampaign === 'code_flowchart' || activeCampaign === 'quack_launch') {
                await apiRequest("POST", "/api/sniper/campaign", { campaignType: 'logicart' });
                await apiRequest("POST", "/api/sniper/strategy", { strategy: activeCampaign });
            }
            // Send the actual backend campaign type
            const backendCampaign = (activeCampaign === 'arena_referee' || activeCampaign === 'code_flowchart' || activeCampaign === 'quack_launch') ? 'logicart' : activeCampaign;
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

    // Launch the main announcement thread
    const launchThread = useMutation({
        mutationFn: async () => {
            const res = await apiRequest("POST", "/api/launch-thread");
            return res.json();
        },
        onSuccess: (data) => {
            toast({
                title: "🚀 Thread Launched!",
                description: `Posted ${data.tweetIds?.length || 6} tweets. View: ${data.threadUrl}`,
            });
        },
        onError: (error) => {
            console.error("Launch failed:", error);
            toast({
                variant: "destructive",
                title: "Launch Failed",
                description: String(error),
            });
        }
    });

    // Hunt ALL strategies at once
    const huntAll = useMutation({
        mutationFn: async () => {
            const res = await apiRequest("POST", "/api/debug/hunt-all", {});
            return res.json();
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["/api/postcard-drafts"] });
            const result = data.result;
            
            toast({
                title: "Hunt All Complete!",
                description: `Created ${result?.draftsGenerated || 0} drafts across all strategies.`,
            });
        },
        onError: (error) => {
            console.error("Hunt all failed:", error);
            toast({
                variant: "destructive",
                title: "Hunt All Failed",
                description: "Check console for details.",
            });
        }
    });

    // Bulk approve selected drafts
    const bulkApprove = useMutation({
        mutationFn: async (ids: number[]) => {
            const res = await apiRequest("POST", "/api/postcard-drafts/bulk-approve", { ids });
            return res.json();
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["/api/postcard-drafts"] });
            queryClient.invalidateQueries({ queryKey: ["/api/postcard-drafts/top"] });
            queryClient.invalidateQueries({ queryKey: ["/api/posts"] }); // Refresh Recent Posts & Post History
            setSelectedIds(new Set()); // Clear selection
            toast({
                title: `Sent! 🚀`,
                description: `Published ${data.successCount} drafts${data.failCount > 0 ? `, ${data.failCount} failed` : ''}.`,
            });
        },
        onError: (error) => {
            console.error("Bulk approve failed:", error);
            toast({
                variant: "destructive",
                title: "Send Failed",
                description: "Failed to send selected drafts.",
            });
        }
    });

    // Delete a draft (reject it from the queue)
    const deleteDraft = useMutation({
        mutationFn: async (id: number) => {
            const res = await apiRequest("POST", `/api/postcard-drafts/${id}/reject`);
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["/api/postcard-drafts"] });
            queryClient.invalidateQueries({ queryKey: ["/api/postcard-drafts/top"] });
            toast({
                title: "Draft Deleted",
                description: "Draft removed from the queue.",
            });
        },
        onError: (error) => {
            console.error("Delete failed:", error);
            toast({
                variant: "destructive",
                title: "Delete Failed",
                description: "Failed to delete draft.",
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

            {/* Campaign Selector - Separate tabs for each queue */}
            <div className="mb-6 p-4 bg-card rounded-lg border">
                <label className="text-sm font-medium text-muted-foreground mb-3 block">Active Queue</label>
                <div className="grid grid-cols-5 gap-2">
                    {/* Turai Travel */}
                    <Button
                        variant={activeCampaign === 'turai' ? "default" : "outline"}
                        size="sm"
                        className="flex flex-col items-center h-[64px] py-2 px-2"
                        onClick={() => switchCampaign.mutate('turai')}
                        disabled={switchCampaign.isPending}
                        data-testid="campaign-turai"
                    >
                        <Plane className="h-4 w-4 mb-1" />
                        <span className="font-medium text-xs">✈️ Turai</span>
                        <Badge variant="secondary" className="text-[10px] px-1">
                            {drafts?.filter(d => d.campaignType === 'turai' || !d.campaignType).length || 0}
                        </Badge>
                    </Button>
                    
                    {/* LogicArt Replies */}
                    <Button
                        variant={activeCampaign === 'logicart' ? "default" : "outline"}
                        size="sm"
                        className="flex flex-col items-center h-[64px] py-2 px-2"
                        onClick={() => switchCampaign.mutate('logicart')}
                        disabled={switchCampaign.isPending}
                        data-testid="campaign-logicart"
                    >
                        <Code2 className="h-4 w-4 mb-1" />
                        <span className="font-medium text-xs">🧠 Replies</span>
                        <Badge variant="secondary" className="text-[10px] px-1">
                            {drafts?.filter(d => d.campaignType === 'logicart' && !['arena_referee', 'code_flowchart', 'quack_launch'].includes(d.strategy || '') && d.actionType !== 'quote_tweet').length || 0}
                        </Badge>
                    </Button>
                    
                    {/* Arena Referee - Separate Queue */}
                    <Button
                        variant={activeCampaign === 'arena_referee' ? "default" : "outline"}
                        size="sm"
                        className="flex flex-col items-center h-[64px] py-2 px-2"
                        onClick={() => switchCampaign.mutate('arena_referee')}
                        disabled={switchCampaign.isPending}
                        data-testid="campaign-arena-referee"
                    >
                        <Quote className="h-4 w-4 mb-1" />
                        <span className="font-medium text-xs">🏛️ Arena</span>
                        <Badge variant="secondary" className="text-[10px] px-1">
                            {drafts?.filter(d => d.strategy === 'arena_referee' || (d.actionType === 'quote_tweet' && d.arenaVerdict)).length || 0}
                        </Badge>
                    </Button>
                    
                    {/* Code Flowchart - Separate Queue */}
                    <Button
                        variant={activeCampaign === 'code_flowchart' ? "default" : "outline"}
                        size="sm"
                        className="flex flex-col items-center h-[64px] py-2 px-2"
                        onClick={() => switchCampaign.mutate('code_flowchart')}
                        disabled={switchCampaign.isPending}
                        data-testid="campaign-code-flowchart"
                    >
                        <Eye className="h-4 w-4 mb-1" />
                        <span className="font-medium text-xs">📊 Flowchart</span>
                        <Badge variant="secondary" className="text-[10px] px-1">
                            {drafts?.filter(d => d.strategy === 'code_flowchart').length || 0}
                        </Badge>
                    </Button>
                    
                    {/* Quack Launch - Mystery Campaign */}
                    <Button
                        variant={activeCampaign === 'quack_launch' ? "default" : "outline"}
                        size="sm"
                        className="flex flex-col items-center h-[64px] py-2 px-2"
                        onClick={() => switchCampaign.mutate('quack_launch')}
                        disabled={switchCampaign.isPending}
                        data-testid="campaign-quack-launch"
                    >
                        <Send className="h-4 w-4 mb-1" />
                        <span className="font-medium text-xs">🚀 Quack</span>
                        <Badge variant="secondary" className="text-[10px] px-1">
                            {drafts?.filter(d => d.strategy === 'quack_launch').length || 0}
                        </Badge>
                    </Button>
                    
                    {/* Top 10 - Best Candidates */}
                    <Button
                        variant={activeCampaign === 'top_10' ? "default" : "outline"}
                        size="sm"
                        className="flex flex-col items-center h-[64px] py-2 px-2 bg-gradient-to-br from-amber-500/10 to-yellow-500/10 hover:from-amber-500/20 hover:to-yellow-500/20"
                        onClick={() => setActiveCampaign('top_10')}
                        data-testid="campaign-top-10"
                    >
                        <Star className="h-4 w-4 mb-1 text-amber-400" />
                        <span className="font-medium text-xs">⭐ Top 10</span>
                        <Badge variant="secondary" className="text-[10px] px-1 bg-amber-500/20">
                            {topDrafts?.length || 0}
                        </Badge>
                    </Button>
                </div>
                
                <p className="text-xs text-muted-foreground mt-3">
                    {activeCampaign === 'turai' && 'Hunting for travelers planning trips - promoting AI Tour Guide'}
                    {activeCampaign === 'logicart' && 'Hunting for developers with coding questions - promoting AI Debug Arena'}
                    {activeCampaign === 'arena_referee' && 'AI debates → Run through Arena → Quote Tweet with verdict'}
                    {activeCampaign === 'code_flowchart' && 'Code snippets → Generate flowchart → Quote Tweet with CTA'}
                    {activeCampaign === 'quack_launch' && '🦆 Mystery campaign → "Quack?" quote tweets with video → Drive curiosity'}
                    {activeCampaign === 'top_10' && '⭐ Your top 10 highest-scoring candidates across all queues - select and batch send!'}
                </p>
                
                {/* Launch Thread Button - Quack Campaign Only */}
                {activeCampaign === 'quack_launch' && (
                    <div className="mt-4 pt-4 border-t">
                        <Button
                            variant="default"
                            size="lg"
                            className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                            onClick={() => launchThread.mutate()}
                            disabled={launchThread.isPending}
                        >
                            {launchThread.isPending ? (
                                <>
                                    <span className="animate-spin mr-2">🚀</span>
                                    Launching Thread (~3 min)...
                                </>
                            ) : (
                                <>
                                    🧵 Launch Announcement Thread (6 Tweets)
                                </>
                            )}
                        </Button>
                        <p className="text-xs text-muted-foreground mt-2 text-center">
                            Posts your 6-tweet product launch thread with images and videos
                        </p>
                    </div>
                )}

                {/* Strategy Selector (LogicArt only - exclude quote tweet strategies) */}
                {activeCampaign === 'logicart' && campaignData?.availableStrategies && campaignData.availableStrategies.length > 0 && (
                    <div className="mt-4 pt-4 border-t">
                        <label className="text-sm font-medium text-muted-foreground mb-2 block">Active Strategy</label>
                        <div className="grid grid-cols-3 gap-2">
                            {campaignData.availableStrategies.filter(s => !['arena_referee', 'code_flowchart', 'quack_launch'].includes(s.id)).map((strategy) => (
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
                    disabled={manualHunt.isPending || huntAll.isPending}
                >
                    {manualHunt.isPending ? (
                        <>
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                            Hunting...
                        </>
                    ) : (
                        <>
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Hunt Selected
                        </>
                    )}
                </Button>
                <Button
                    variant="default"
                    onClick={() => huntAll.mutate()}
                    disabled={huntAll.isPending || manualHunt.isPending}
                    className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                >
                    {huntAll.isPending ? (
                        <>
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                            Hunting All...
                        </>
                    ) : (
                        <>
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Hunt All Strategies
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

            {/* Quack Launch Display - Show ALL drafts with checkboxes */}
            {activeCampaign === 'quack_launch' ? (
                <div className="space-y-4">
                    {/* Quack Launch Header with actions */}
                    <div className="flex items-center justify-between p-3 bg-gradient-to-r from-yellow-900/20 to-orange-900/20 border border-yellow-400/50 rounded-lg">
                        <div className="flex items-center gap-3">
                            <span className="text-2xl">🦆</span>
                            <span className="font-bold text-yellow-300">Quack Launch Targets</span>
                            <Badge className="bg-yellow-500/20 text-yellow-300">
                                {filteredDrafts?.length || 0} leads
                            </Badge>
                            <Badge className="bg-green-500/20 text-green-300">
                                {selectedIds.size} selected
                            </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    const allIds = filteredDrafts?.map(d => d.id) || [];
                                    if (selectedIds.size === allIds.length && allIds.length > 0) {
                                        setSelectedIds(new Set());
                                    } else {
                                        setSelectedIds(new Set(allIds));
                                    }
                                }}
                            >
                                {selectedIds.size === (filteredDrafts?.length || 0) && filteredDrafts?.length ? 'Deselect All' : 'Select All'}
                            </Button>
                            <Button
                                size="sm"
                                className="bg-green-600 hover:bg-green-700"
                                onClick={() => bulkApprove.mutate(Array.from(selectedIds))}
                                disabled={selectedIds.size === 0 || bulkApprove.isPending}
                            >
                                {bulkApprove.isPending ? (
                                    <>
                                        <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                                        Sending...
                                    </>
                                ) : (
                                    <>
                                        <Send className="h-4 w-4 mr-1" />
                                        Send Selected ({selectedIds.size})
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>

                    {/* Video Upload Section */}
                    <div className="p-3 bg-muted/30 border border-muted rounded-lg">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Video className="h-5 w-5 text-yellow-400" />
                                <div>
                                    <span className="font-medium text-sm">Video Attachment</span>
                                    <p className="text-xs text-muted-foreground">
                                        {quackMediaData?.mediaPath ? 
                                            `Current: ${quackMediaData.mediaPath.split('/').pop()}` : 
                                            'No video configured'}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <label className="cursor-pointer">
                                    <input
                                        type="file"
                                        accept="video/mp4,video/webm,video/quicktime"
                                        className="hidden"
                                        onChange={async (e) => {
                                            const file = e.target.files?.[0];
                                            if (!file) return;
                                            
                                            setIsUploadingVideo(true);
                                            try {
                                                const formData = new FormData();
                                                formData.append('video', file);
                                                
                                                const res = await fetch('/api/sniper/quack-launch/upload-video', {
                                                    method: 'POST',
                                                    body: formData,
                                                });
                                                
                                                const data = await res.json();
                                                
                                                if (!res.ok) {
                                                    throw new Error(data.error || 'Upload failed');
                                                }
                                                queryClient.invalidateQueries({ queryKey: ["/api/sniper/quack-launch/media"] });
                                                toast({
                                                    title: "Video Uploaded! 🎥",
                                                    description: `${file.name} is now set for all Quack Launch posts`,
                                                });
                                            } catch (error: any) {
                                                const errorMsg = error?.message || "Could not upload video. Try a smaller file.";
                                                toast({
                                                    title: "Upload Failed",
                                                    description: errorMsg,
                                                    variant: "destructive",
                                                });
                                            } finally {
                                                setIsUploadingVideo(false);
                                                e.target.value = ''; // Reset input
                                            }
                                        }}
                                    />
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={isUploadingVideo}
                                        asChild
                                    >
                                        <span>
                                            {isUploadingVideo ? (
                                                <>
                                                    <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                                                    Uploading...
                                                </>
                                            ) : (
                                                <>
                                                    <Upload className="h-4 w-4 mr-1" />
                                                    Upload New Video
                                                </>
                                            )}
                                        </span>
                                    </Button>
                                </label>
                            </div>
                        </div>
                    </div>

                    {/* Preview Box - Show what the quote tweet will look like */}
                    <div className="p-3 bg-blue-900/20 border border-blue-400/30 rounded-lg">
                        <div className="flex items-start gap-3">
                            <Quote className="h-5 w-5 text-blue-400 mt-0.5" />
                            <div>
                                <span className="font-medium text-sm text-blue-300">Quote Tweet Preview</span>
                                <p className="text-sm mt-1 text-white font-medium">"Quack?"</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    + Video attachment + Quoted original tweet
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Quack Launch List - ALL drafts */}
                    {isLoading ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                            <p>Loading leads...</p>
                        </div>
                    ) : filteredDrafts?.length === 0 ? (
                        <p className="text-center py-8 text-muted-foreground">No Quack Launch leads found. Run a hunt to find agent swarm discussions!</p>
                    ) : (
                        <div className="space-y-3">
                            {filteredDrafts?.map((draft, index) => (
                                <Top10Card 
                                    key={draft.id} 
                                    draft={draft} 
                                    rank={index + 1}
                                    isSelected={selectedIds.has(draft.id)}
                                    onToggle={(id) => {
                                        setSelectedIds(prev => {
                                            const next = new Set(prev);
                                            if (next.has(id)) {
                                                next.delete(id);
                                            } else {
                                                next.add(id);
                                            }
                                            return next;
                                        });
                                    }}
                                    onDelete={(id) => deleteDraft.mutate(id)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            ) : activeCampaign === 'top_10' ? (
                <div className="space-y-4">
                    {/* Top 10 Header with actions */}
                    <div className="flex items-center justify-between p-3 bg-gradient-to-r from-amber-900/20 to-yellow-900/20 border border-amber-400/50 rounded-lg">
                        <div className="flex items-center gap-3">
                            <Star className="h-5 w-5 text-amber-400" />
                            <span className="font-bold text-amber-300">Top 10 Response Candidates</span>
                            <Badge className="bg-amber-500/20 text-amber-300">
                                {selectedIds.size} selected
                            </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={async () => {
                                    await queryClient.invalidateQueries({ queryKey: ["/api/postcard-drafts/top"] });
                                    toast({ title: "Refreshed", description: "Top 10 list updated" });
                                }}
                                disabled={isLoadingTop}
                            >
                                <RefreshCw className={`h-4 w-4 mr-1 ${isLoadingTop ? 'animate-spin' : ''}`} />
                                Refresh
                            </Button>
                            <Button
                                size="sm"
                                className="bg-green-600 hover:bg-green-700"
                                onClick={() => bulkApprove.mutate(Array.from(selectedIds))}
                                disabled={selectedIds.size === 0 || bulkApprove.isPending}
                            >
                                {bulkApprove.isPending ? (
                                    <>
                                        <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                                        Sending...
                                    </>
                                ) : (
                                    <>
                                        <Send className="h-4 w-4 mr-1" />
                                        Send Selected ({selectedIds.size})
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>

                    {/* Top 10 List */}
                    {isLoadingTop ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                            <p>Loading top candidates...</p>
                        </div>
                    ) : topDrafts?.length === 0 ? (
                        <p className="text-center py-8 text-muted-foreground">No pending drafts found. Run a hunt to find new leads!</p>
                    ) : (
                        <div className="space-y-3">
                            {topDrafts?.map((draft, index) => (
                                <Top10Card 
                                    key={draft.id} 
                                    draft={draft} 
                                    rank={index + 1}
                                    isSelected={selectedIds.has(draft.id)}
                                    onToggle={(id) => {
                                        setSelectedIds(prev => {
                                            const next = new Set(prev);
                                            if (next.has(id)) {
                                                next.delete(id);
                                            } else {
                                                next.add(id);
                                            }
                                            return next;
                                        });
                                    }}
                                    onDelete={(id) => deleteDraft.mutate(id)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            ) : (
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
            )}
        </div>
    );
}

// Top 10 Card - Compact display with checkbox and tweet link
function Top10Card({ draft, rank, isSelected, onToggle, onDelete }: { 
    draft: PostcardDraft; 
    rank: number; 
    isSelected: boolean;
    onToggle: (id: number) => void;
    onDelete: (id: number) => void;
}) {
    const score = draft.score || 0;
    const tweetUrl = `https://twitter.com/${draft.originalAuthorHandle}/status/${draft.originalTweetId}`;
    
    // Score color
    let scoreColor = "bg-gray-500";
    if (score >= 90) scoreColor = "bg-green-500";
    else if (score >= 70) scoreColor = "bg-yellow-500";
    
    // Strategy badge
    const getStrategyBadge = () => {
        if (draft.strategy === 'arena_referee') return { text: '🏛️ Arena', color: 'bg-purple-600' };
        if (draft.strategy === 'code_flowchart') return { text: '📊 Flowchart', color: 'bg-blue-600' };
        if (draft.strategy === 'quack_launch') return { text: '🚀 Quack', color: 'bg-yellow-600' };
        if (draft.campaignType === 'turai') return { text: '✈️ Turai', color: 'bg-cyan-600' };
        return { text: '🧠 LogicArt', color: 'bg-green-600' };
    };
    const strategyBadge = getStrategyBadge();

    return (
        <Card className={`transition-all ${isSelected ? 'ring-2 ring-amber-400 bg-amber-900/10' : ''}`}>
            <CardContent className="p-4">
                <div className="flex items-start gap-3">
                    {/* Checkbox + Rank */}
                    <div className="flex flex-col items-center gap-1">
                        <Checkbox 
                            checked={isSelected}
                            onCheckedChange={() => onToggle(draft.id)}
                            className="h-5 w-5"
                        />
                        <span className="text-lg font-bold text-muted-foreground">#{rank}</span>
                    </div>
                    
                    {/* Score Badge */}
                    <div className={`${scoreColor} text-white text-sm font-bold px-2 py-1 rounded-lg min-w-[40px] text-center`}>
                        {score}
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-sm">@{draft.originalAuthorHandle}</span>
                            <Badge className={`${strategyBadge.color} text-white text-[10px]`}>
                                {strategyBadge.text}
                            </Badge>
                            <a 
                                href={tweetUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-blue-400 hover:text-blue-300 flex items-center gap-1 text-xs"
                            >
                                <ExternalLink className="h-3 w-3" />
                                View Tweet
                            </a>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                            {draft.originalTweetText}
                        </p>
                        {draft.draftReplyText && (
                            <div className="mt-2 p-2 bg-muted/30 rounded text-xs text-gray-300 line-clamp-2">
                                <span className="text-muted-foreground">Draft reply: </span>
                                {draft.draftReplyText}
                            </div>
                        )}
                    </div>
                    
                    {/* Delete Button */}
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDelete(draft.id)}
                        className="text-red-400 hover:text-red-300 hover:bg-red-900/20 h-8 w-8 p-0"
                        title="Delete draft"
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

function MiniArenaDisplay({ arenaVerdict }: { arenaVerdict: ArenaVerdict }) {
    const responses = arenaVerdict.responses || [];
    const winner = arenaVerdict.winner;
    
    // Model color mapping (matching Arena page design)
    const modelColors: Record<string, { bg: string; border: string; text: string; badge: string }> = {
        'Gemini 3 Flash': { bg: 'bg-blue-900/30', border: 'border-blue-500/50', text: 'text-blue-400', badge: 'bg-blue-600' },
        'Gemini 2.5 Pro': { bg: 'bg-blue-900/30', border: 'border-blue-500/50', text: 'text-blue-400', badge: 'bg-blue-600' },
        'GPT-4o': { bg: 'bg-emerald-900/30', border: 'border-emerald-500/50', text: 'text-emerald-400', badge: 'bg-emerald-600' },
        'Claude Sonnet 4': { bg: 'bg-orange-900/30', border: 'border-orange-500/50', text: 'text-orange-400', badge: 'bg-orange-600' },
        'Grok-4': { bg: 'bg-slate-800/50', border: 'border-slate-500/50', text: 'text-slate-300', badge: 'bg-slate-600' },
    };
    
    const getModelStyle = (modelName: string) => {
        return modelColors[modelName] || { bg: 'bg-gray-800/30', border: 'border-gray-500/50', text: 'text-gray-400', badge: 'bg-gray-600' };
    };
    
    // Find the exact winning response by matching the winner string
    const winnerIndex = (() => {
        if (!winner) return -1;
        const normalizedWinner = winner.toLowerCase().trim();
        return responses.findIndex(r => {
            const normalizedModel = r.model.toLowerCase().trim();
            if (normalizedModel === normalizedWinner) return true;
            if (normalizedWinner.includes(normalizedModel) && normalizedModel.length > 3) return true;
            if (normalizedModel.includes(normalizedWinner) && normalizedWinner.length > 3) return true;
            return false;
        });
    })();
    
    const isWinner = (idx: number) => idx === winnerIndex;

    return (
        <div className="mb-3">
            {/* Header Row: Title + Winner Badge */}
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <span className="text-sm">🏆</span>
                    <span className="font-bold text-amber-400 text-sm">The Contenders Have Spoken!</span>
                </div>
                <div className="flex items-center gap-2">
                    <Badge className="bg-purple-600 text-white text-[10px]">Quote Tweet</Badge>
                    {arenaVerdict.winner && (
                        <Badge className="bg-amber-500 text-black text-xs">Winner: {arenaVerdict.winner}</Badge>
                    )}
                </div>
            </div>
            
            {/* Verdict Reasoning (compact) */}
            {arenaVerdict.reasoning && (
                <div className="p-2 bg-gradient-to-r from-amber-900/20 to-yellow-900/20 border border-amber-400/50 rounded-lg mb-2">
                    <p className="text-[10px] text-gray-300 italic leading-snug">
                        "{arenaVerdict.reasoning.substring(0, 250)}{arenaVerdict.reasoning.length > 250 ? '...' : ''}"
                    </p>
                </div>
            )}
            
            {/* 2x2 Grid of All AI Responses - Full Width, Scrollable */}
            {responses.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                    {responses.map((r, idx) => {
                        const style = getModelStyle(r.model);
                        const wonMatch = isWinner(idx);
                        
                        return (
                            <div
                                key={idx}
                                className={`rounded-lg p-2 ${style.bg} ${wonMatch ? 'border-2 border-amber-400 ring-1 ring-amber-400/30' : `border ${style.border}`}`}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-1">
                                        <span className={`text-xs font-bold ${style.text}`}>
                                            {r.model}
                                        </span>
                                        {wonMatch && <span className="text-xs">🏆</span>}
                                    </div>
                                    <span className="text-[9px] text-muted-foreground">{r.responseTime}ms</span>
                                </div>
                                <div className="max-h-20 overflow-y-auto text-[11px] text-gray-300 leading-snug pr-1" style={{ scrollbarWidth: 'thin' }}>
                                    {r.response.substring(0, 300)}{r.response.length > 300 && '...'}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function DraftCard({ draft, campaignType = 'turai' }: { draft: PostcardDraft; campaignType?: string }) {
    const [text, setText] = useState(draft.draftReplyText || "");
    const [showPreview, setShowPreview] = useState(false);
    const score = draft.score || 0;
    const { toast } = useToast();
    
    // Check if this is a Quote Tweet draft (Arena Referee)
    const isQuoteTweet = draft.actionType === 'quote_tweet';
    const arenaVerdict = draft.arenaVerdict as ArenaVerdict | null;
    
    // Character count for tweet preview
    const charCount = text.length;
    const maxChars = 280;
    const isOverLimit = charCount > maxChars;

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
            queryClient.invalidateQueries({ queryKey: ["/api/posts"] }); // Refresh Recent Posts & Post History
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

                    {/* Arena Referee Verdict Display - Full Mini-Arena */}
                    {isQuoteTweet && arenaVerdict && draft.strategy === 'arena_referee' && (
                        <MiniArenaDisplay arenaVerdict={arenaVerdict} />
                    )}
                    
                    {/* Code Flowchart Display - Show flowchart info */}
                    {isQuoteTweet && draft.strategy === 'code_flowchart' && (
                        <div className="mb-3 p-3 rounded-lg border border-purple-500/30 bg-purple-900/20">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-lg">📊</span>
                                <span className="font-semibold text-purple-400">Code → Flowchart</span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                {arenaVerdict?.reasoning || "Code/problem detected and visualized as flowchart"}
                            </p>
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

            <CardFooter className="flex justify-between items-center bg-muted/50 p-4">
                <div className="flex items-center gap-2">
                    <span className={`text-xs ${isOverLimit ? 'text-red-500 font-bold' : 'text-muted-foreground'}`}>
                        {charCount}/{maxChars}
                    </span>
                    <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => setShowPreview(true)}
                        className="gap-1"
                    >
                        <Eye className="h-3 w-3" />
                        Preview
                    </Button>
                </div>
                <div className="flex gap-2">
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
                            disabled={isOverLimit}
                        >
                            Quote Tweet 🏛️
                        </Button>
                    ) : (
                        <Button onClick={() => approve.mutate()} disabled={approve.isPending || isOverLimit}>
                            {approve.isPending ? "Publishing..." : "Approve & Send 🚀"}
                        </Button>
                    )}
                </div>
            </CardFooter>
            
            {/* Tweet Preview Modal */}
            <Dialog open={showPreview} onOpenChange={setShowPreview}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Eye className="h-5 w-5" />
                            Tweet Preview
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        {/* Mock Tweet Display */}
                        <div className="bg-black/80 border border-gray-700 rounded-xl p-4">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold">
                                    V
                                </div>
                                <div>
                                    <p className="font-bold text-white text-sm">VibePost</p>
                                    <p className="text-gray-500 text-xs">@vibepost</p>
                                </div>
                            </div>
                            <p className="text-white text-sm whitespace-pre-wrap leading-relaxed mb-3">
                                {text}
                            </p>
                            {isQuoteTweet && (
                                <div className="border border-gray-700 rounded-lg p-3 mt-2">
                                    <div className="flex items-center gap-2 mb-1">
                                        <div className="w-5 h-5 rounded-full bg-gray-600"></div>
                                        <span className="text-gray-400 text-xs">@{draft.originalAuthorHandle}</span>
                                    </div>
                                    <p className="text-gray-400 text-xs line-clamp-2">
                                        {draft.originalTweetText}
                                    </p>
                                </div>
                            )}
                        </div>
                        
                        {/* Character Count Warning */}
                        <div className="flex justify-between items-center">
                            <span className={`text-sm font-medium ${isOverLimit ? 'text-red-500' : 'text-muted-foreground'}`}>
                                {charCount} / {maxChars} characters
                            </span>
                            {isOverLimit && (
                                <Badge variant="destructive">Over limit by {charCount - maxChars}</Badge>
                            )}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowPreview(false)}>
                            Edit
                        </Button>
                        {isQuoteTweet ? (
                            <Button 
                                onClick={() => {
                                    const originalUrl = `https://twitter.com/${draft.originalAuthorHandle}/status/${draft.originalTweetId}`;
                                    const encodedText = encodeURIComponent(text);
                                    const encodedUrl = encodeURIComponent(originalUrl);
                                    window.open(`https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`, '_blank');
                                    setShowPreview(false);
                                }}
                                className="bg-purple-600 hover:bg-purple-700"
                                disabled={isOverLimit}
                            >
                                Open Quote Tweet 🏛️
                            </Button>
                        ) : (
                            <Button 
                                onClick={() => {
                                    approve.mutate();
                                    setShowPreview(false);
                                }} 
                                disabled={approve.isPending || isOverLimit}
                            >
                                Send Tweet 🚀
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
