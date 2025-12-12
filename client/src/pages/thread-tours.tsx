import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Send, Clock, MapPin, ListOrdered, ChevronRight, RefreshCw, Flame, Globe } from "lucide-react";

// Preset topic categories for quick selection
const TOPIC_PRESETS = {
    disasters: {
        label: "🌪️ Disasters & Tragedies",
        topics: [
            { name: "Plane Crashes", keywords: "plane crash site, aviation disaster memorial, crash investigation" },
            { name: "Weather Disasters", keywords: "hurricane damage, tornado aftermath, flood zone, natural disaster site" },
            { name: "Historic Tragedies", keywords: "tragedy memorial, disaster site, historical disaster" },
        ]
    },
    historical: {
        label: "📜 Historical Events",
        topics: [
            { name: "Assassination Sites", keywords: "assassination location, historic murder, political violence" },
            { name: "Cold War Landmarks", keywords: "Berlin Wall, spy site, Cold War bunker, Iron Curtain" },
            { name: "Holocaust Memorials", keywords: "Holocaust memorial, concentration camp, WWII memorial" },
        ]
    },
    seasonal: {
        label: "🎄 Seasonal & Holiday",
        topics: [
            { name: "Christmas Markets", keywords: "Christmas market, holiday lights, winter wonderland" },
            { name: "New Year's Eve", keywords: "New Year celebration, fireworks, countdown location, ball drop, midnight celebration" },
            { name: "Cherry Blossom", keywords: "cherry blossom, sakura, spring flowers" },
        ]
    },
    trueCrime: {
        label: "🔍 True Crime & Controversy",
        topics: [
            { name: "Famous Heist Locations", keywords: "bank heist, robbery site, famous theft" },
            { name: "Historic Prisons", keywords: "famous prison, Alcatraz, historic jail" },
            { name: "Crime Scene Tours", keywords: "crime scene, murder location, criminal history" },
        ]
    },
    custom: {
        label: "✏️ Custom Topic",
        topics: []
    }
};

// Geographic scope presets
const GEOGRAPHIC_SCOPES = {
    world: { label: "🌍 World / Global", value: "World" },
    regions: {
        label: "🌎 Regions",
        options: [
            { label: "North America", value: "North America" },
            { label: "Europe", value: "Europe" },
            { label: "Asia", value: "Asia" },
            { label: "Australia & Oceania", value: "Australia and Oceania" },
            { label: "South America", value: "South America" },
            { label: "Africa", value: "Africa" },
            { label: "Middle East", value: "Middle East" },
        ]
    },
    countries: {
        label: "🏳️ Countries",
        options: [
            { label: "🇺🇸 United States", value: "United States" },
            { label: "🇬🇧 United Kingdom", value: "United Kingdom" },
            { label: "🇩🇪 Germany", value: "Germany" },
            { label: "🇫🇷 France", value: "France" },
            { label: "🇮🇹 Italy", value: "Italy" },
            { label: "🇪🇸 Spain", value: "Spain" },
            { label: "🇯🇵 Japan", value: "Japan" },
            { label: "🇨🇳 China", value: "China" },
            { label: "🇦🇺 Australia", value: "Australia" },
            { label: "🇧🇷 Brazil", value: "Brazil" },
            { label: "🇲🇽 Mexico", value: "Mexico" },
            { label: "🇨🇦 Canada", value: "Canada" },
        ]
    },
    usStates: {
        label: "🇺🇸 US States",
        options: [
            { label: "California", value: "California, USA" },
            { label: "New York", value: "New York, USA" },
            { label: "Texas", value: "Texas, USA" },
            { label: "Florida", value: "Florida, USA" },
            { label: "Nevada", value: "Nevada, USA" },
            { label: "Hawaii", value: "Hawaii, USA" },
            { label: "Colorado", value: "Colorado, USA" },
            { label: "Arizona", value: "Arizona, USA" },
            { label: "Washington", value: "Washington, USA" },
            { label: "Illinois", value: "Illinois, USA" },
            { label: "Massachusetts", value: "Massachusetts, USA" },
            { label: "Pennsylvania", value: "Pennsylvania, USA" },
        ]
    }
};

export default function ThreadTours() {
    const { toast } = useToast();
    const queryClient = useQueryClient();

    // Destinations tab state
    const [tourSource, setTourSource] = useState<'auto' | 'custom' | 'famous'>('auto');
    const [customDestination, setCustomDestination] = useState('');
    const [selectedFamousTour, setSelectedFamousTour] = useState('');
    const [maxStops, setMaxStops] = useState('5');
    const [isPosting, setIsPosting] = useState(false);

    // Topics tab state
    const [topicCategory, setTopicCategory] = useState('');
    const [selectedTopic, setSelectedTopic] = useState('');
    const [geographicScope, setGeographicScope] = useState<'world' | 'region' | 'country' | 'state' | 'custom'>('world');
    const [topicLocation, setTopicLocation] = useState('World');
    const [customKeywords, setCustomKeywords] = useState('');


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

    // Post thread tour (destination-based)
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

    // Post topic-based tour
    const postTopicMutation = useMutation({
        mutationFn: async (params: { location: string; focus: string; maxStops: number }) => {
            return apiRequest("POST", "/api/thread-tour/post-topic", params);
        },
        onSuccess: (data: any) => {
            if (data.success) {
                const postedCount = data.tweets?.filter((t: any) => t.status === 'posted').length || 0;
                toast({
                    title: "Topic Tour Posted! 🔥",
                    description: `${postedCount} tweets about "${data.topic}" in ${data.location}`
                });
                refetchStatus();
            } else {
                toast({
                    title: "Topic Tour Failed",
                    description: data.error || "Unknown error",
                    variant: "destructive"
                });
            }
            setIsPosting(false);
        },
        onError: (error: any) => {
            toast({
                title: "Error",
                description: error.message || "Failed to post topic tour",
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

    const handlePostTopicNow = () => {
        if (!topicLocation) {
            toast({ title: "Enter a location", variant: "destructive" });
            return;
        }

        // Get keywords from selected topic or custom input
        let keywords = customKeywords;
        if (topicCategory && selectedTopic && topicCategory !== 'custom') {
            const category = TOPIC_PRESETS[topicCategory as keyof typeof TOPIC_PRESETS];
            const topic = category?.topics?.find(t => t.name === selectedTopic);
            keywords = topic?.keywords || customKeywords;
        }

        if (!keywords) {
            toast({ title: "Enter keywords or select a topic", variant: "destructive" });
            return;
        }

        setIsPosting(true);
        postTopicMutation.mutate({
            location: topicLocation,
            focus: keywords,
            maxStops: parseInt(maxStops)
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

    const handleCategoryChange = (category: string) => {
        setTopicCategory(category);
        setSelectedTopic('');
        if (category === 'custom') {
            setCustomKeywords('');
        }
    };

    const handleTopicSelect = (topicName: string) => {
        setSelectedTopic(topicName);
        // Pre-fill the keywords from the selected topic
        const category = TOPIC_PRESETS[topicCategory as keyof typeof TOPIC_PRESETS];
        const topic = category?.topics?.find(t => t.name === topicName);
        if (topic) {
            setCustomKeywords(topic.keywords);
        }
    };

    return (
        <div className="container mx-auto p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">🧵 Thread Tours</h1>
                    <p className="text-muted-foreground">
                        Post multi-tweet tour threads with video and narration
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

            {/* Main Tabs: Destinations vs Topics */}
            <Tabs defaultValue="destinations" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="destinations" className="flex items-center gap-2">
                        <Globe className="w-4 h-4" />
                        Destinations
                    </TabsTrigger>
                    <TabsTrigger value="topics" className="flex items-center gap-2">
                        <Flame className="w-4 h-4" />
                        Topics
                    </TabsTrigger>
                </TabsList>

                {/* Destinations Tab */}
                <TabsContent value="destinations">
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
                </TabsContent>

                {/* Topics Tab */}
                <TabsContent value="topics">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Flame className="w-5 h-5" />
                                Topic-Based Tours
                            </CardTitle>
                            <CardDescription>
                                Generate tours based on themes, events, or custom keywords
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {/* Geographic Scope */}
                            <div className="space-y-3">
                                <Label>Geographic Scope *</Label>
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                                    <Button
                                        variant={geographicScope === 'world' ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={() => {
                                            setGeographicScope('world');
                                            setTopicLocation('World');
                                        }}
                                    >
                                        🌍 World
                                    </Button>
                                    <Button
                                        variant={geographicScope === 'region' ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={() => setGeographicScope('region')}
                                    >
                                        🌎 Region
                                    </Button>
                                    <Button
                                        variant={geographicScope === 'country' ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={() => setGeographicScope('country')}
                                    >
                                        🏳️ Country
                                    </Button>
                                    <Button
                                        variant={geographicScope === 'state' ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={() => setGeographicScope('state')}
                                    >
                                        🇺🇸 US State
                                    </Button>
                                    <Button
                                        variant={geographicScope === 'custom' ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={() => {
                                            setGeographicScope('custom');
                                            setTopicLocation('');
                                        }}
                                    >
                                        ✏️ Custom
                                    </Button>
                                </div>

                                {/* Secondary selector based on scope */}
                                {geographicScope === 'region' && (
                                    <Select value={topicLocation} onValueChange={setTopicLocation}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select a region" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {GEOGRAPHIC_SCOPES.regions.options.map((opt) => (
                                                <SelectItem key={opt.value} value={opt.value}>
                                                    {opt.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}

                                {geographicScope === 'country' && (
                                    <Select value={topicLocation} onValueChange={setTopicLocation}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select a country" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {GEOGRAPHIC_SCOPES.countries.options.map((opt) => (
                                                <SelectItem key={opt.value} value={opt.value}>
                                                    {opt.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}

                                {geographicScope === 'state' && (
                                    <Select value={topicLocation} onValueChange={setTopicLocation}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select a US state" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {GEOGRAPHIC_SCOPES.usStates.options.map((opt) => (
                                                <SelectItem key={opt.value} value={opt.value}>
                                                    {opt.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}

                                {geographicScope === 'custom' && (
                                    <Input
                                        placeholder="e.g., New York City, Tokyo, or Bavaria"
                                        value={topicLocation}
                                        onChange={(e) => setTopicLocation(e.target.value)}
                                    />
                                )}

                                <p className="text-xs text-muted-foreground">
                                    Current: <span className="font-medium">{topicLocation || 'None selected'}</span>
                                </p>
                            </div>

                            {/* Topic Category */}
                            <div className="space-y-2">
                                <Label>Topic Category</Label>
                                <Select value={topicCategory} onValueChange={handleCategoryChange}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a category or choose custom" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {Object.entries(TOPIC_PRESETS).map(([key, category]) => (
                                            <SelectItem key={key} value={key}>
                                                {category.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Preset Topics */}
                            {topicCategory && topicCategory !== 'custom' && TOPIC_PRESETS[topicCategory as keyof typeof TOPIC_PRESETS]?.topics.length > 0 && (
                                <div className="space-y-2">
                                    <Label>Select Topic</Label>
                                    <div className="flex flex-wrap gap-2">
                                        {TOPIC_PRESETS[topicCategory as keyof typeof TOPIC_PRESETS]?.topics.map((topic) => (
                                            <Badge
                                                key={topic.name}
                                                variant={selectedTopic === topic.name ? "default" : "outline"}
                                                className="cursor-pointer hover:bg-primary/10"
                                                onClick={() => handleTopicSelect(topic.name)}
                                            >
                                                {topic.name}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Custom Keywords */}
                            <div className="space-y-2">
                                <Label>Qualifying Words / Phrases *</Label>
                                <Textarea
                                    placeholder="Enter keywords that describe what you're looking for, e.g.:&#10;plane crash site, aviation disaster memorial, crash investigation&#10;&#10;or&#10;&#10;Christmas market, holiday lights, winter decorations, festive atmosphere"
                                    value={customKeywords}
                                    onChange={(e) => setCustomKeywords(e.target.value)}
                                    rows={4}
                                />
                                <p className="text-xs text-muted-foreground">
                                    These keywords help Gemini find relevant locations. Be specific for better results.
                                </p>
                            </div>

                            {/* Max Stops */}
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
                        <CardFooter>
                            <Button
                                onClick={handlePostTopicNow}
                                disabled={isPosting || !topicLocation || !customKeywords}
                                className="flex-1"
                            >
                                {isPosting ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Generating Topic Tour...
                                    </>
                                ) : (
                                    <>
                                        <Flame className="w-4 h-4 mr-2" />
                                        Post Topic Tour
                                    </>
                                )}
                            </Button>
                        </CardFooter>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Thread Format Preview */}
            <Card>
                <CardHeader>
                    <CardTitle>Thread Format Preview</CardTitle>
                    <CardDescription>How the thread will appear on X</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3 text-sm">
                        <div className="p-3 bg-muted rounded-lg">
                            <p className="font-medium">Tweet 1 (Intro):</p>
                            <p className="text-muted-foreground">🗺️ Explore [Location]! 🧵 A 5-stop AI-guided tour... 👇</p>
                            <p className="text-xs mt-1">[Cover image]</p>
                        </div>
                        <div className="flex items-center justify-center">
                            <ChevronRight className="w-4 h-4 text-muted-foreground rotate-90" />
                        </div>
                        <div className="p-3 bg-muted rounded-lg">
                            <p className="font-medium">Tweet 2-6 (Stops):</p>
                            <p className="text-muted-foreground">📍 Stop 1: [POI Name] - [Narration excerpt] 1/5</p>
                            <p className="text-xs mt-1">[Multi-image video with Ken Burns effect + audio]</p>
                        </div>
                        <div className="flex items-center justify-center">
                            <ChevronRight className="w-4 h-4 text-muted-foreground rotate-90" />
                        </div>
                        <div className="p-3 bg-muted rounded-lg">
                            <p className="font-medium">Final Tweet (CTA):</p>
                            <p className="text-muted-foreground">✨ Enjoyed this tour? Explore more at turai.org</p>
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
