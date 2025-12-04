import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import MainLayout from "@/components/layout/main-layout";
import CreatePost from "@/pages/create-post";
import PostHistory from "@/pages/post-history";
import ScheduledPosts from "@/pages/scheduled-posts";
import Campaigns from "@/pages/campaigns";
import CampaignDetails from "@/pages/campaign-details";
import Analytics from "@/pages/analytics";
import TopicSearch from "@/pages/topic-search";
import Settings from "@/pages/settings";
import Landing from "@/pages/landing";
import NotFound from "@/pages/not-found";
import SniperQueue from "@/pages/sniper-queue";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Landing />;
  }

  return (
    <MainLayout>
      <Switch>
        <Route path="/" component={CreatePost} />
        <Route path="/create" component={CreatePost} />
        <Route path="/create-post" component={CreatePost} />
        <Route path="/history" component={PostHistory} />
        <Route path="/post-history" component={PostHistory} />
        <Route path="/scheduled" component={ScheduledPosts} />
        <Route path="/campaigns" component={Campaigns} />
        <Route path="/campaigns/:id" component={CampaignDetails} />
        <Route path="/analytics" component={Analytics} />
        <Route path="/topic-search" component={TopicSearch} />
        <Route path="/search" component={TopicSearch} />
        <Route path="/settings" component={Settings} />
        <Route path="/settings" component={Settings} />
        <Route path="/sniper-queue" component={SniperQueue} />
        <Route path="/sniper" component={SniperQueue} />
        <Route component={NotFound} />
      </Switch>
    </MainLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
