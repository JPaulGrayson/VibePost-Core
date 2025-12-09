import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
    Film,
    Play,
    Clock,
    MapPin,
    Download,
    Loader2,
    Video,
    RefreshCw,
    Check,
    AlertCircle,
    Trash2
} from "lucide-react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

interface VideoInfo {
    filename: string;
    path: string;
    size: number;
    createdAt: string;
}

interface GenerationResult {
    success: boolean;
    videoPath?: string;
    destination?: string;
    duration?: number;
    error?: string;
}

export default function VideoSlideshows() {
    const { toast } = useToast();
    const [selectedDestination, setSelectedDestination] = useState<string>("");
    const [videoDuration, setVideoDuration] = useState<number>(60);
    const [isGenerating, setIsGenerating] = useState(false);

    // Fetch available destinations
    const { data: destinationsData } = useQuery<{ destinations: string[] }>({
        queryKey: ["/api/video-slideshow/destinations"]
    });

    // Fetch generated videos
    const { data: videosData, refetch: refetchVideos } = useQuery<{ videos: VideoInfo[] }>({
        queryKey: ["/api/video-slideshow/videos"],
        refetchInterval: isGenerating ? 5000 : false // Poll while generating
    });

    // Generate video mutation
    const generateMutation = useMutation({
        mutationFn: async (params: { destination: string; duration: number }) => {
            setIsGenerating(true);
            const res = await apiRequest("POST", "/api/video-slideshow/generate", params);
            return res.json();
        },
        onSuccess: (data: GenerationResult) => {
            setIsGenerating(false);
            if (data.success) {
                toast({
                    title: "Video Generated! 🎬",
                    description: `${data.destination} video is ready (${data.duration}s)`,
                });
                refetchVideos();
            } else {
                toast({
                    variant: "destructive",
                    title: "Generation Failed",
                    description: data.error || "Unknown error",
                });
            }
        },
        onError: (error) => {
            setIsGenerating(false);
            console.error("Video generation failed:", error);
            toast({
                variant: "destructive",
                title: "Generation Failed",
                description: "Check console for details.",
            });
        }
    });

    const handleGenerate = () => {
        if (!selectedDestination) {
            toast({
                variant: "destructive",
                title: "Select a Destination",
                description: "Please choose a destination before generating.",
            });
            return;
        }
        generateMutation.mutate({ destination: selectedDestination, duration: videoDuration });
    };

    const formatFileSize = (bytes: number): string => {
        if (bytes >= 1024 * 1024) {
            return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
        }
        return `${(bytes / 1024).toFixed(1)} KB`;
    };

    const formatDate = (dateStr: string): string => {
        return new Date(dateStr).toLocaleString();
    };

    return (
        <div className="p-6 max-w-5xl mx-auto">
            <h1 className="text-2xl font-bold mb-2">🎬 Video Slideshows</h1>
            <p className="text-muted-foreground mb-8">
                Generate AI-narrated travel video slideshows for social media
            </p>

            {/* Generation Card */}
            <Card className="mb-6">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Film className="h-5 w-5" />
                        Generate New Video
                    </CardTitle>
                    <CardDescription>
                        Record a Turai slideshow as a vertical video perfect for Twitter, TikTok, or Reels
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid md:grid-cols-3 gap-4">
                        {/* Destination Select */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Destination</label>
                            <Select
                                value={selectedDestination}
                                onValueChange={setSelectedDestination}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Choose destination..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {destinationsData?.destinations?.map((dest) => (
                                        <SelectItem key={dest} value={dest}>
                                            <div className="flex items-center gap-2">
                                                <MapPin className="h-3 w-3" />
                                                {dest}
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Duration Select */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Duration</label>
                            <Select
                                value={String(videoDuration)}
                                onValueChange={(v) => setVideoDuration(Number(v))}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="30">30 seconds</SelectItem>
                                    <SelectItem value="60">60 seconds</SelectItem>
                                    <SelectItem value="90">90 seconds</SelectItem>
                                    <SelectItem value="120">2 minutes</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Generate Button */}
                        <div className="flex items-end">
                            <Button
                                className="w-full"
                                onClick={handleGenerate}
                                disabled={isGenerating || !selectedDestination}
                            >
                                {isGenerating ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Generating...
                                    </>
                                ) : (
                                    <>
                                        <Play className="mr-2 h-4 w-4" />
                                        Generate Video
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>

                    {/* Generation Status */}
                    {isGenerating && (
                        <div className="mt-4 p-4 bg-muted rounded-lg">
                            <div className="flex items-center gap-2 text-sm">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>Recording slideshow... This may take 2-3 minutes.</span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">
                                Generating tour → Waiting for narrations → Recording video
                            </p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Video Specifications */}
            <Card className="mb-6">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Video className="h-5 w-5" />
                        Video Specifications
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                            <span className="text-muted-foreground">Format</span>
                            <p className="font-medium">MP4 (H.264)</p>
                        </div>
                        <div>
                            <span className="text-muted-foreground">Resolution</span>
                            <p className="font-medium">1080×1920 (9:16)</p>
                        </div>
                        <div>
                            <span className="text-muted-foreground">Frame Rate</span>
                            <p className="font-medium">30 FPS</p>
                        </div>
                        <div>
                            <span className="text-muted-foreground">Audio</span>
                            <p className="font-medium">AI Narration</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Generated Videos List */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <Film className="h-5 w-5" />
                            Generated Videos
                        </CardTitle>
                        <CardDescription>
                            {videosData?.videos?.length || 0} videos ready
                        </CardDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => refetchVideos()}>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Refresh
                    </Button>
                </CardHeader>
                <CardContent>
                    {(!videosData?.videos || videosData.videos.length === 0) ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <Film className="h-12 w-12 mx-auto mb-4 opacity-50" />
                            <p>No videos generated yet</p>
                            <p className="text-sm">Generate your first video above!</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {videosData.videos.map((video) => (
                                <div
                                    key={video.filename}
                                    className="flex items-center justify-between p-4 bg-muted rounded-lg"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 bg-primary/20 rounded-lg flex items-center justify-center">
                                            <Film className="h-6 w-6 text-primary" />
                                        </div>
                                        <div>
                                            <p className="font-medium text-sm">{video.filename}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {formatFileSize(video.size)} • {formatDate(video.createdAt)}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Badge variant="secondary">
                                            <Check className="h-3 w-3 mr-1" />
                                            Ready
                                        </Badge>
                                        {/* Future: Add download/post buttons */}
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
