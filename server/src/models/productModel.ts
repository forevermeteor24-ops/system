import mongoose, { Document } from "mongoose";

export interface ProductDocument extends Document {
  name: string;
  price: number;
  merchantId: mongoose.Schema.Types.ObjectId; // 修改为 ObjectId 类型
}

const productSchema = new mongoose.Schema<ProductDocument>(
  {
    name: { type: String, required: true },
    price: { type: Number, required: true },
    merchantId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // 关联到 User 模型
  },
  { timestamps: true }
);

export default mongoose.model<ProductDocument>("Product", productSchema);
