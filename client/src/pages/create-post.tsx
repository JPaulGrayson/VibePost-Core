import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FolderOpen, Zap } from "lucide-react";
import PlatformSelector from "@/components/post/platform-selector";
import TemplateSelector from "@/components/post/template-selector";
import PostForm from "@/components/post/post-form";
import PostPreview from "@/components/post/post-preview";
import type { Post } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";

export default function CreatePost() {
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(["twitter"]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("announcement");
  const [postContent, setPostContent] = useState("");
  const [currentPost, setCurrentPost] = useState<Post | null>(null);
  const [location] = useLocation();

  // Get edit parameter from URL
  const urlParams = new URLSearchParams(location.split('?')[1]);
  const editPostId = urlParams.get('edit');

  // Fetch post data if editing
  const { data: editingPost } = useQuery<Post>({
    queryKey: ["/api/posts", editPostId],
    enabled: !!editPostId,
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

  const handleLoadDraft = () => {
    // TODO: Implement draft loading functionality
    console.log("Loading draft...");
  };

  const handleQuickPost = () => {
    // TODO: Implement quick post functionality
    console.log("Quick posting...");
  };

  return (
    <>
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              {editPostId ? "Edit Post" : "Create New Post"}
            </h2>
            <p className="text-gray-600 mt-1">
              {editPostId ? "Update your post content and settings" : "Compose and publish to multiple social media platforms"}
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <Button 
              variant="outline" 
              onClick={handleLoadDraft}
              className="border-gray-300 hover:bg-gray-50"
            >
              <FolderOpen className="mr-2 h-4 w-4" />
              Load Draft
            </Button>
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
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Select Platforms</h3>
              <PlatformSelector 
                selectedPlatforms={selectedPlatforms}
                onPlatformsChange={setSelectedPlatforms}
              />
            </CardContent>
          </Card>

          {/* Template Selection */}
          <Card>
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Post Template</h3>
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
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Platform Preview</h3>
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
