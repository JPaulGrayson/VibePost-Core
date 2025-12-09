import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Send, Clock, MapPin, ListOrdered, ChevronRight, RefreshCw } from "lucide-react";

export default function ThreadTours() {
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const [tourSource, setTourSource] = useState<'auto' | 'custom' | 'famous'>('auto');
    const [customDestination, setCustomDestination] = useState('');
    const [selectedFamousTour, setSelectedFamousTour] = useState('');
    const [maxStops, setMaxStops] = useState('5');
    const [isPosting, setIsPosting] = useState(false);

    // Fetch scheduler status
    const { data: schedulerStatus, refetch: refetchStatus } = useQuery({
        queryKey: ["/api/thread-tour/scheduler-status"],
        refetchInterval: 30000
    });

    // Fetch destinations
    const { data: destinationsData } = useQuery({
        queryKey: ["/api/thread-tour/destinations"]
    });

    // Fetch famous tours
    const { data: famousToursData } = useQuery({
        queryKey: ["/api/thread-tour/famous-tours"]
    });

    // Post thread tour
    const postMutation = useMutation({
        mutationFn: async (params: { destination: string; maxStops: number; shareCode?: string }) => {
            return apiRequest("POST", "/api/thread-tour/post", params);
        },
        onSuccess: (data: any) => {
            if (data.success) {
                const postedCount = data.tweets?.filter((t: any) => t.status === 'posted').length || 0;
                toast({
                    title: "Thread Posted! 🧵",
                    description: `${postedCount} tweets in thread for ${data.destination}`
                });
                refetchStatus();
            } else {
                toast({
                    title: "Thread Failed",
                    description: data.error || "Unknown error",
                    variant: "destructive"
                });
            }
            setIsPosting(false);
        },
        onError: (error: any) => {
            toast({
                title: "Error",
                description: error.message || "Failed to post thread",
                variant: "destructive"
            });
            setIsPosting(false);
        }
    });

    // Set next destination
    const setNextMutation = useMutation({
        mutationFn: async (destination: string) => {
            return apiRequest("POST", "/api/thread-tour/set-next", { destination });
        },
        onSuccess: () => {
            toast({ title: "Next destination set!" });
            refetchStatus();
        }
    });

    const handlePostNow = () => {
        setIsPosting(true);

        let destination = '';
        let shareCode: string | undefined;

        if (tourSource === 'custom') {
            destination = customDestination;
        } else if (tourSource === 'famous' && selectedFamousTour) {
            const tour = famousToursData?.tours?.find((t: any) => t.id === selectedFamousTour);
            if (tour) {
                destination = tour.destination;
                shareCode = tour.shareCode;
            }
        } else {
            destination = destinationsData?.todaysDestination || schedulerStatus?.nextDestination;
        }

        if (!destination) {
            toast({ title: "Select a destination", variant: "destructive" });
            setIsPosting(false);
            return;
        }

        postMutation.mutate({
            destination,
            maxStops: parseInt(maxStops),
            shareCode
        });
    };

    const handleSetNext = () => {
        let destination = '';
        if (tourSource === 'custom') {
            destination = customDestination;
        } else if (tourSource === 'famous' && selectedFamousTour) {
            const tour = famousToursData?.tours?.find((t: any) => t.id === selectedFamousTour);
            destination = tour?.destination || '';
        }

        if (destination) {
            setNextMutation.mutate(destination);
        }
    };

    return (
        <div className="container mx-auto p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">🧵 Thread Tours</h1>
                    <p className="text-muted-foreground">
                        Post multi-tweet tour threads with images and narration
                    </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => refetchStatus()}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh
                </Button>
            </div>

            {/* Scheduler Status */}
            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Clock className="w-5 h-5" />
                            Scheduler Status
                        </CardTitle>
                        <Badge variant={schedulerStatus?.active ? "default" : "secondary"}>
                            {schedulerStatus?.active ? "Active" : "Inactive"}
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent className="space-y-2">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <span className="text-muted-foreground">Scheduled Time:</span>
                            <p className="font-medium">{schedulerStatus?.scheduledTime || "18:00"} {schedulerStatus?.timezone || "CST"}</p>
                        </div>
                        <div>
                            <span className="text-muted-foreground">Next Destination:</span>
                            <p className="font-medium">{schedulerStatus?.nextDestination || "Loading..."}</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Tour Selection */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <MapPin className="w-5 h-5" />
                        Tour Source
                    </CardTitle>
                    <CardDescription>
                        Choose how to select the destination for your thread tour
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <RadioGroup value={tourSource} onValueChange={(v: any) => setTourSource(v)}>
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="auto" id="auto" />
                            <Label htmlFor="auto" className="flex-1">
                                <span className="font-medium">Auto (Curated List)</span>
                                <p className="text-sm text-muted-foreground">
                                    Uses today's destination: {destinationsData?.todaysDestination || "Loading..."}
                                </p>
                            </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="custom" id="custom" />
                            <Label htmlFor="custom" className="flex-1">
                                <span className="font-medium">Custom Location</span>
                                <p className="text-sm text-muted-foreground">Enter any destination</p>
                            </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="famous" id="famous" />
                            <Label htmlFor="famous" className="flex-1">
                                <span className="font-medium">Famous Tours</span>
                                <p className="text-sm text-muted-foreground">Use pre-built tours from Turai</p>
                            </Label>
                        </div>
                    </RadioGroup>

                    {tourSource === 'custom' && (
                        <div className="space-y-2">
                            <Label>Destination</Label>
                            <Input
                                placeholder="e.g., Kyoto, Japan"
                                value={customDestination}
                                onChange={(e) => setCustomDestination(e.target.value)}
                            />
                        </div>
                    )}

                    {tourSource === 'famous' && (
                        <div className="space-y-2">
                            <Label>Famous Tour</Label>
                            <Select value={selectedFamousTour} onValueChange={setSelectedFamousTour}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select a famous tour" />
                                </SelectTrigger>
                                <SelectContent>
                                    {famousToursData?.tours?.map((tour: any) => (
                                        <SelectItem key={tour.id} value={tour.id}>
                                            {tour.name} ({tour.stops} stops)
                                        </SelectItem>
                                    ))}
                                    {(!famousToursData?.tours || famousToursData.tours.length === 0) && (
                                        <SelectItem value="none" disabled>No famous tours found</SelectItem>
                                    )}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                            <ListOrdered className="w-4 h-4" />
                            Max Stops
                        </Label>
                        <Select value={maxStops} onValueChange={setMaxStops}>
                            <SelectTrigger className="w-32">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="3">3 stops</SelectItem>
                                <SelectItem value="4">4 stops</SelectItem>
                                <SelectItem value="5">5 stops</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
                <CardFooter className="flex gap-3">
                    <Button
                        onClick={handlePostNow}
                        disabled={isPosting}
                        className="flex-1"
                    >
                        {isPosting ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Posting Thread...
                            </>
                        ) : (
                            <>
                                <Send className="w-4 h-4 mr-2" />
                                Post Now
                            </>
                        )}
                    </Button>
                    {tourSource !== 'auto' && (
                        <Button
                            variant="outline"
                            onClick={handleSetNext}
                            disabled={setNextMutation.isPending}
                        >
                            Set as Next
                        </Button>
                    )}
                </CardFooter>
            </Card>

            {/* Recent Thread Tours */}
            <Card>
                <CardHeader>
                    <CardTitle>Thread Format Preview</CardTitle>
                    <CardDescription>How the thread will appear on X</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3 text-sm">
                        <div className="p-3 bg-muted rounded-lg">
                            <p className="font-medium">Tweet 1 (Intro):</p>
                            <p className="text-muted-foreground">🗺️ Explore [Destination]! 🧵 A 5-stop AI-guided tour... 👇</p>
                            <p className="text-xs mt-1">[Postcard image]</p>
                        </div>
                        <div className="flex items-center justify-center">
                            <ChevronRight className="w-4 h-4 text-muted-foreground rotate-90" />
                        </div>
                        <div className="p-3 bg-muted rounded-lg">
                            <p className="font-medium">Tweet 2-6 (Stops):</p>
                            <p className="text-muted-foreground">📍 Stop 1: [POI Name] - [Narration excerpt] 1/5</p>
                            <p className="text-xs mt-1">[POI image]</p>
                        </div>
                        <div className="flex items-center justify-center">
                            <ChevronRight className="w-4 h-4 text-muted-foreground rotate-90" />
                        </div>
                        <div className="p-3 bg-muted rounded-lg">
                            <p className="font-medium">Final Tweet (CTA):</p>
                            <p className="text-muted-foreground">🪄 Want the full audio tour? Claim your free guide: turai.org/claim</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Destinations List */}
            <Card>
                <CardHeader>
                    <CardTitle>Curated Destinations</CardTitle>
                    <CardDescription>Destinations in the auto-rotation</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap gap-2">
                        {destinationsData?.destinations?.map((dest: string) => (
                            <Badge
                                key={dest}
                                variant={dest === destinationsData?.todaysDestination ? "default" : "outline"}
                                className="cursor-pointer"
                                onClick={() => {
                                    setTourSource('custom');
                                    setCustomDestination(dest);
                                }}
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
