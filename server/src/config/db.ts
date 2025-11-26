import mongoose from "mongoose";

export async function connectDB() {
  const url = process.env.MONGO_URI as string;

  if (!url) {
    console.error("❌ MONGO_URI is missing. Check environment variables!");
    process.exit(1);
  }

  try {
    await mongoose.connect(url as string);
    console.log("✅ MongoDB connected");
  } catch (err) {
    console.error("❌ MongoDB connect error:", err);
    process.exit(1);
  }
}
