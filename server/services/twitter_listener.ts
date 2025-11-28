import { TwitterApi } from "twitter-api-v2";
import { postcardDrafter } from "./postcard_drafter";

export class TwitterListener {
    private client: TwitterApi | null = null;
    private isPolling = false;
    private botUserId: string | null = null;

    constructor() {
        this.initializeClient();
    }

    private initializeClient() {
        const appKey = process.env.TWITTER_API_KEY;
        const appSecret = process.env.TWITTER_API_SECRET;
        const accessToken = process.env.TWITTER_ACCESS_TOKEN;
        const accessSecret = process.env.TWITTER_ACCESS_SECRET;

        if (appKey && appSecret && accessToken && accessSecret) {
            this.client = new TwitterApi({
                appKey,
                appSecret,
                accessToken,
                accessSecret,
            });
            console.log("Twitter client initialized for Listener.");
        } else {
            console.warn("Twitter credentials missing. Listener will not run.");
        }
    }

    async startPolling(intervalMs: number = 60000) {
        if (!this.client) return;
        if (this.isPolling) return;

        this.isPolling = true;
        console.log("Starting Twitter Listener polling...");

        // Initial poll
        await this.pollMentions();

        setInterval(async () => {
            await this.pollMentions();
        }, intervalMs);
    }

    private async pollMentions() {
        if (!this.client) return;

        try {
            if (!this.botUserId) {
                this.botUserId = await this.getBotUserId();
            }

            if (!this.botUserId) return;

            // Fetch recent mentions
            const mentions = await this.client.v2.userMentionTimeline(this.botUserId, {
                max_results: 10,
                "tweet.fields": ["created_at", "author_id", "text"],
                "user.fields": ["public_metrics", "username"],
                expansions: ["author_id"],
            });

            if (!mentions.data.data || mentions.data.data.length === 0) {
                return;
            }

            for (const tweet of mentions.data.data) {
                // Filter: Author follower count
                const author = mentions.includes?.users?.find((u: any) => u.id === tweet.author_id);

                if (author) {
                    const followers = author.public_metrics?.followers_count || 0;

                    // Filter out bots (< 50) and high profile (> 100k)
                    if (followers < 50) {
                        console.log(`Skipping tweet from @${author.username} (Too few followers: ${followers})`);
                        continue;
                    }
                    if (followers > 100000) {
                        console.log(`Skipping tweet from @${author.username} (Too many followers: ${followers})`);
                        continue;
                    }

                    // Trigger Drafter
                    await postcardDrafter.draftReply({
                        id: tweet.id,
                        author: author.username,
                        text: tweet.text,
                    });
                }
            }

        } catch (error) {
            console.error("Error polling Twitter mentions:", error);
        }
    }

    private async getBotUserId(): Promise<string | null> {
        try {
            const me = await this.client?.v2.me();
            return me?.data.id || null;
        } catch (error) {
            console.error("Failed to get bot user ID:", error);
            return null;
        }
    }
}

export const twitterListener = new TwitterListener();
