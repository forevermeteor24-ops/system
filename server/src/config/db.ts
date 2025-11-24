import mongoose from "mongoose";

export async function connectDB() {
  const url = process.env.MONGO_URL || "mongodb://127.0.0.1:27017/logistics";
  try {
    await mongoose.connect(url);
    console.log("✅ MongoDB connected");
  } catch (err) {
    console.error("❌ MongoDB connect error:", err);
    process.exit(1);
  }
}
