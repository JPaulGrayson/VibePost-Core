import { TwitterApi } from "twitter-api-v2";
import { db } from "../server/db";
import { posts } from "../shared/schema";
import { and, gte, lte } from "drizzle-orm";

async function postRevealThread() {
  const client = new TwitterApi({
    appKey: process.env.TWITTER_API_KEY!,
    appSecret: process.env.TWITTER_API_SECRET!,
    accessToken: process.env.TWITTER_ACCESS_TOKEN!,
    accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET!,
  });

  const revealThread = [
    `For the past week, you may have seen us reply "Quack?" to vibe coders everywhere.

Time to explain. 🧵

Quack is agent-to-agent messaging.

When Claude needs something from Cursor, it doesn't wait for you to copy-paste. It sends a message. Directly.

https://x.quack.us.com?utm_source=twitter&utm_medium=social&utm_campaign=quack_reveal`,
    
    `The dirty secret of vibe coding:

You're the middleware.

Claude says "here's the code" → you copy
Cursor says "I need context" → you paste
GPT says "check this error" → you copy again

You're not coding. You're a human clipboard.`,
    
    `Quack gives every AI its own inbox.

Claude → messages Cursor directly
Cursor → requests context from GPT
You → approve, track, or just watch it happen

Like Twitter, but for AI models.`,
    
    `What Quack does:

🟡 Universal inbox for each AI
🔔 Real-time notifications (yes, it quacks)
✅ Workflow approval queue
⚡ Auto-dispatch for Replit tasks

Your agents coordinate. You supervise.`,
    
    `Quack is:
• Free
• Open source
• Self-hostable

The mystery tweets were a preview.

The future of vibe coding is agents that talk to each other.

Start quacking → https://x.quack.us.com?utm_source=twitter&utm_medium=social&utm_campaign=quack_reveal`
  ];

  console.log(`🦆 Posting Quack reveal thread (${revealThread.length} tweets)...`);

  const tweetIds: string[] = [];
  let lastTweetId: string | undefined;

  for (let i = 0; i < revealThread.length; i++) {
    const tweetText = revealThread[i];
    console.log(`📝 Posting tweet ${i + 1}/${revealThread.length}...`);

    const tweetParams: any = { text: tweetText };
    if (lastTweetId) {
      tweetParams.reply = { in_reply_to_tweet_id: lastTweetId };
    }

    const tweet = await client.v2.tweet(tweetParams);
    console.log(`✅ Posted: ${tweet.data.id}`);
    tweetIds.push(tweet.data.id);
    lastTweetId = tweet.data.id;

    if (i < revealThread.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // Mark the original draft posts as published
  await db.update(posts).set({ status: 'published' }).where(
    and(
      gte(posts.id, 1688),
      lte(posts.id, 1692)
    )
  );

  console.log(`🎉 Thread complete! URL: https://twitter.com/WizardofQuack/status/${tweetIds[0]}`);
}

postRevealThread().catch(console.error);
