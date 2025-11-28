import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Check, X, Edit } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { PostcardDraft } from "@shared/schema";

export default function ReviewQueue() {
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const { data: drafts, isLoading } = useQuery<PostcardDraft[]>({
        queryKey: ["postcard-drafts"],
        queryFn: async () => {
            const res = await fetch("/api/postcard-drafts");
            if (!res.ok) throw new Error("Failed to fetch drafts");
            return res.json();
        },
    });

    const approveMutation = useMutation({
        mutationFn: async (id: number) => {
            const res = await fetch(`/api/postcard-drafts/${id}/approve`, { method: "POST" });
            if (!res.ok) throw new Error("Failed to approve");
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["postcard-drafts"] });
            toast({ title: "Draft Approved", description: "Postcard has been published!" });
        },
        onError: () => {
            toast({ title: "Error", description: "Failed to approve draft", variant: "destructive" });
        },
    });

    const rejectMutation = useMutation({
        mutationFn: async (id: number) => {
            const res = await fetch(`/api/postcard-drafts/${id}/reject`, { method: "POST" });
            if (!res.ok) throw new Error("Failed to reject");
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["postcard-drafts"] });
            toast({ title: "Draft Rejected" });
        },
    });

    const updateMutation = useMutation({
        mutationFn: async ({ id, text }: { id: number; text: string }) => {
            const res = await fetch(`/api/postcard-drafts/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ draftText: text }),
            });
            if (!res.ok) throw new Error("Failed to update");
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["postcard-drafts"] });
            toast({ title: "Draft Updated" });
        },
    });

    if (isLoading) {
        return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;
    }

    const pendingDrafts = drafts?.filter(d => d.status === "pending_review") || [];

    return (
        <div className="container mx-auto p-6">
            <h1 className="text-3xl font-bold mb-6">Sniper Review Queue</h1>

            {pendingDrafts.length === 0 ? (
                <div className="text-center text-muted-foreground p-12">
                    No pending drafts. The sniper is waiting for targets...
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {pendingDrafts.map((draft) => (
                        <DraftCard
                            key={draft.id}
                            draft={draft}
                            onApprove={() => approveMutation.mutate(draft.id)}
                            onReject={() => rejectMutation.mutate(draft.id)}
                            onUpdate={(text) => updateMutation.mutate({ id: draft.id, text })}
                            isProcessing={approveMutation.isPending || rejectMutation.isPending}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function DraftCard({ draft, onApprove, onReject, onUpdate, isProcessing }: {
    draft: PostcardDraft;
    onApprove: () => void;
    onReject: () => void;
    onUpdate: (text: string) => void;
    isProcessing: boolean;
}) {
    const [isEditing, setIsEditing] = useState(false);
    const [text, setText] = useState(draft.draftText);

    const handleSave = () => {
        onUpdate(text);
        setIsEditing(false);
    };

    return (
        <Card className="flex flex-col">
            <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                    Replying to @{draft.originalAuthorHandle}
                </CardTitle>
                <Badge variant="outline" className="w-fit">{draft.detectedLocation}</Badge>
            </CardHeader>
            <CardContent className="flex-grow space-y-4">
                {/* Image Placeholder - In real app, use draft.turaiImageUrl */}
                <div className="aspect-video bg-muted rounded-md flex items-center justify-center overflow-hidden">
                    {draft.turaiImageUrl && !draft.turaiImageUrl.includes("mock") ? (
                        <img src={draft.turaiImageUrl} alt="Postcard" className="object-cover w-full h-full" />
                    ) : (
                        <span className="text-xs text-muted-foreground">Mock Image: {draft.detectedLocation}</span>
                    )}
                </div>

                {isEditing ? (
                    <Textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        className="min-h-[100px]"
                    />
                ) : (
                    <p className="text-sm">{draft.draftText}</p>
                )}
            </CardContent>
            <CardFooter className="flex justify-between gap-2">
                {isEditing ? (
                    <Button size="sm" onClick={handleSave} disabled={isProcessing}>Save</Button>
                ) : (
                    <Button size="sm" variant="ghost" onClick={() => setIsEditing(true)} disabled={isProcessing}>
                        <Edit className="h-4 w-4 mr-1" /> Edit
                    </Button>
                )}

                <div className="flex gap-2">
                    <Button size="sm" variant="destructive" onClick={onReject} disabled={isProcessing}>
                        <X className="h-4 w-4" />
                    </Button>
                    <Button size="sm" onClick={onApprove} disabled={isProcessing}>
                        <Check className="h-4 w-4 mr-1" /> Send
                    </Button>
                </div>
            </CardFooter>
        </Card>
    );
}
