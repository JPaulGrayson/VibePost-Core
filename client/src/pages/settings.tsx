import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Settings as SettingsIcon,
  Key,
  Bell,
  Shield,
  Trash2,
  Check,
  X,
  ExternalLink
} from "lucide-react";
import { Twitter } from "lucide-react";
import { SiDiscord, SiReddit } from "react-icons/si";
import type { PlatformConnection } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("platforms");

  const { data: platforms = [], refetch: refetchPlatforms } = useQuery<PlatformConnection[]>({
    queryKey: ["/api/platforms"],
    staleTime: 0, // Force fresh data
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  const [twitterCredentials, setTwitterCredentials] = useState({
    apiKey: "",
    apiSecret: "",
    accessToken: "",
    accessTokenSecret: "",
    bearerToken: "",
  });

  const [twitterTestResult, setTwitterTestResult] = useState<{
    success: boolean;
    message: string;
    user?: any;
  } | null>(null);

  const [redditCredentials, setRedditCredentials] = useState({
    clientId: "",
    clientSecret: "",
    username: "",
    password: "",
    userAgent: "",
  });

  const [discordCredentials, setDiscordCredentials] = useState({
    webhookUrl: "",
  });

  const [discordTestResult, setDiscordTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Load existing credentials when platforms data is available
  useEffect(() => {
    const redditPlatform = platforms.find(p => p.platform === "reddit");
    const discordPlatform = platforms.find(p => p.platform === "discord");

    if (redditPlatform?.credentials && typeof redditPlatform.credentials === 'object') {
      const creds = redditPlatform.credentials as any;
      setRedditCredentials({
        clientId: creds.clientId || "",
        clientSecret: creds.clientSecret || "",
        username: creds.username || "",
        password: creds.password || "",
        userAgent: creds.userAgent || "",
      });
    }

    if (discordPlatform?.credentials && typeof discordPlatform.credentials === 'object') {
      const creds = discordPlatform.credentials as any;
      setDiscordCredentials({
        webhookUrl: creds.webhookUrl || "",
      });
    }
  }, [platforms]);

  // Direct Reddit connection check
  const [redditStatus, setRedditStatus] = useState(false);

  // Direct API call to get Reddit status
  useEffect(() => {
    const checkRedditStatus = async () => {
      try {
        const response = await fetch('/api/platforms');
        const data = await response.json();
        const reddit = data.find((p: any) => p.platform === 'reddit');

        if (reddit && reddit.isConnected) {
          setRedditStatus(true);
          setRedditCredentials({
            clientId: reddit.credentials?.clientId || '',
            clientSecret: reddit.credentials?.clientSecret || '',
            username: reddit.credentials?.username || '',
            password: reddit.credentials?.password || '',
            userAgent: reddit.credentials?.userAgent || '',
          });
        } else {
          setRedditStatus(false);
        }
      } catch (error) {
        console.error('Failed to check Reddit status:', error);
        setRedditStatus(false);
      }
    };

    checkRedditStatus();
  }, []);

  const isRedditConnected = redditStatus;

  const [redditTestResult, setRedditTestResult] = useState<{
    success: boolean;
    message: string;
    user?: any;
  } | null>(null);



  const [notificationSettings, setNotificationSettings] = useState({
    emailNotifications: true,
    pushNotifications: false,
    postSuccess: true,
    postFailure: true,
    scheduleReminders: true,
    weeklyReport: false,
  });

  const updatePlatformMutation = useMutation({
    mutationFn: async ({ platform, credentials, isConnected }: {
      platform: string;
      credentials: Record<string, any>;
      isConnected: boolean;
    }) => {
      const response = await apiRequest("PATCH", `/api/platforms/${platform}`, {
        credentials,
        isConnected,
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Platform updated",
        description: `${data.platform} connection has been updated.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/platforms"] });

      // Force Reddit state update
      if (data.platform === "reddit" && data.isConnected) {
        setRedditStatus(true);
      }
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update platform connection.",
        variant: "destructive",
      });
    },
  });

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

  const handleConnectTwitter = () => {
    // Allow empty fields to support .env fallback
    updatePlatformMutation.mutate({
      platform: "twitter",
      credentials: twitterCredentials,
      isConnected: true,
    });
  };

  const handleConnectDiscord = () => {
    const hasRequiredFields = discordCredentials.webhookUrl.trim() !== "";

    if (!hasRequiredFields) {
      toast({
        title: "Missing credentials",
        description: "Please fill in the Discord webhook URL.",
        variant: "destructive",
      });
      return;
    }

    updatePlatformMutation.mutate({
      platform: "discord",
      credentials: discordCredentials,
      isConnected: true,
    });
  };

  const handleConnectReddit = () => {
    const hasRequiredFields = redditCredentials.clientId &&
      redditCredentials.clientSecret &&
      redditCredentials.username &&
      redditCredentials.password;

    if (!hasRequiredFields) {
      toast({
        title: "Missing credentials",
        description: "Please fill in all required Reddit API credentials.",
        variant: "destructive",
      });
      return;
    }

    updatePlatformMutation.mutate({
      platform: "reddit",
      credentials: redditCredentials,
      isConnected: true,
    });
  };

  const handleDisconnectPlatform = (platform: string) => {
    updatePlatformMutation.mutate({
      platform,
      credentials: {},
      isConnected: false,
    });
  };

  const testTwitterConnection = async () => {
    try {
      setTwitterTestResult(null);
      const response = await apiRequest("POST", "/api/platforms/twitter/test", twitterCredentials);
      const result = await response.json();
      setTwitterTestResult(result);

      if (result.success) {
        toast({
          title: "Twitter connection successful!",
          description: `Connected as @${result.user?.username}`,
        });
      } else {
        toast({
          title: "Twitter connection failed",
          description: result.message,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Twitter connection test error:", error);
      const errorMessage = "Failed to test Twitter connection";
      setTwitterTestResult({
        success: false,
        message: errorMessage
      });
      toast({
        title: "Connection test failed",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const testDiscordConnection = async () => {
    try {
      setDiscordTestResult(null);
      const response = await fetch("/api/platforms/discord/test");
      const result = await response.json();
      setDiscordTestResult(result);

      if (result.success) {
        toast({
          title: "Discord connection successful!",
          description: result.message,
        });
      } else {
        toast({
          title: "Discord connection failed",
          description: result.message,
          variant: "destructive",
        });
      }
    } catch (error) {
      const errorMessage = "Failed to test Discord connection";
      setDiscordTestResult({
        success: false,
        message: errorMessage
      });
      toast({
        title: "Connection test failed",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const testRedditConnection = async () => {
    try {
      setRedditTestResult(null);
      const response = await fetch("/api/platforms/reddit/test");
      const result = await response.json();
      setRedditTestResult(result);

      // Refresh platform data after testing
      await refetchPlatforms();

      if (result.success) {
        toast({
          title: "Reddit connection successful!",
          description: `Connected as u/${result.user?.username}`,
        });
      } else {
        toast({
          title: "Reddit connection failed",
          description: result.message,
          variant: "destructive",
        });
      }
    } catch (error) {
      const errorMessage = "Failed to test Reddit connection";
      setRedditTestResult({
        success: false,
        message: errorMessage
      });
      toast({
        title: "Connection test failed",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  return (
    <>
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
            <p className="text-gray-600 mt-1">Manage your account and platform connections</p>
          </div>
        </div>
      </header>

      <div className="p-6">
        <div className="max-w-4xl mx-auto">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="platforms">Platform Connections</TabsTrigger>
              <TabsTrigger value="notifications">Notifications</TabsTrigger>
              <TabsTrigger value="account">Account Settings</TabsTrigger>
            </TabsList>

            <TabsContent value="platforms" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Key className="h-5 w-5" />
                    <span>Platform Connections</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Twitter */}
                  <div className="border rounded-lg p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        <Twitter className="text-blue-400 text-xl" />
                        <div>
                          <h3 className="text-lg font-semibold">Twitter/X</h3>
                          <p className="text-sm text-gray-500">Connect your Twitter account to post tweets</p>
                        </div>
                      </div>
                      <Badge className={platforms.find(p => p.platform === "twitter")?.isConnected ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"}>
                        {platforms.find(p => p.platform === "twitter")?.isConnected ? "Connected" : "Not Connected"}
                      </Badge>
                    </div>

                    {!platforms.find(p => p.platform === "twitter")?.isConnected && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="twitter-api-key">API Key</Label>
                          <Input
                            id="twitter-api-key"
                            type="password"
                            placeholder="Your Twitter API Key"
                            value={twitterCredentials.apiKey}
                            onChange={(e) => setTwitterCredentials(prev => ({ ...prev, apiKey: e.target.value }))}
                          />
                        </div>
                        <div>
                          <Label htmlFor="twitter-api-secret">API Secret</Label>
                          <Input
                            id="twitter-api-secret"
                            type="password"
                            placeholder="Your Twitter API Secret"
                            value={twitterCredentials.apiSecret}
                            onChange={(e) => setTwitterCredentials(prev => ({ ...prev, apiSecret: e.target.value }))}
                          />
                        </div>
                        <div>
                          <Label htmlFor="twitter-access-token">Access Token</Label>
                          <Input
                            id="twitter-access-token"
                            type="password"
                            placeholder="Your Twitter Access Token"
                            value={twitterCredentials.accessToken}
                            onChange={(e) => setTwitterCredentials(prev => ({ ...prev, accessToken: e.target.value }))}
                          />
                        </div>
                        <div>
                          <Label htmlFor="twitter-access-secret">Access Token Secret</Label>
                          <Input
                            id="twitter-access-secret"
                            type="password"
                            placeholder="Your Twitter Access Token Secret"
                            value={twitterCredentials.accessTokenSecret}
                            onChange={(e) => setTwitterCredentials(prev => ({ ...prev, accessTokenSecret: e.target.value }))}
                          />
                        </div>
                        <div className="md:col-span-2">
                          <Label htmlFor="twitter-bearer-token">Bearer Token (Optional)</Label>
                          <Input
                            id="twitter-bearer-token"
                            type="password"
                            placeholder="Your Twitter Bearer Token"
                            value={twitterCredentials.bearerToken}
                            onChange={(e) => setTwitterCredentials(prev => ({ ...prev, bearerToken: e.target.value }))}
                          />
                        </div>
                      </div>
                    )}

                    {twitterTestResult && (
                      <div className={`mt-4 p-3 rounded-lg ${twitterTestResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                        <div className={`text-sm ${twitterTestResult.success ? 'text-green-700' : 'text-red-700'}`}>
                          {twitterTestResult.success ? '✓ ' : '✗ '}
                          {twitterTestResult.message}
                          {twitterTestResult.user && (
                            <div className="mt-1">
                              Connected as: <strong>{twitterTestResult.user.name}</strong> (@{twitterTestResult.user.username})
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between mt-4">
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          asChild
                        >
                          <a href="https://developer.twitter.com/en/portal/dashboard" target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4 mr-1" />
                            Get API Keys
                          </a>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={testTwitterConnection}
                        >
                          Test Connection
                        </Button>
                      </div>
                      <div className="space-x-2">
                        {platforms.find(p => p.platform === "twitter")?.isConnected ? (
                          <Button
                            variant="destructive"
                            onClick={() => handleDisconnectPlatform("twitter")}
                            disabled={updatePlatformMutation.isPending}
                          >
                            <X className="h-4 w-4 mr-1" />
                            Disconnect
                          </Button>
                        ) : (
                          <Button
                            onClick={handleConnectTwitter}
                            disabled={updatePlatformMutation.isPending}
                          >
                            <Check className="h-4 w-4 mr-1" />
                            Connect Twitter
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Discord */}
                  <div className="border rounded-lg p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        <SiDiscord className="text-indigo-500 text-xl" />
                        <div>
                          <h3 className="text-lg font-semibold">Discord</h3>
                          <p className="text-sm text-gray-500">Connect your Discord bot to post messages</p>
                        </div>
                      </div>
                      <Badge className={platforms.find(p => p.platform === "discord")?.isConnected ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"}>
                        {platforms.find(p => p.platform === "discord")?.isConnected ? "Connected" : "Not Connected"}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                      <div>
                        <Label htmlFor="discord-webhook-url">Webhook URL</Label>
                        <Input
                          id="discord-webhook-url"
                          type="url"
                          placeholder="https://discord.com/api/webhooks/..."
                          value={discordCredentials.webhookUrl}
                          onChange={(e) => setDiscordCredentials(prev => ({ ...prev, webhookUrl: e.target.value }))}
                        />
                        <p className="text-sm text-muted-foreground mt-1">
                          Paste the webhook URL you copied from Discord Server Settings → Integrations → Webhooks
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={testDiscordConnection}
                      >
                        Test Connection
                      </Button>
                      <div className="space-x-2">
                        {platforms.find(p => p.platform === "discord")?.isConnected ? (
                          <Button
                            variant="destructive"
                            onClick={() => handleDisconnectPlatform("discord")}
                            disabled={updatePlatformMutation.isPending}
                          >
                            <X className="h-4 w-4 mr-1" />
                            Disconnect
                          </Button>
                        ) : (
                          <Button
                            onClick={handleConnectDiscord}
                            disabled={updatePlatformMutation.isPending}
                          >
                            <Check className="h-4 w-4 mr-1" />
                            Connect Discord
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Reddit */}
                  <div className="border rounded-lg p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        <SiReddit className="text-orange-500 text-xl" />
                        <div>
                          <h3 className="text-lg font-semibold">Reddit</h3>
                          <p className="text-sm text-gray-500">Connect your Reddit account to post to subreddits</p>
                        </div>
                      </div>
                      <Badge className={isRedditConnected ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"}>
                        {isRedditConnected ? "Connected" : "Not Connected"}
                      </Badge>
                    </div>

                    {!isRedditConnected && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="reddit-client-id">Client ID</Label>
                          <Input
                            id="reddit-client-id"
                            placeholder="Reddit App Client ID"
                            value={redditCredentials.clientId}
                            onChange={(e) => setRedditCredentials(prev => ({ ...prev, clientId: e.target.value }))}
                          />
                        </div>
                        <div>
                          <Label htmlFor="reddit-client-secret">Client Secret</Label>
                          <Input
                            id="reddit-client-secret"
                            type="password"
                            placeholder="Reddit App Client Secret"
                            value={redditCredentials.clientSecret}
                            onChange={(e) => setRedditCredentials(prev => ({ ...prev, clientSecret: e.target.value }))}
                          />
                        </div>
                        <div>
                          <Label htmlFor="reddit-username">Username</Label>
                          <Input
                            id="reddit-username"
                            placeholder="Your Reddit Username"
                            value={redditCredentials.username}
                            onChange={(e) => setRedditCredentials(prev => ({ ...prev, username: e.target.value }))}
                          />
                        </div>
                        <div>
                          <Label htmlFor="reddit-password">Password</Label>
                          <Input
                            id="reddit-password"
                            type="password"
                            placeholder="Your Reddit Password"
                            value={redditCredentials.password}
                            onChange={(e) => setRedditCredentials(prev => ({ ...prev, password: e.target.value }))}
                          />
                        </div>
                        <div className="md:col-span-2">
                          <Label htmlFor="reddit-user-agent">User Agent</Label>
                          <Input
                            id="reddit-user-agent"
                            placeholder="YourApp/1.0 by YourUsername"
                            value={redditCredentials.userAgent}
                            onChange={(e) => setRedditCredentials(prev => ({ ...prev, userAgent: e.target.value }))}
                          />
                        </div>
                      </div>
                    )}

                    {redditTestResult && (
                      <div className={`mt-4 p-3 rounded-lg ${redditTestResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                        <div className={`text-sm ${redditTestResult.success ? 'text-green-700' : 'text-red-700'}`}>
                          {redditTestResult.success ? '✓ ' : '✗ '}
                          {redditTestResult.message}
                          {redditTestResult.user && (
                            <div className="mt-1">
                              Connected as: <strong>u/{redditTestResult.user.username}</strong> (Karma: {redditTestResult.user.karma})
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between mt-4">
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          asChild
                        >
                          <a href="https://www.reddit.com/prefs/apps" target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4 mr-1" />
                            Create Reddit App
                          </a>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={testRedditConnection}
                        >
                          Test Connection
                        </Button>
                      </div>
                      <div className="space-x-2">
                        {platforms.find(p => p.platform === "reddit")?.isConnected ? (
                          <Button
                            variant="destructive"
                            onClick={() => handleDisconnectPlatform("reddit")}
                            disabled={updatePlatformMutation.isPending}
                          >
                            <X className="h-4 w-4 mr-1" />
                            Disconnect
                          </Button>
                        ) : (
                          <Button
                            onClick={handleConnectReddit}
                            disabled={updatePlatformMutation.isPending}
                          >
                            <Check className="h-4 w-4 mr-1" />
                            Connect Reddit
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="notifications" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Bell className="h-5 w-5" />
                    <span>Notification Preferences</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="email-notifications">Email Notifications</Label>
                        <p className="text-sm text-gray-500">Receive notifications via email</p>
                      </div>
                      <Switch
                        id="email-notifications"
                        checked={notificationSettings.emailNotifications}
                        onCheckedChange={(checked) =>
                          setNotificationSettings(prev => ({ ...prev, emailNotifications: checked }))
                        }
                      />
                    </div>

                    <Separator />

                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="push-notifications">Push Notifications</Label>
                        <p className="text-sm text-gray-500">Receive browser push notifications</p>
                      </div>
                      <Switch
                        id="push-notifications"
                        checked={notificationSettings.pushNotifications}
                        onCheckedChange={(checked) =>
                          setNotificationSettings(prev => ({ ...prev, pushNotifications: checked }))
                        }
                      />
                    </div>

                    <Separator />

                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="post-success">Post Success Notifications</Label>
                        <p className="text-sm text-gray-500">Get notified when posts are published successfully</p>
                      </div>
                      <Switch
                        id="post-success"
                        checked={notificationSettings.postSuccess}
                        onCheckedChange={(checked) =>
                          setNotificationSettings(prev => ({ ...prev, postSuccess: checked }))
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="post-failure">Post Failure Notifications</Label>
                        <p className="text-sm text-gray-500">Get notified when posts fail to publish</p>
                      </div>
                      <Switch
                        id="post-failure"
                        checked={notificationSettings.postFailure}
                        onCheckedChange={(checked) =>
                          setNotificationSettings(prev => ({ ...prev, postFailure: checked }))
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="schedule-reminders">Schedule Reminders</Label>
                        <p className="text-sm text-gray-500">Get reminded about upcoming scheduled posts</p>
                      </div>
                      <Switch
                        id="schedule-reminders"
                        checked={notificationSettings.scheduleReminders}
                        onCheckedChange={(checked) =>
                          setNotificationSettings(prev => ({ ...prev, scheduleReminders: checked }))
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="weekly-report">Weekly Reports</Label>
                        <p className="text-sm text-gray-500">Receive weekly analytics summaries</p>
                      </div>
                      <Switch
                        id="weekly-report"
                        checked={notificationSettings.weeklyReport}
                        onCheckedChange={(checked) =>
                          setNotificationSettings(prev => ({ ...prev, weeklyReport: checked }))
                        }
                      />
                    </div>
                  </div>

                  <Button className="w-full">
                    Save Notification Settings
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="account" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Shield className="h-5 w-5" />
                    <span>Account Security</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="current-password">Current Password</Label>
                      <Input
                        id="current-password"
                        type="password"
                        placeholder="Enter your current password"
                      />
                    </div>
                    <div>
                      <Label htmlFor="new-password">New Password</Label>
                      <Input
                        id="new-password"
                        type="password"
                        placeholder="Enter a new password"
                      />
                    </div>
                    <div>
                      <Label htmlFor="confirm-password">Confirm New Password</Label>
                      <Input
                        id="confirm-password"
                        type="password"
                        placeholder="Confirm your new password"
                      />
                    </div>
                  </div>

                  <Button>Update Password</Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2 text-red-600">
                    <Trash2 className="h-5 w-5" />
                    <span>Danger Zone</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="border border-red-200 rounded-lg p-4">
                    <h4 className="text-lg font-semibold text-red-600 mb-2">Delete Account</h4>
                    <p className="text-gray-600 mb-4">
                      Permanently delete your account and all associated data. This action cannot be undone.
                    </p>
                    <Button variant="destructive">
                      Delete Account
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </>
  );
}