import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
    Sun,
    Clock,
    MapPin,
    Calendar,
    Send,
    Eye,
    Check,
    AlertCircle,
    Loader2,
    ExternalLink
} from "lucide-react";

interface SchedulerStatus {
    isRunning: boolean;
    scheduledTime: string;
    timezone: string;
    nextDestination: string;
}

interface PostcardPreview {
    success: boolean;
    destination: string;
    caption: string;
    imageUrl: string;
    hashtags: string[];
    fullText: string;
}

interface DailyPostResult {
    success: boolean;
    destination?: string;
    tweetId?: string;
    error?: string;
}

export default function DailyPostcard() {
    const { toast } = useToast();
    const [previewData, setPreviewData] = useState<PostcardPreview | null>(null);

    // Fetch scheduler status
    const { data: schedulerStatus, isLoading: statusLoading } = useQuery<SchedulerStatus>({
        queryKey: ["/api/daily-postcard/scheduler-status"],
        refetchInterval: 60000 // Refresh every minute
    });

    // Fetch destinations list
    const { data: destinationsData } = useQuery<{ destinations: string[] }>({
        queryKey: ["/api/daily-postcard/destinations"]
    });

    // Preview mutation
    const previewMutation = useMutation({
        mutationFn: async () => {
            const res = await apiRequest("GET", "/api/daily-postcard/preview");
            return res.json();
        },
        onSuccess: (data: PostcardPreview) => {
            setPreviewData(data);
            toast({
                title: "Preview Generated! 🎨",
                description: `Today's destination: ${data.destination}`,
            });
        },
        onError: (error) => {
            console.error("Preview failed:", error);
            toast({
                variant: "destructive",
                title: "Preview Failed",
                description: "Could not generate preview. Check console for details.",
            });
        }
    });

    // Post now mutation
    const postNowMutation = useMutation({
        mutationFn: async () => {
            const res = await apiRequest("POST", "/api/daily-postcard/post");
            return res.json();
        },
        onSuccess: (data: DailyPostResult) => {
            if (data.success) {
                toast({
                    title: "Posted Successfully! 🎉",
                    description: `${data.destination} postcard is now live on Twitter!`,
                });
                setPreviewData(null);
                queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
            } else {
                toast({
                    variant: "destructive",
                    title: "Post Failed",
                    description: data.error || "Unknown error occurred",
                });
            }
        },
        onError: (error) => {
            console.error("Post failed:", error);
            toast({
                variant: "destructive",
                title: "Post Failed",
                description: "Could not post to Twitter. Check console for details.",
            });
        }
    });

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold mb-6">🌅 Daily Postcard</h1>
            <p className="text-muted-foreground mb-8">
                Automatically share stunning travel postcards every day at 9:00 AM.
            </p>

            {/* Scheduler Status Card */}
            <Card className="mb-6">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Clock className="h-5 w-5" />
                        Scheduler Status
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {statusLoading ? (
                        <div className="flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading...
                        </div>
                    ) : schedulerStatus ? (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="flex flex-col">
                                <span className="text-sm text-muted-foreground">Status</span>
                                <div className="flex items-center gap-2 mt-1">
                                    {schedulerStatus.isRunning ? (
                                        <>
                                            <Check className="h-4 w-4 text-green-500" />
                                            <span className="font-medium text-green-500">Active</span>
                                        </>
                                    ) : (
                                        <>
                                            <AlertCircle className="h-4 w-4 text-yellow-500" />
                                            <span className="font-medium text-yellow-500">Inactive</span>
                                        </>
                                    )}
                                </div>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-sm text-muted-foreground">Post Time</span>
                                <span className="font-medium mt-1">{schedulerStatus.scheduledTime}</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-sm text-muted-foreground">Timezone</span>
                                <span className="font-medium mt-1">{schedulerStatus.timezone}</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-sm text-muted-foreground">Next Destination</span>
                                <span className="font-medium mt-1 flex items-center gap-1">
                                    <MapPin className="h-3 w-3" />
                                    {schedulerStatus.nextDestination}
                                </span>
                            </div>
                        </div>
                    ) : (
                        <div className="text-muted-foreground">Unable to load scheduler status</div>
                    )}
                </CardContent>
            </Card>

            {/* Actions Card */}
            <Card className="mb-6">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Sun className="h-5 w-5" />
                        Today's Postcard
                    </CardTitle>
                    <CardDescription>
                        Preview or manually post today's travel postcard
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex gap-4">
                        <Button
                            variant="outline"
                            onClick={() => previewMutation.mutate()}
                            disabled={previewMutation.isPending}
                        >
                            {previewMutation.isPending ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Generating...
                                </>
                            ) : (
                                <>
                                    <Eye className="mr-2 h-4 w-4" />
                                    Preview
                                </>
                            )}
                        </Button>
                        <Button
                            onClick={() => postNowMutation.mutate()}
                            disabled={postNowMutation.isPending}
                        >
                            {postNowMutation.isPending ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Posting...
                                </>
                            ) : (
                                <>
                                    <Send className="mr-2 h-4 w-4" />
                                    Post Now
                                </>
                            )}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Preview Card (only shown when preview is generated) */}
            {previewData && (
                <Card className="mb-6 border-2 border-primary/50">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <MapPin className="h-5 w-5" />
                            {previewData.destination}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid md:grid-cols-2 gap-6">
                            {/* Image */}
                            <div className="relative aspect-video rounded-lg overflow-hidden bg-muted">
                                {previewData.imageUrl ? (
                                    <img
                                        src={previewData.imageUrl}
                                        alt={previewData.destination}
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <div className="flex items-center justify-center h-full text-muted-foreground">
                                        No image available
                                    </div>
                                )}
                            </div>

                            {/* Caption */}
                            <div>
                                <h4 className="font-medium mb-2">Caption:</h4>
                                <p className="text-sm text-muted-foreground whitespace-pre-wrap mb-4">
                                    {previewData.fullText}
                                </p>

                                <h4 className="font-medium mb-2">Hashtags:</h4>
                                <div className="flex flex-wrap gap-2">
                                    {previewData.hashtags?.map((tag, i) => (
                                        <Badge key={i} variant="secondary">{tag}</Badge>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Destinations List */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Calendar className="h-5 w-5" />
                        Featured Destinations
                    </CardTitle>
                    <CardDescription>
                        The postcard cycles through these {destinationsData?.destinations?.length || 25} photogenic locations
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap gap-2">
                        {destinationsData?.destinations?.map((dest, i) => (
                            <Badge
                                key={i}
                                variant={schedulerStatus?.nextDestination === dest ? "default" : "outline"}
                                className={schedulerStatus?.nextDestination === dest ? "ring-2 ring-primary" : ""}
                            >
                                {dest}
                            </Badge>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
