
import "dotenv/config";

console.log("Checking Twitter Environment Variables:");
console.log("TWITTER_API_KEY:", process.env.TWITTER_API_KEY ? "SET" : "MISSING");
console.log("TWITTER_API_SECRET:", process.env.TWITTER_API_SECRET ? "SET" : "MISSING");
console.log("TWITTER_ACCESS_TOKEN:", process.env.TWITTER_ACCESS_TOKEN ? "SET" : "MISSING");
console.log("TWITTER_ACCESS_TOKEN_SECRET:", process.env.TWITTER_ACCESS_TOKEN_SECRET ? "SET" : "MISSING");
