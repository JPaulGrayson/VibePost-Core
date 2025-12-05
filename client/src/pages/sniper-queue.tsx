import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { PostcardDraft } from "@shared/schema";
import { RefreshCw } from "lucide-react";

export default function SniperQueue() {
    const { data: drafts, isLoading } = useQuery<PostcardDraft[]>({
        queryKey: ["/api/postcard-drafts"],
        refetchInterval: 30000 // Poll for new drafts every 30s
    });

    const [searchQuery, setSearchQuery] = useState("");

    const filteredDrafts = drafts?.filter(draft =>
        draft.originalAuthorHandle.toLowerCase().includes(searchQuery.toLowerCase()) ||
        draft.originalTweetText.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (draft.detectedLocation && draft.detectedLocation.toLowerCase().includes(searchQuery.toLowerCase()))
    ).sort((a, b) => (b.score || 0) - (a.score || 0)); // Sort by Score DESC

    const manualHunt = useMutation({
        mutationFn: async () => {
            const res = await apiRequest("POST", "/api/debug/hunt");
            return res.json();
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["/api/postcard-drafts"] });
            alert(`Hunt Complete! Generated ${data.result?.draftsGenerated || 0} new drafts.`);
        },
        onError: (error) => {
            console.error("Hunt failed:", error);
            alert("Manual hunt failed. Check console.");
        }
    });

    if (isLoading) return <div>Loading Queue...</div>;

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold mb-6">🧙‍♂️ Wizard's Tower (Review Queue)</h1>

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
                            Manual Hunt
                        </>
                    )}
                </Button>
            </div>

            <div className="grid gap-6">
                {filteredDrafts?.map((draft) => (
                    <DraftCard key={draft.id} draft={draft} />
                ))}
                {filteredDrafts?.length === 0 && <p>No drafts found matching your search.</p>}
            </div>
        </div>
    );
}

function DraftCard({ draft }: { draft: PostcardDraft }) {
    const [text, setText] = useState(draft.draftReplyText || "");
    const score = draft.score || 0;

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
        },
        onError: (error) => {
            console.error("Failed to publish:", error);
            alert("Failed to publish draft. Check console for details.");
        }
    });

    const reject = useMutation({
        mutationFn: async () => {
            await apiRequest("POST", `/api/postcard-drafts/${draft.id}/reject`);
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/postcard-drafts"] })
    });

    const regenerateImage = useMutation({
        mutationFn: async () => {
            await apiRequest("POST", `/api/postcard-drafts/${draft.id}/regenerate-image`);
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/postcard-drafts"] })
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
