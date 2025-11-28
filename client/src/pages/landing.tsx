import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, Users, BarChart } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="container mx-auto px-4 py-16">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-gray-900 dark:text-white mb-6">
            VibePost
            <span className="text-blue-600 dark:text-blue-400"> Social Manager</span>
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 mb-8 max-w-3xl mx-auto">
            Post to X/Twitter, Discord, and Reddit from one dashboard. 
            Create campaigns, track analytics, and manage your social presence efficiently.
          </p>
          
          <div className="space-x-4">
            <Button 
              size="lg" 
              className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3"
              onClick={() => window.location.href = '/api/login'}
            >
              Get Started
            </Button>
            <Button 
              variant="outline" 
              size="lg" 
              className="px-8 py-3"
            >
              Learn More
            </Button>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <MessageSquare className="w-12 h-12 text-blue-600 mb-4" />
              <CardTitle>Multi-Platform Posting</CardTitle>
              <CardDescription>
                Publish to Twitter, Discord, and Reddit simultaneously with platform-specific formatting.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-2">
                <li>• Live posting to all platforms</li>
                <li>• Custom templates and formatting</li>
                <li>• Real-time preview for each platform</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <Users className="w-12 h-12 text-green-600 mb-4" />
              <CardTitle>Campaign Management</CardTitle>
              <CardDescription>
                Create and manage marketing campaigns with bulk posting and scheduling capabilities.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-2">
                <li>• Bulk post creation</li>
                <li>• Campaign tracking</li>
                <li>• Cross-platform coordination</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <BarChart className="w-12 h-12 text-purple-600 mb-4" />
              <CardTitle>Analytics & Insights</CardTitle>
              <CardDescription>
                Track engagement metrics and performance across all your connected social platforms.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-2">
                <li>• Real-time engagement tracking</li>
                <li>• Cross-platform analytics</li>
                <li>• Performance optimization</li>
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* Platform Showcase */}
        <div className="mt-16 text-center">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">
            Connected Platforms
          </h2>
          <div className="flex justify-center space-x-8 opacity-70">
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center mb-2 mx-auto">
                <span className="text-white font-bold">X</span>
              </div>
              <span className="text-sm text-gray-600 dark:text-gray-300">Twitter/X</span>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-indigo-500 rounded-full flex items-center justify-center mb-2 mx-auto">
                <span className="text-white font-bold">D</span>
              </div>
              <span className="text-sm text-gray-600 dark:text-gray-300">Discord</span>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-orange-500 rounded-full flex items-center justify-center mb-2 mx-auto">
                <span className="text-white font-bold">R</span>
              </div>
              <span className="text-sm text-gray-600 dark:text-gray-300">Reddit</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}