import { TwitterApi } from 'twitter-api-v2';
import { db } from '../server/db';
import { platformConnections, posts } from '../shared/schema';
import { eq } from 'drizzle-orm';

async function debugTwitterMetrics() {
  console.log('🔍 Debugging Twitter Metrics Batch Fetch...\n');
  
  // Get Twitter credentials
  const [twitterConnection] = await db
    .select()
    .from(platformConnections)
    .where(eq(platformConnections.platform, 'twitter'));
    
  if (!twitterConnection?.credentials) {
    console.log('❌ No Twitter credentials found in database');
    return;
  }
  
  const creds = twitterConnection.credentials as any;
  console.log('✅ Twitter credentials found');
  console.log(`   API Key exists: ${!!creds.apiKey}`);
  console.log(`   API Secret exists: ${!!creds.apiSecret}`);
  console.log(`   Access Token exists: ${!!creds.accessToken}`);
  console.log(`   Access Token Secret exists: ${!!creds.accessTokenSecret}\n`);
  
  // Get some published posts with Twitter IDs
  const publishedPosts = await db
    .select()
    .from(posts)
    .where(eq(posts.status, 'published'))
    .limit(10);
    
  console.log(`📊 Found ${publishedPosts.length} published posts (limited to 10)`);
  
  // Filter for posts with Twitter IDs
  const twitterPosts = publishedPosts.filter(p => {
    const pd = p.platformData as any;
    return pd?.twitter?.tweetId;
  });
  
  console.log(`🐦 Posts with Twitter IDs: ${twitterPosts.length}\n`);
  
  if (twitterPosts.length === 0) {
    console.log('❌ No posts with Twitter IDs found');
    return;
  }
  
  // Extract tweet IDs
  const tweetIds = twitterPosts.map(p => {
    const pd = p.platformData as any;
    return pd.twitter.tweetId;
  });
  
  console.log('📋 Tweet IDs to fetch:');
  tweetIds.forEach(id => console.log(`   - ${id}`));
  console.log('');
  
  // Create Twitter client
  const twitterClient = new TwitterApi({
    appKey: creds.apiKey || process.env.TWITTER_API_KEY!,
    appSecret: creds.apiSecret || process.env.TWITTER_API_SECRET!,
    accessToken: creds.accessToken || process.env.TWITTER_ACCESS_TOKEN!,
    accessSecret: creds.accessTokenSecret || process.env.TWITTER_ACCESS_TOKEN_SECRET!,
  });
  
  console.log('🔄 Calling Twitter v2.tweets API...');
  
  try {
    const result = await twitterClient.v2.tweets(tweetIds, {
      'tweet.fields': ['public_metrics', 'created_at'],
    });
    
    console.log('\n✅ Twitter API Response:');
    console.log(`   Data exists: ${!!result.data}`);
    console.log(`   Data type: ${typeof result.data}`);
    console.log(`   Data is array: ${Array.isArray(result.data)}`);
    
    if (result.data) {
      console.log(`   Tweet count: ${result.data.length}`);
      console.log('\n📈 Metrics for each tweet:');
      for (const tweet of result.data) {
        console.log(`\n   Tweet ID: ${tweet.id}`);
        console.log(`   - Likes: ${tweet.public_metrics?.like_count}`);
        console.log(`   - Retweets: ${tweet.public_metrics?.retweet_count}`);
        console.log(`   - Replies: ${tweet.public_metrics?.reply_count}`);
        console.log(`   - Quotes: ${tweet.public_metrics?.quote_count}`);
      }
    }
    
    if (result.errors) {
      console.log('\n⚠️ Errors in response:');
      console.log(JSON.stringify(result.errors, null, 2));
    }
    
  } catch (error: any) {
    console.log('\n❌ Twitter API Error:');
    console.log(`   Message: ${error.message}`);
    console.log(`   Code: ${error.code}`);
    if (error.data) {
      console.log(`   Data: ${JSON.stringify(error.data, null, 2)}`);
    }
  }
  
  console.log('\n🏁 Debug complete');
  process.exit(0);
}

debugTwitterMetrics();
