import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ExternalLink, Edit2, Trash2, RotateCw } from "lucide-react";
import { Twitter, MessageSquare } from "lucide-react";
import { SiDiscord, SiReddit } from "react-icons/si";
import type { Post } from "@shared/schema";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

export default function PostHistory() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: posts = [], isLoading } = useQuery<Post[]>({
    queryKey: ["/api/posts"],
  });

  const retryPostMutation = useMutation({
    mutationFn: async (postId: number) => {
      const response = await fetch(`/api/posts/${postId}/retry`, {
        method: "POST",
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to retry post");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      toast({
        title: "Post published!",
        description: "The post was successfully retried and published.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Retry failed",
        description: error.message || "Failed to publish post. Please try again.",
        variant: "destructive",
      });
    },
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

  const handleEdit = (postId: number) => {
    navigate(`/create-post?edit=${postId}`);
  };

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
    draft: "bg-gray-100 text-gray-800",
    published: "bg-green-100 text-green-800",
    failed: "bg-red-100 text-red-800",
    scheduled: "bg-yellow-100 text-yellow-800",
  };

  const filteredPosts = posts.filter(post => {
    const matchesSearch = post.content.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || post.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getPostUrl = (post: Post, platform: string) => {
    const platformData = post.platformData as Record<string, any>;
    return platformData?.[platform]?.url;
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="max-w-6xl mx-auto">
          <div className="animate-pulse space-y-4">
            {[...Array(5)].map((_, i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <header className="bg-card shadow-sm border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Post History</h2>
            <p className="text-muted-foreground mt-1">View and manage all your published posts</p>
          </div>
        </div>
      </header>

      <div className="p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Filters */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    placeholder="Search posts..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="sm:w-48">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Posts</SelectItem>
                      <SelectItem value="published">Published</SelectItem>
                      <SelectItem value="draft">Drafts</SelectItem>
                      <SelectItem value="scheduled">Scheduled</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Posts List */}
          <div className="space-y-4">
            {filteredPosts.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <MessageSquare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">No posts found</h3>
                  <p className="text-muted-foreground">
                    {searchTerm || statusFilter !== "all"
                      ? "Try adjusting your filters to see more posts."
                      : "Start by creating your first post!"}
                  </p>
                </CardContent>
              </Card>
            ) : (
              filteredPosts.map((post) => (
                <Card key={post.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          <Badge
                            className={statusColors[post.status as keyof typeof statusColors]}
                          >
                            {post.status}
                          </Badge>
                          {post.template && (
                            <Badge variant="outline" className="capitalize">
                              {post.template}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                          <span>Created: {format(new Date(post.createdAt), "MMM d, yyyy 'at' h:mm a")}</span>
                          {post.publishedAt && (
                            <span>Published: {format(new Date(post.publishedAt), "MMM d, yyyy 'at' h:mm a")}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {post.status === "failed" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-green-600 hover:text-green-700"
                            onClick={() => retryPostMutation.mutate(post.id)}
                            disabled={retryPostMutation.isPending}
                          >
                            <RotateCw className={`h-4 w-4 ${retryPostMutation.isPending ? 'animate-spin' : ''}`} />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(post.id)}
                          aria-label="Edit post"
                          data-testid={`edit-post-${post.id}`}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => handleDelete(post.id)}
                          disabled={deletePostMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {/* Replying To Context */}
                    {(post.platformData as any)?.twitter?.replyingTo && (
                      <div className="mb-3">
                        <span className="inline-flex items-center text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-md">
                          <Twitter className="w-3 h-3 mr-1" />
                          Replying to @{(post.platformData as any).twitter.replyingTo}
                        </span>
                      </div>
                    )}

                    <p className="text-foreground mb-4 whitespace-pre-line">
                      {post.content.length > 200
                        ? `${post.content.substring(0, 200)}...`
                        : post.content}
                    </p>

                    {/* Platforms */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        {(post.platforms as string[]).map((platform) => {
                          const IconComponent = platformIcons[platform as keyof typeof platformIcons];
                          const iconColor = platformColors[platform as keyof typeof platformColors];
                          const postUrl = getPostUrl(post, platform);

                          return (
                            <div key={platform} className="flex items-center space-x-1">
                              {IconComponent && <IconComponent className={`${iconColor} text-sm`} />}
                              <span className="text-sm text-muted-foreground capitalize">{platform}</span>
                              {postUrl && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="p-0 h-auto"
                                  asChild
                                >
                                  <a href={postUrl} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Analytics Summary */}
                      {post.status === "published" && (
                        <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                          <span>👍 0</span>
                          <span>💬 0</span>
                          <span>🔄 0</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}
