import { useState, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Image, Hash, Clock, Save, Send, Calendar as CalendarIcon, X, Link2, Upload, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { Post } from "@shared/schema";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const templates = {
  announcement: "🚀 Excited to announce [your announcement here]!\n\n✨ Key highlights:\n• [Feature 1]\n• [Feature 2]\n• [Feature 3]\n\n[Call to action]\n\n#hashtag1 #hashtag2",
  tip: "💡 Pro tip: [Your insight here]\n\n🔍 Here's why this matters:\n[Explanation]\n\n🎯 Quick takeaway:\n[Summary]\n\n#tips #productivity #learning",
  question: "🤔 Question for the community:\n\n[Your question here]\n\n💭 I'm curious about your thoughts and experiences.\n\nDrop your answers in the comments! 👇\n\n#community #discussion",
  share: "📄 Found something interesting to share:\n\n[Brief description of what you're sharing]\n\n🔗 Link: [URL]\n\n💬 What do you think? Let me know your thoughts!\n\n#sharing #resources"
};

const postSchema = z.object({
  content: z.string().min(1, "Content is required").max(280, "Content must be 280 characters or less"),
});

interface PostFormProps {
  selectedPlatforms: string[];
  selectedTemplate: string;
  content: string;
  onContentChange: (content: string) => void;
  onPostCreated?: (post: Post) => void;
  editingPost?: Post | null;
}

export default function PostForm({
  selectedPlatforms,
  selectedTemplate,
  content,
  onContentChange,
  onPostCreated,
  editingPost
}: PostFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [characterCount, setCharacterCount] = useState(0);
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [mediaUrl, setMediaUrl] = useState<string>("");
  const [showMediaInput, setShowMediaInput] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<z.infer<typeof postSchema>>({
    resolver: zodResolver(postSchema),
    defaultValues: {
      content: content,
    },
  });

  // Update form when content prop changes
  useEffect(() => {
    form.setValue("content", content);
    setCharacterCount(content.length);
  }, [content, form]);

  // Load mediaUrl when editing a post
  useEffect(() => {
    if (editingPost?.mediaUrl) {
      setMediaUrl(editingPost.mediaUrl);
      setShowMediaInput(true);
    }
  }, [editingPost]);

  // Update template content when template changes - but NOT when editing an existing post
  useEffect(() => {
    // Skip template override when editing a post - preserve the saved content
    if (editingPost) {
      return;
    }
    if (selectedTemplate && templates[selectedTemplate as keyof typeof templates]) {
      const templateContent = templates[selectedTemplate as keyof typeof templates];
      onContentChange(templateContent);
    }
  }, [selectedTemplate, onContentChange, editingPost]);

  const createPostMutation = useMutation({
    mutationFn: async (data: { content: string; platforms: string[]; template: string; status: string; scheduledAt?: string }) => {
      if (editingPost) {
        // Update existing post
        const response = await fetch(`/api/posts/${editingPost.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(data),
        });
        if (!response.ok) {
          throw new Error("Failed to update post");
        }
        return response.json();
      } else {
        // Create new post
        const response = await apiRequest("POST", "/api/posts", data);
        return response.json();
      }
    },
    onSuccess: (post: Post) => {
      toast({
        title: editingPost
          ? (post.status === "published" ? "Post updated and published!" : "Post updated!")
          : (post.status === "published" ? "Post published!" : (post.status === "scheduled" ? "Post scheduled!" : "Draft saved!")),
        description: editingPost
          ? "Your post has been updated successfully."
          : (post.status === "published"
            ? "Your post has been published to selected platforms."
            : (post.status === "scheduled"
              ? `Your post has been scheduled for ${format(new Date(post.scheduledAt!), "PPP")}.`
              : "Your draft has been saved successfully.")),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      onPostCreated?.(post);

      // Reset form if creating new
      if (!editingPost) {
        setDate(undefined);
        setMediaUrl("");
        setShowMediaInput(false);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleContentChange = (value: string) => {
    onContentChange(value);
    setCharacterCount(value.length);
  };

  const handleSaveDraft = () => {
    const data = {
      content: form.getValues("content"),
      platforms: selectedPlatforms,
      template: selectedTemplate,
      status: "draft",
      scheduledAt: date ? date.toISOString() : undefined,
      mediaUrl: mediaUrl || undefined,
    };
    createPostMutation.mutate(data);
  };

  const handlePublish = (data: z.infer<typeof postSchema>) => {
    if (selectedPlatforms.length === 0) {
      toast({
        title: "No platforms selected",
        description: "Please select at least one platform to publish to.",
        variant: "destructive",
      });
      return;
    }

    const postData = {
      content: data.content,
      platforms: selectedPlatforms,
      template: selectedTemplate,
      status: date ? "scheduled" : "published",
      scheduledAt: date ? date.toISOString() : undefined,
      mediaUrl: mediaUrl || undefined,
    };
    createPostMutation.mutate(postData);
  };

  const handleMediaUrlChange = (url: string) => {
    setMediaUrl(url);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const data = await response.json();
      setMediaUrl(data.url);
      toast({
        title: "File uploaded",
        description: `${file.name} has been uploaded successfully.`,
      });
    } catch (error) {
      toast({
        title: "Upload failed",
        description: "Could not upload the file. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const clearMedia = () => {
    setMediaUrl("");
    setShowMediaInput(false);
  };

  const handleAddTags = () => {
    const currentContent = form.getValues("content");
    const newContent = currentContent + "\n\n#VibePost #SocialMedia #Growth";
    form.setValue("content", newContent);
    handleContentChange(newContent);
    toast({
      title: "Tags added",
      description: "Added common hashtags to your post.",
    });
  };

  const getCharacterCountColor = () => {
    if (characterCount > 280) return "text-red-600";
    if (characterCount > 250) return "text-yellow-600";
    return "text-muted-foreground";
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handlePublish)} className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">Compose Post</h3>
          <div className={`text-sm ${getCharacterCountColor()}`}>
            {characterCount} / 280 characters
          </div>
        </div>

        <FormField
          control={form.control}
          name="content"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Textarea
                  {...field}
                  placeholder="What's happening? Share your thoughts, news, or insights..."
                  className="min-h-[150px] resize-none"
                  onChange={(e) => {
                    field.onChange(e);
                    handleContentChange(e.target.value);
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Media Input */}
        {showMediaInput && (
          <div className="space-y-3 p-3 bg-muted/50 rounded-lg border border-border">
            <div className="flex items-center gap-2">
              <Image className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Add Media</span>
              <button
                type="button"
                onClick={clearMedia}
                className="ml-auto text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* File Upload */}
            <div className="flex gap-2">
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*,video/*"
                onChange={handleFileUpload}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="flex-1"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Choose File
                  </>
                )}
              </Button>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="flex-1 border-t border-border" />
              <span>or paste URL</span>
              <div className="flex-1 border-t border-border" />
            </div>

            {/* URL Input */}
            <Input
              type="url"
              placeholder="https://example.com/image.jpg"
              value={mediaUrl}
              onChange={(e) => handleMediaUrlChange(e.target.value)}
              className="bg-background"
            />

            {/* Preview */}
            {mediaUrl && (
              <div className="mt-2">
                {mediaUrl.match(/\.(mp4|mov|webm|avi)$/i) ? (
                  <video src={mediaUrl} className="max-h-32 rounded-md" controls />
                ) : (
                  <img 
                    src={mediaUrl} 
                    alt="Preview" 
                    className="max-h-32 rounded-md object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                )}
              </div>
            )}
          </div>
        )}

        {/* Post Options */}
        <div className="flex items-center justify-between pt-4 border-t border-border">
          <div className="flex items-center space-x-4">
            <Button
              type="button"
              variant={showMediaInput ? "secondary" : "ghost"}
              size="sm"
              className={cn(
                "text-muted-foreground hover:text-foreground",
                showMediaInput && "bg-blue-50 text-blue-600"
              )}
              onClick={() => setShowMediaInput(!showMediaInput)}
            >
              <Image className="mr-2 h-4 w-4" />
              {mediaUrl ? "Edit Media" : "Add Media"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
              onClick={handleAddTags}
            >
              <Hash className="mr-2 h-4 w-4" />
              Add Tags
            </Button>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant={date ? "secondary" : "ghost"}
                  size="sm"
                  className={cn(
                    "text-muted-foreground hover:text-foreground",
                    date && "bg-blue-50 text-blue-600"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, "MMM d") : "Schedule"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  initialFocus
                  disabled={(date) => date < new Date()}
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex items-center space-x-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleSaveDraft}
              disabled={createPostMutation.isPending}
            >
              <Save className="mr-2 h-4 w-4" />
              Save Draft
            </Button>
            <Button
              type="submit"
              disabled={createPostMutation.isPending || selectedPlatforms.length === 0}
              className={cn(
                "hover:bg-blue-700",
                date ? "bg-green-600 hover:bg-green-700" : "bg-social-primary"
              )}
            >
              {date ? (
                <>
                  <Clock className="mr-2 h-4 w-4" />
                  {createPostMutation.isPending ? "Scheduling..." : "Schedule Post"}
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  {createPostMutation.isPending ? "Publishing..." : "Publish Now"}
                </>
              )}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}
