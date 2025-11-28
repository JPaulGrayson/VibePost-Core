import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Image, Hash, Clock, Save, Send } from "lucide-react";
import type { Post } from "@shared/schema";

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

  // Update template content when template changes
  useEffect(() => {
    if (selectedTemplate && templates[selectedTemplate as keyof typeof templates]) {
      const templateContent = templates[selectedTemplate as keyof typeof templates];
      onContentChange(templateContent);
    }
  }, [selectedTemplate, onContentChange]);

  const createPostMutation = useMutation({
    mutationFn: async (data: { content: string; platforms: string[]; template: string; status: string }) => {
      if (editingPost) {
        // Update existing post
        const response = await fetch(`/api/posts/${editingPost.id}`, {
          method: "PUT",
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
          : (post.status === "published" ? "Post published!" : "Draft saved!"),
        description: editingPost
          ? "Your post has been updated successfully."
          : (post.status === "published" 
            ? "Your post has been published to selected platforms." 
            : "Your draft has been saved successfully."),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      onPostCreated?.(post);
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
      status: "published",
    };
    createPostMutation.mutate(postData);
  };

  const getCharacterCountColor = () => {
    if (characterCount > 280) return "text-red-600";
    if (characterCount > 250) return "text-yellow-600";
    return "text-gray-500";
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handlePublish)} className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Compose Post</h3>
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

        {/* Post Options */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-200">
          <div className="flex items-center space-x-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-gray-600 hover:text-gray-900"
            >
              <Image className="mr-2 h-4 w-4" />
              Add Media
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-gray-600 hover:text-gray-900"
            >
              <Hash className="mr-2 h-4 w-4" />
              Add Tags
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-gray-600 hover:text-gray-900"
            >
              <Clock className="mr-2 h-4 w-4" />
              Schedule
            </Button>
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
              className="bg-social-primary hover:bg-blue-700"
            >
              <Send className="mr-2 h-4 w-4" />
              {createPostMutation.isPending ? "Publishing..." : "Publish Now"}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}
