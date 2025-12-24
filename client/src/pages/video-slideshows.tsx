import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useState, useRef, useEffect } from "react";
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
    Eye,
    Send,
    Image,
    Type,
    Sparkles,
    ArrowRight,
    X,
    Calendar,
    Volume2,
    Pause,
    Trash2,
    Link2
} from "lucide-react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

// Interfaces
interface VideoPostStop {
    index: number;
    name: string;
    description: string;
    imageUrl: string;
    imageUrls: string[];
    audioUrl?: string;
    narrationText?: string;
}

interface VideoPostPreview {
    success: boolean;
    shareCode?: string;
    destination: string;
    topic?: string;
    estimatedDuration: number;
    stops: VideoPostStop[];
    introImageUrl?: string;
    error?: string;
}

interface VideoPostResult {
    success: boolean;
    videoPath?: string;
    destination?: string;
    duration?: number;
    shareCode?: string;
    error?: string;
}

interface VideoInfo {
    filename: string;
    path: string;
    size: number;
    createdAt: string;
}

// Popular destinations
const POPULAR_DESTINATIONS = [
    "Paris, France",
    "Tokyo, Japan",
    "Rome, Italy",
    "Barcelona, Spain",
    "Bali, Indonesia",
    "New York City, USA",
    "London, UK",
    "Santorini, Greece",
    "Dubai, UAE",
    "Kyoto, Japan",
    "Amsterdam, Netherlands",
    "Lisbon, Portugal",
    "Prague, Czech Republic",
    "Vienna, Austria",
    "Sydney, Australia"
];

export default function VideoPosts() {
    const { toast } = useToast();

    // Mode: "new" = generate new tour, "existing" = use existing Turai tour
    const [mode, setMode] = useState<"new" | "existing">("new");
    const [existingShareCode, setExistingShareCode] = useState("");

    // Output format: "video" = slideshow video, "thread" = Twitter thread
    const [outputFormat, setOutputFormat] = useState<"video" | "thread">("video");

    // Form state
    const [destination, setDestination] = useState("");
    const [customDestination, setCustomDestination] = useState("");
    const [topic, setTopic] = useState("");
    const [maxStops, setMaxStops] = useState(5);
    const [secondsPerStop, setSecondsPerStop] = useState(12);

    // Preview state
    const [preview, setPreview] = useState<VideoPostPreview | null>(null);
    const [isPreviewing, setIsPreviewing] = useState(false);

    // Video state
    const [generatedVideo, setGeneratedVideo] = useState<VideoPostResult | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);

    // Caption state
    const [caption, setCaption] = useState("");
    const [isPublishing, setIsPublishing] = useState(false);

    // Player state
    const [selectedVideo, setSelectedVideo] = useState<VideoInfo | null>(null);

    // Audio preview state
    const [playingStopIndex, setPlayingStopIndex] = useState<number | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Fetch generated videos
    const { data: videosData, refetch: refetchVideos, isRefetching } = useQuery<{ videos: VideoInfo[] }>({
        queryKey: ["/api/video-post/list"]
    });

    // Fetch daily video scheduler status
    const { data: schedulerStatus } = useQuery<{
        active: boolean;
        scheduledTime: string;
        timezone: string;
        nextDestination: string;
        nextTopic?: string;
        queuePosition: number;
        queueTotal: number;
    }>({
        queryKey: ["/api/daily-video/status"],
        refetchInterval: 60000 // Refresh every minute
    });

    // Poll for preview updates when we have incomplete stops
    useEffect(() => {
        if (!preview?.shareCode || isPreviewing || isGenerating) return;

        // Check if any stops are missing images or audio
        const incompleteStops = preview.stops.filter(
            s => !s.audioUrl || !s.imageUrls?.length || s.imageUrls.length === 0
        );

        // If all stops are complete, no need to poll
        if (incompleteStops.length === 0) return;

        console.log(`🔄 Polling for ${incompleteStops.length} incomplete stops...`);

        const pollInterval = setInterval(async () => {
            try {
                const res = await apiRequest("GET", `/api/video-post/preview/${preview.shareCode}?maxStops=${maxStops}`);
                const refreshedPreview = await res.json();

                if (refreshedPreview.success) {
                    const newIncomplete = refreshedPreview.stops.filter(
                        (s: any) => !s.audioUrl || !s.imageUrls?.length
                    );

                    // Update preview with new data
                    setPreview(refreshedPreview);

                    if (newIncomplete.length === 0) {
                        console.log('✅ All stops now complete!');
                        clearInterval(pollInterval);
                        toast({
                            title: "All Stops Ready! 🎉",
                            description: `${refreshedPreview.stops.length} stops with images and audio`,
                        });
                    }
                }
            } catch (e) {
                console.error('Poll failed:', e);
            }
        }, 5000); // Poll every 5 seconds

        // Stop polling after 2 minutes max
        const timeout = setTimeout(() => {
            clearInterval(pollInterval);
        }, 120000);

        return () => {
            clearInterval(pollInterval);
            clearTimeout(timeout);
        };
    }, [preview?.shareCode, isPreviewing, isGenerating, maxStops]);

    // Get effective destination - prioritize preview destination for imported tours
    const effectiveDestination = preview?.destination || customDestination || (destination === "custom" ? "" : destination);

    // Preview mutation
    const previewMutation = useMutation({
        mutationFn: async () => {
            setIsPreviewing(true);
            setPreview(null);
            const res = await apiRequest("POST", "/api/video-post/preview", {
                destination: effectiveDestination,
                topic: topic || undefined,
                maxStops,
                theme: 'hidden_gems'
            });
            return res.json();
        },
        onSuccess: (data: VideoPostPreview) => {
            setIsPreviewing(false);
            if (data.success) {
                setPreview(data);
                toast({
                    title: "Preview Ready! 👁️",
                    description: `${data.stops.length} stops • ~${data.estimatedDuration}s video`,
                });
            } else {
                toast({
                    variant: "destructive",
                    title: "Preview Failed",
                    description: data.error || "Unknown error",
                });
            }
        },
        onError: (error) => {
            setIsPreviewing(false);
            toast({
                variant: "destructive",
                title: "Preview Failed",
                description: String(error),
            });
        }
    });

    // Generate video mutation
    const generateMutation = useMutation({
        mutationFn: async () => {
            setIsGenerating(true);
            const res = await apiRequest("POST", "/api/video-post/generate", {
                destination: effectiveDestination,
                topic: topic || undefined,
                maxStops,
                secondsPerStop,
                theme: 'hidden_gems',
                shareCode: preview?.shareCode  // Use the previewed tour!
            });
            return res.json();
        },
        onSuccess: async (data: VideoPostResult) => {
            setIsGenerating(false);
            if (data.success) {
                setGeneratedVideo(data);
                refetchVideos();

                // Generate caption
                try {
                    const captionRes = await apiRequest("POST", "/api/video-post/caption", {
                        destination: effectiveDestination,
                        topic: topic || undefined
                    });
                    const captionData = await captionRes.json();
                    if (captionData.success) {
                        setCaption(captionData.caption);
                    }
                } catch (e) {
                    setCaption(`Discover ${effectiveDestination}! ✨\n\nPlan your trip: turai.org 🗺️`);
                }

                toast({
                    title: "Video Generated! 🎬",
                    description: `${data.destination} video is ready (${data.duration}s)`,
                });
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
            toast({
                variant: "destructive",
                title: "Generation Failed",
                description: String(error),
            });
        }
    });

    // Publish mutation
    const publishMutation = useMutation({
        mutationFn: async () => {
            setIsPublishing(true);
            const res = await apiRequest("POST", "/api/video-post/publish", {
                videoPath: generatedVideo?.videoPath,
                caption,
                destination: effectiveDestination
            });
            return res.json();
        },
        onSuccess: (data) => {
            setIsPublishing(false);
            if (data.success) {
                toast({
                    title: "Posted to X! 🎉",
                    description: `Tweet ID: ${data.tweetId}`,
                });
                // Reset form
                setGeneratedVideo(null);
                setPreview(null);
                setCaption("");
            } else {
                toast({
                    variant: "destructive",
                    title: "Publish Failed",
                    description: data.error || "Unknown error",
                });
            }
        },
        onError: (error) => {
            setIsPublishing(false);
            toast({
                variant: "destructive",
                title: "Publish Failed",
                description: String(error),
            });
        }
    });

    const formatFileSize = (bytes: number): string => {
        if (bytes >= 1024 * 1024) {
            return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
        }
        return `${(bytes / 1024).toFixed(1)} KB`;
    };

    const formatDate = (dateStr: string): string => {
        return new Date(dateStr).toLocaleString();
    };

    // Toggle audio playback for a stop
    const toggleStopAudio = (stopIndex: number, audioUrl?: string) => {
        if (!audioUrl) {
            toast({
                title: "Audio Generating...",
                description: "Narration audio is still being generated. It will be ready when you create the video.",
            });
            return;
        }

        // If same stop is playing, pause it
        if (playingStopIndex === stopIndex && audioRef.current) {
            audioRef.current.pause();
            setPlayingStopIndex(null);
            return;
        }

        // Stop any playing audio
        if (audioRef.current) {
            audioRef.current.pause();
        }

        // Create new audio element and play
        const audio = new Audio(audioUrl);
        audioRef.current = audio;
        setPlayingStopIndex(stopIndex);

        audio.play().catch(err => {
            console.error("Audio playback failed:", err);
            setPlayingStopIndex(null);
        });

        audio.onended = () => {
            setPlayingStopIndex(null);
        };
    };

    return (
        <div className="p-6 max-w-5xl mx-auto">
            <h1 className="text-2xl font-bold mb-2">📹 Video Posts</h1>
            <p className="text-muted-foreground mb-8">
                Create AI-narrated travel videos for your profile
            </p>

            {/* Step 1: Import Tour or Quick Generate */}
            <Card className="mb-6">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5" />
                        Step 1: Select Tour
                    </CardTitle>
                    <CardDescription>
                        Import an existing Turai tour or quickly generate a new one
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* Mode Toggle */}
                    <div className="flex gap-2 p-1 bg-muted rounded-lg w-fit">
                        <Button
                            variant={mode === "existing" ? "secondary" : "ghost"}
                            size="sm"
                            onClick={() => setMode("existing")}
                            className="gap-2"
                        >
                            <Link2 className="h-4 w-4" />
                            Import Turai Tour
                        </Button>
                        <Button
                            variant={mode === "new" ? "secondary" : "ghost"}
                            size="sm"
                            onClick={() => setMode("new")}
                            className="gap-2"
                        >
                            <Sparkles className="h-4 w-4" />
                            Quick Generate
                        </Button>
                    </div>

                    {mode === "existing" ? (
                        /* Import Existing Tour Mode */
                        <div className="space-y-4">
                            <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
                                <h4 className="font-medium mb-2">📍 How to get your tour's share code:</h4>
                                <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                                    <li>Create or select a tour in <a href="http://localhost:5050" target="_blank" className="text-primary underline">Turai</a></li>
                                    <li>Click the <strong>Share</strong> button or check the URL</li>
                                    <li>Copy the code (e.g., <code className="bg-muted px-1 rounded">abc123xyz</code>)</li>
                                    <li>Paste it below</li>
                                </ol>
                            </div>

                            <div className="flex gap-4 items-end">
                                <div className="flex-1 space-y-2">
                                    <label className="text-sm font-medium flex items-center gap-2">
                                        <Link2 className="h-4 w-4" />
                                        Turai Share Code
                                    </label>
                                    <Input
                                        placeholder="e.g., abc123xyz"
                                        value={existingShareCode}
                                        onChange={(e) => setExistingShareCode(e.target.value.trim())}
                                    />
                                </div>
                                <Button
                                    onClick={async () => {
                                        if (existingShareCode) {
                                            // Fetch the tour preview using the shareCode with 30s timeout
                                            setIsPreviewing(true);
                                            setPreview(null);

                                            const controller = new AbortController();
                                            const timeoutId = setTimeout(() => controller.abort(), 30000);

                                            try {
                                                const res = await fetch(`/api/video-post/preview/${existingShareCode}?maxStops=10`, {
                                                    signal: controller.signal
                                                });
                                                clearTimeout(timeoutId);
                                                const data = await res.json();

                                                setIsPreviewing(false);
                                                if (data.success) {
                                                    setPreview(data);
                                                    setCustomDestination(data.destination || "");
                                                    toast({
                                                        title: "Tour Loaded! 🎉",
                                                        description: `${data.stops.length} stops ready from "${data.destination}"`,
                                                    });
                                                } else {
                                                    toast({
                                                        variant: "destructive",
                                                        title: "Tour Not Found",
                                                        description: data.error || "Invalid share code. Make sure the tour exists on the same environment (local vs production).",
                                                    });
                                                }
                                            } catch (err: any) {
                                                clearTimeout(timeoutId);
                                                setIsPreviewing(false);

                                                if (err.name === 'AbortError') {
                                                    toast({
                                                        variant: "destructive",
                                                        title: "Request Timed Out",
                                                        description: "Server took too long to respond. Try again or check if Turai is running.",
                                                    });
                                                } else {
                                                    toast({
                                                        variant: "destructive",
                                                        title: "Failed to Load",
                                                        description: String(err),
                                                    });
                                                }
                                            }
                                        }
                                    }}
                                    disabled={!existingShareCode || isPreviewing}
                                >
                                    {isPreviewing ? (
                                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading...</>
                                    ) : (
                                        <><Eye className="mr-2 h-4 w-4" />Load Tour</>
                                    )}
                                </Button>
                            </div>
                        </div>
                    ) : (
                        /* Quick Generate Mode (existing functionality) */
                        <div className="space-y-4">
                            <div className="grid md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium flex items-center gap-2">
                                        <MapPin className="h-4 w-4" />
                                        Destination
                                    </label>
                                    <div className="relative">
                                        <Input
                                            placeholder="e.g., Munich, Germany or select below..."
                                            value={customDestination}
                                            onChange={(e) => {
                                                setCustomDestination(e.target.value);
                                                setDestination("custom");
                                            }}
                                            className="pr-10"
                                        />
                                        <Select
                                            value={destination}
                                            onValueChange={(val) => {
                                                if (val !== "custom") {
                                                    setDestination(val);
                                                    setCustomDestination(val);
                                                }
                                            }}
                                        >
                                            <SelectTrigger className="absolute right-0 top-0 w-10 border-0 bg-transparent">
                                                <span></span>
                                            </SelectTrigger>
                                            <SelectContent>
                                                <div className="text-xs text-muted-foreground px-2 py-1">Popular destinations</div>
                                                {POPULAR_DESTINATIONS.map((dest) => (
                                                    <SelectItem key={dest} value={dest}>{dest}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        Type a custom location or click the dropdown arrow for suggestions
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium flex items-center gap-2">
                                        <Type className="h-4 w-4" />
                                        Topic / Focus (optional)
                                    </label>
                                    <Input
                                        placeholder="e.g., hidden cafes, street art, local food markets"
                                        value={topic}
                                        onChange={(e) => setTopic(e.target.value)}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Add specific themes to customize the tour content
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Stops</label>
                                    <Select value={String(maxStops)} onValueChange={(v) => setMaxStops(Number(v))}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="3">3 stops</SelectItem>
                                            <SelectItem value="5">5 stops</SelectItem>
                                            <SelectItem value="7">7 stops</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Per Stop</label>
                                    <Select value={String(secondsPerStop)} onValueChange={(v) => setSecondsPerStop(Number(v))}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="8">8 seconds</SelectItem>
                                            <SelectItem value="10">10 seconds</SelectItem>
                                            <SelectItem value="12">12 seconds</SelectItem>
                                            <SelectItem value="15">15 seconds</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Est. Duration</label>
                                    <div className="h-10 flex items-center px-3 bg-muted rounded-md text-sm">
                                        <Clock className="h-4 w-4 mr-2 text-muted-foreground" />
                                        ~{maxStops * secondsPerStop}s
                                    </div>
                                </div>
                                <div className="flex items-end">
                                    <Button
                                        className="w-full"
                                        onClick={() => previewMutation.mutate()}
                                        disabled={!effectiveDestination || isPreviewing}
                                    >
                                        {isPreviewing ? (
                                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Previewing...</>
                                        ) : (
                                            <><Eye className="mr-2 h-4 w-4" />Preview Tour</>
                                        )}
                                    </Button>
                                </div>
                            </div>

                            <p className="text-xs text-muted-foreground text-center">
                                💡 Tip: For more control (specialty themes, longer narrations), create your tour in <a href="http://localhost:5050" target="_blank" className="text-primary underline">Turai</a> first, then import it here!
                            </p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Step 2: Preview */}
            {preview && preview.success && (
                <Card className="mb-6 border-primary/50">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Eye className="h-5 w-5" />
                            Step 2: Preview ({preview.stops.length} Stops)
                        </CardTitle>
                        <CardDescription>
                            Review the tour before generating video • ~{preview.estimatedDuration}s
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {preview.stops.map((stop, idx) => (
                                <div
                                    key={idx}
                                    className={`bg-muted rounded-lg overflow-hidden cursor-pointer transition-all hover:ring-2 hover:ring-primary/50 ${playingStopIndex === idx ? 'ring-2 ring-primary' : ''}`}
                                    onClick={() => toggleStopAudio(idx, stop.audioUrl)}
                                >
                                    {/* Image or Placeholder */}
                                    <div className="relative h-32 bg-gradient-to-br from-primary/20 to-secondary/20">
                                        {stop.imageUrl ? (
                                            <img
                                                src={stop.imageUrl}
                                                alt={stop.name}
                                                className="w-full h-full object-cover"
                                                onError={(e) => {
                                                    (e.target as HTMLImageElement).style.display = 'none';
                                                }}
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <div className="text-center">
                                                    <div className="text-4xl font-bold text-primary/40">#{idx + 1}</div>
                                                    <div className="text-xs text-muted-foreground mt-1">{stop.name.substring(0, 20)}</div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Play/Pause Overlay */}
                                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                                            {playingStopIndex === idx ? (
                                                <div className="bg-white/90 rounded-full p-3">
                                                    <Pause className="h-6 w-6 text-primary" />
                                                </div>
                                            ) : (
                                                <div className="bg-white/90 rounded-full p-3">
                                                    <Play className="h-6 w-6 text-primary" />
                                                </div>
                                            )}
                                        </div>

                                        {/* Playing indicator */}
                                        {playingStopIndex === idx && (
                                            <div className="absolute bottom-2 left-2 bg-primary text-white px-2 py-1 rounded text-xs flex items-center gap-1">
                                                <Volume2 className="h-3 w-3 animate-pulse" />
                                                Playing...
                                            </div>
                                        )}

                                        {/* Audio indicator */}
                                        {stop.audioUrl && playingStopIndex !== idx && (
                                            <div className="absolute bottom-2 right-2 bg-black/60 text-white px-2 py-1 rounded text-xs flex items-center gap-1">
                                                <Volume2 className="h-3 w-3" />
                                            </div>
                                        )}
                                    </div>

                                    <div className="p-3">
                                        <div className="flex items-center gap-2 mb-1">
                                            <Badge variant="secondary" className="text-xs">#{idx + 1}</Badge>
                                            <span className="font-medium text-sm truncate">{stop.name}</span>
                                        </div>
                                        <p className="text-xs text-muted-foreground line-clamp-2">
                                            {stop.narrationText || stop.description}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                    <CardFooter className="flex justify-between">
                        <Button variant="outline" onClick={() => setPreview(null)}>
                            <X className="mr-2 h-4 w-4" />
                            Cancel
                        </Button>

                        {/* Output Format Toggle */}
                        <div className="flex gap-1 p-1 bg-muted rounded-lg">
                            <Button
                                variant={outputFormat === "video" ? "secondary" : "ghost"}
                                size="sm"
                                onClick={() => setOutputFormat("video")}
                            >
                                <Video className="mr-1 h-4 w-4" />
                                Video
                            </Button>
                            <Button
                                variant={outputFormat === "thread" ? "secondary" : "ghost"}
                                size="sm"
                                onClick={() => setOutputFormat("thread")}
                            >
                                <ArrowRight className="mr-1 h-4 w-4" />
                                Thread
                            </Button>
                        </div>

                        {outputFormat === "video" ? (
                            <Button
                                onClick={() => generateMutation.mutate()}
                                disabled={isGenerating}
                            >
                                {isGenerating ? (
                                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generating Video...</>
                                ) : (
                                    <><Video className="mr-2 h-4 w-4" />Generate Video</>
                                )}
                            </Button>
                        ) : (
                            <Button
                                onClick={async () => {
                                    if (!preview?.shareCode) {
                                        toast({
                                            variant: "destructive",
                                            title: "Missing Share Code",
                                            description: "Cannot post thread without a tour",
                                        });
                                        return;
                                    }
                                    setIsGenerating(true);
                                    try {
                                        const res = await apiRequest("POST", "/api/thread-tour/post", {
                                            destination: effectiveDestination,
                                            shareCode: preview.shareCode,
                                            maxStops: preview.stops.length,
                                        });
                                        const data = await res.json();
                                        setIsGenerating(false);
                                        if (data.success) {
                                            toast({
                                                title: "Thread Posted! 🧵",
                                                description: `${data.tweets?.filter((t: any) => t.status === 'posted').length || 0} tweets posted to ${effectiveDestination}`,
                                            });
                                            setPreview(null);
                                        } else {
                                            toast({
                                                variant: "destructive",
                                                title: "Thread Failed",
                                                description: data.error || "Unknown error",
                                            });
                                        }
                                    } catch (e) {
                                        setIsGenerating(false);
                                        toast({
                                            variant: "destructive",
                                            title: "Thread Failed",
                                            description: String(e),
                                        });
                                    }
                                }}
                                disabled={isGenerating}
                                className="bg-blue-600 hover:bg-blue-700"
                            >
                                {isGenerating ? (
                                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Posting Thread...</>
                                ) : (
                                    <><Send className="mr-2 h-4 w-4" />Post Thread ({preview.stops.length + 2} tweets)</>
                                )}
                            </Button>
                        )}
                    </CardFooter>
                </Card>
            )}

            {/* Step 3: Video Ready + Publish */}
            {generatedVideo && generatedVideo.success && (
                <Card className="mb-6 border-green-500/50 bg-green-500/5">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-green-600">
                            <Check className="h-5 w-5" />
                            Step 3: Video Ready!
                        </CardTitle>
                        <CardDescription>
                            {generatedVideo.destination} • {generatedVideo.duration}s
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* Video Player */}
                        <div className="bg-black rounded-lg overflow-hidden max-w-sm mx-auto">
                            <video
                                controls
                                className="w-full aspect-[9/16]"
                                src={`/api/video-slideshow/stream?path=${encodeURIComponent(generatedVideo.videoPath || '')}`}
                            />
                        </div>

                        {/* Caption Editor */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Caption</label>
                            <Textarea
                                value={caption}
                                onChange={(e) => setCaption(e.target.value)}
                                rows={3}
                                placeholder="Write your tweet caption..."
                            />
                            <p className="text-xs text-muted-foreground text-right">
                                {caption.length}/280 characters
                            </p>
                        </div>
                    </CardContent>
                    <CardFooter className="flex justify-between">
                        <a href={generatedVideo.videoPath} download>
                            <Button variant="outline">
                                <Download className="mr-2 h-4 w-4" />
                                Download
                            </Button>
                        </a>
                        <Button
                            onClick={() => publishMutation.mutate()}
                            disabled={isPublishing || !caption.trim()}
                        >
                            {isPublishing ? (
                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Posting...</>
                            ) : (
                                <><Send className="mr-2 h-4 w-4" />Post to X</>
                            )}
                        </Button>
                    </CardFooter>
                </Card>
            )}

            {/* Generated Videos Library */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <Film className="h-5 w-5" />
                            Video Library
                        </CardTitle>
                        <CardDescription>
                            {videosData?.videos?.length || 0} videos
                        </CardDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => refetchVideos()} disabled={isRefetching}>
                        <RefreshCw className={`h-4 w-4 mr-2 ${isRefetching ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                </CardHeader>
                <CardContent>
                    {(!videosData?.videos || videosData.videos.length === 0) ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <Film className="h-12 w-12 mx-auto mb-4 opacity-50" />
                            <p>No videos generated yet</p>
                            <p className="text-sm">Create your first video above!</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {videosData.videos.slice(0, 10).map((video) => (
                                <div
                                    key={video.filename}
                                    className="flex items-center justify-between p-3 bg-muted rounded-lg hover:bg-muted/80 transition-colors"
                                >
                                    <div
                                        className="flex items-center gap-3 cursor-pointer flex-1"
                                        onClick={() => setSelectedVideo(video)}
                                    >
                                        <div className="w-10 h-10 bg-primary/20 rounded flex items-center justify-center">
                                            <Play className="h-5 w-5 text-primary" />
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
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (confirm(`Delete ${video.filename}?`)) {
                                                    fetch(`/api/video-post/delete?path=${encodeURIComponent(video.path)}`, {
                                                        method: 'DELETE'
                                                    }).then(() => refetchVideos()).catch(console.error);
                                                }
                                            }}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Daily Video Scheduler */}
            {schedulerStatus && (
                <Card className="mt-6">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Calendar className="h-5 w-5" />
                            Daily Scheduled Video
                        </CardTitle>
                        <CardDescription>
                            Auto-posts a video to your profile daily
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid md:grid-cols-3 gap-4">
                            <div className="space-y-1">
                                <span className="text-sm text-muted-foreground">Status</span>
                                <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full ${schedulerStatus.active ? 'bg-green-500' : 'bg-red-500'}`} />
                                    <span className="font-medium">{schedulerStatus.active ? 'Active' : 'Inactive'}</span>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <span className="text-sm text-muted-foreground">Scheduled Time</span>
                                <p className="font-medium">{schedulerStatus.scheduledTime} {schedulerStatus.timezone}</p>
                            </div>
                            <div className="space-y-1">
                                <span className="text-sm text-muted-foreground">Queue Position</span>
                                <p className="font-medium">{schedulerStatus.queuePosition} / {schedulerStatus.queueTotal}</p>
                            </div>
                        </div>

                        <div className="mt-4 p-4 bg-muted rounded-lg">
                            <div className="flex items-center gap-2 mb-2">
                                <Badge variant="outline">Next Post</Badge>
                            </div>
                            <p className="font-medium">{schedulerStatus.nextDestination}</p>
                            {schedulerStatus.nextTopic && (
                                <p className="text-sm text-muted-foreground mt-1">{schedulerStatus.nextTopic}</p>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Video Player Modal */}
            {selectedVideo && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm" onClick={() => setSelectedVideo(null)}>
                    <div className="relative w-full max-w-lg bg-card border rounded-lg shadow-lg p-2" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center p-2">
                            <h3 className="font-semibold truncate pr-4">{selectedVideo.filename}</h3>
                            <Button variant="ghost" size="sm" onClick={() => setSelectedVideo(null)}>Close</Button>
                        </div>
                        <video
                            controls
                            autoPlay
                            className="w-full rounded bg-black aspect-[9/16]"
                            src={`/api/video-slideshow/stream?path=${encodeURIComponent(selectedVideo.path)}`}
                        />
                        <div className="p-4">
                            <a href={selectedVideo.path} download={selectedVideo.filename}>
                                <Button variant="outline" size="sm">
                                    <Download className="h-4 w-4 mr-2" /> Download
                                </Button>
                            </a>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
