import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Heart, MessageCircle, Repeat2, ThumbsUp, Trash2 } from "lucide-react";
import { Twitter } from "lucide-react";
import { SiDiscord, SiReddit } from "react-icons/si";
import type { Post } from "@shared/schema";
import { format } from "date-fns";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function RecentPosts() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: posts = [] } = useQuery<Post[]>({
    queryKey: ["/api/posts"],
    select: (data) => data.slice(0, 5), // Only show recent 5 posts
  });

  const deletePostMutation = useMutation({
    mutationFn: async (postId: number) => {
      const response = await fetch(`/api/posts/${postId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        if (response.status === 404) {
          // Post already deleted, just refresh the cache
          queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
          return { success: true, alreadyDeleted: true };
        }
        throw new Error("Failed to delete post");
      }
      // Handle 204 No Content response - successful deletion
      if (response.status === 204) {
        return { success: true };
      }
      return response.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      if (result?.alreadyDeleted) {
        toast({
          title: "Post removed",
          description: "The post was already deleted.",
        });
      } else {
        toast({
          title: "Post deleted",
          description: "The post has been successfully deleted.",
        });
      }
    },
    onError: (error) => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      toast({
        title: "Error",
        description: "Failed to delete post. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleDelete = async (postId: number) => {
    if (confirm("Are you sure you want to delete this post? This action cannot be undone.")) {
      deletePostMutation.mutate(postId);
    }
  };

  const platformIcons = {
    twitter: Twitter,
    discord: SiDiscord,
    reddit: SiReddit,
  };

  const platformColors = {
    twitter: "text-blue-400",
    discord: "text-indigo-500",
    reddit: "text-orange-500",
  };

  const statusColors = {
    draft: "bg-gray-100 text-gray-600",
    published: "bg-green-100 text-green-700",
    failed: "bg-red-100 text-red-700",
    scheduled: "bg-yellow-100 text-yellow-700",
  };

  const getStatusIndicator = (status: string) => {
    const colors = {
      draft: "bg-gray-300",
      published: "bg-green-500",
      failed: "bg-red-500",
      scheduled: "bg-yellow-500",
    };
    return colors[status as keyof typeof colors] || "bg-gray-300";
  };





  return (
    <aside className="w-80 bg-sidebar shadow-lg border-l border-sidebar-border overflow-y-auto">
      <div className="p-6">
        <h3 className="text-lg font-semibold text-sidebar-foreground mb-4">Recent Posts</h3>

        {/* Recent Posts List */}
        <div className="space-y-4 mb-8">
          {posts.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No posts yet</p>
              <p className="text-sm text-muted-foreground/70">Create your first post to see it here</p>
            </div>
          ) : (
            posts.map((post) => {
              const primaryPlatform = (post.platforms as string[])[0];
              const IconComponent = platformIcons[primaryPlatform as keyof typeof platformIcons];
              const iconColor = platformColors[primaryPlatform as keyof typeof platformColors];

              return (
                <Card key={post.id} className={`${post.status === "failed" ? "bg-red-950/20 border-red-900/50" : "bg-card border-border"}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        {IconComponent && <IconComponent className={`${iconColor} text-sm`} />}
                        <span className="text-sm font-medium text-card-foreground">
                          {format(new Date(post.createdAt), "h:mm a")}
                        </span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <div className={`w-2 h-2 rounded-full ${getStatusIndicator(post.status)}`}></div>
                        <Badge
                          variant="outline"
                          className={`text-xs ${statusColors[post.status as keyof typeof statusColors]}`}
                        >
                          {post.status}
                        </Badge>
                      </div>
                    </div>

                    {/* Replying To Context */}
                    {(post.platformData as any)?.twitter?.replyingTo && (
                      <div className="mb-2 text-xs text-muted-foreground flex items-center gap-1">
                        <span className="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full inline-flex items-center">
                          <Twitter className="w-2 h-2 mr-1" />
                          @{(post.platformData as any).twitter.replyingTo}
                        </span>
                      </div>
                    )}

                    <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                      {post.content.length > 60
                        ? `${post.content.substring(0, 60)}...`
                        : post.content}
                    </p>

                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      {post.status === "published" ? (
                        <span className="text-green-600">
                          Published successfully
                        </span>
                      ) : post.status === "failed" ? (
                        <span className="text-red-600">Failed to publish</span>
                      ) : (
                        <span>Draft saved</span>
                      )}

                      <div className="flex items-center space-x-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="p-0 h-auto text-social-primary hover:text-blue-700"
                          onClick={() => setLocation("/history")}
                        >
                          {post.status === "failed" ? "Retry" : "View"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="p-0 h-auto text-red-500 hover:text-red-700"
                          onClick={() => handleDelete(post.id)}
                          disabled={deletePostMutation.isPending}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>


      </div>
    </aside>
  );
}
