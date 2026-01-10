import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FolderOpen, Zap, FileText } from "lucide-react";
import PlatformSelector from "@/components/post/platform-selector";
import TemplateSelector from "@/components/post/template-selector";
import PostForm from "@/components/post/post-form";
import PostPreview from "@/components/post/post-preview";
import type { Post } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";

export default function CreatePost() {
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(["twitter"]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("announcement");
  const [postContent, setPostContent] = useState("");
  const [currentPost, setCurrentPost] = useState<Post | null>(null);
  const [isDraftDialogOpen, setIsDraftDialogOpen] = useState(false);
  const [location] = useLocation();

  // Get edit parameter from URL
  const urlParams = new URLSearchParams(location.split('?')[1]);
  const editPostId = urlParams.get('edit');

  // Fetch post data if editing
  const { data: editingPost } = useQuery<Post>({
    queryKey: [`/api/posts/${editPostId}`],
    enabled: !!editPostId,
  });

  // Fetch drafts
  const { data: drafts } = useQuery<Post[]>({
    queryKey: ["/api/posts", { status: "draft" }],
  });

  // Set form data when editing post is loaded
  useEffect(() => {
    if (editingPost) {
      setPostContent(editingPost.content);
      setSelectedPlatforms(editingPost.platforms as string[]);
      setSelectedTemplate(editingPost.template || "announcement");
      setCurrentPost(editingPost);
    }
  }, [editingPost]);

  const handleSelectDraft = (draft: Post) => {
    setPostContent(draft.content);
    setSelectedPlatforms(draft.platforms as string[]);
    setSelectedTemplate(draft.template || "custom");
    setCurrentPost(draft);
    setIsDraftDialogOpen(false);
  };

  const handleQuickPost = () => {
    // Scroll to form and focus
    const formElement = document.querySelector('textarea');
    if (formElement) {
      formElement.scrollIntoView({ behavior: 'smooth' });
      formElement.focus();
    }
  };

  return (
    <>
      {/* Header */}
      <header className="bg-card shadow-sm border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">
              {editPostId ? "Edit Post" : "Create New Post"}
            </h2>
            <p className="text-muted-foreground mt-1">
              {editPostId ? "Update your post content and settings" : "Compose and publish to multiple social media platforms"}
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <Dialog open={isDraftDialogOpen} onOpenChange={setIsDraftDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  className="border-border hover:bg-muted"
                >
                  <FolderOpen className="mr-2 h-4 w-4" />
                  Load Draft
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Load Draft</DialogTitle>
                </DialogHeader>
                <ScrollArea className="h-[300px] pr-4">
                  <div className="space-y-2">
                    {drafts?.filter(p => p.status === 'draft').length === 0 ? (
                      <p className="text-center text-muted-foreground py-8">No drafts found.</p>
                    ) : (
                      drafts?.filter(p => p.status === 'draft').map((draft) => (
                        <div
                          key={draft.id}
                          className="p-3 border rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                          onClick={() => handleSelectDraft(draft)}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-sm truncate w-40">
                              {draft.template ? draft.template.charAt(0).toUpperCase() + draft.template.slice(1) : 'Custom'}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(draft.updatedAt), "MMM d, h:mm a")}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 line-clamp-2">
                            {draft.content}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </DialogContent>
            </Dialog>

            <Button
              onClick={handleQuickPost}
              className="bg-social-primary hover:bg-blue-700"
            >
              <Zap className="mr-2 h-4 w-4" />
              Quick Post
            </Button>
          </div>
        </div>
      </header>

      <div className="p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Platform Selection */}
          <Card>
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">Select Platforms</h3>
              <PlatformSelector
                selectedPlatforms={selectedPlatforms}
                onPlatformsChange={setSelectedPlatforms}
              />
            </CardContent>
          </Card>

          {/* Template Selection */}
          <Card>
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-foreground mb-4">Post Template</h3>
              <TemplateSelector
                selectedTemplate={selectedTemplate}
                onTemplateChange={setSelectedTemplate}
              />
            </CardContent>
          </Card>

          {/* Post Composition */}
          <Card>
            <CardContent className="p-6">
              <PostForm
                selectedPlatforms={selectedPlatforms}
                selectedTemplate={selectedTemplate}
                content={postContent}
                onContentChange={setPostContent}
                onPostCreated={setCurrentPost}
                editingPost={editingPost}
              />
            </CardContent>
          </Card>

          {/* Platform Preview */}
          {postContent && (
            <Card>
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold text-foreground mb-4">Platform Preview</h3>
                <PostPreview
                  content={postContent}
                  selectedPlatforms={selectedPlatforms}
                />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
