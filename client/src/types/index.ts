export interface PostTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  content: string;
}

export interface PlatformInfo {
  id: string;
  name: string;
  icon: string;
  color: string;
  isConnected: boolean;
  metadata?: Record<string, any>;
}

export interface PostStats {
  postsToday: number;
  engagementToday: number;
  scheduledPosts: number;
  drafts: number;
}
