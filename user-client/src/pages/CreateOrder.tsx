import React, { useEffect, useState } from "react";
import http from "../api/http";

export default function CreateOrder() {
  const [merchants, setMerchants] = useState<any[]>([]);
  const [merchantId, setMerchantId] = useState("");

  const [title, setTitle] = useState("");          // 商品名称
  const [price, setPrice] = useState("");          // 商品价格
  const [userAddress, setUserAddress] = useState(""); // 登录用户默认地址

  const [loading, setLoading] = useState(false);

  /** 获取商家列表 */
  const loadMerchants = async () => {
    try {
      const res = await http.get("/merchants");
      setMerchants(res.data);
    } catch (err) {
      console.error(err);
      alert("加载商家失败");
    }
  };

  /** 获取当前登录用户地址 */
  const loadUserProfile = async () => {
    try {
      const res = await http.get("/auth/me");
      const addr = res.data.address?.detail || "";
      setUserAddress(addr);
    } catch (err) {
      console.error(err);
      alert("无法获取用户地址，请检查控制台");
    }
  };

  useEffect(() => {
    loadMerchants();
    loadUserProfile();
  }, []);

  /** 创建订单 */
  const createOrder = async () => {
    if (!merchantId) return alert("请选择商家！");
    if (!title.trim()) return alert("请输入商品名称！");
    if (!price.trim()) return alert("请输入价格！");
    if (!userAddress.trim()) return alert("用户地址为空，请去个人资料设置！");

    setLoading(true);
    try {
      await http.post("/orders", {
        merchantId,
        title,
        price: Number(price),
        address: {
          detail: userAddress,
          lng: null,
          lat: null,
        },
      });

      alert("订单创建成功！");
      setTitle("");
      setPrice("");
      setMerchantId("");

    } catch (err) {
      console.error(err);
      alert("创建订单失败，请检查控制台");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 500, margin: "0 auto", padding: 24 }}>
      <h2>创建订单</h2>

      {/* 商家选择 */}
      <div style={{ marginTop: 20 }}>
        <label>选择商家</label>
        <select
          value={merchantId}
          onChange={(e) => setMerchantId(e.target.value)}
          style={{
            width: "100%",
            padding: 8,
            marginTop: 6,
            borderRadius: 6,
            border: "1px solid #ccc",
          }}
        >
          <option value="">请选择商家</option>
          {merchants.map((m) => (
            <option key={m._id} value={m._id}>
              {m.username}
            </option>
          ))}
        </select>
      </div>

      {/* 商品名称 */}
      <div style={{ marginTop: 20 }}>
        <label>商品名称</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="输入商品名称"
          style={{
            width: "100%",
            padding: 8,
            marginTop: 6,
            borderRadius: 6,
            border: "1px solid #ccc",
          }}
        />
      </div>

      {/* 商品价格 */}
      <div style={{ marginTop: 20 }}>
        <label>商品价格</label>
        <input
          type="number"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="输入商品价格"
          style={{
            width: "100%",
            padding: 8,
            marginTop: 6,
            borderRadius: 6,
            border: "1px solid #ccc",
          }}
        />
      </div>

      {/* 自动填入用户地址（只读） */}
      <div style={{ marginTop: 20 }}>
        <label>收货地址（自动读取用户资料）</label>
        <input
          value={userAddress}
          readOnly
          style={{
            width: "100%",
            padding: 8,
            marginTop: 6,
            borderRadius: 6,
            background: "#eee",
            border: "1px solid #ccc",
            cursor: "not-allowed",
          }}
        />
      </div>

      <button
        onClick={createOrder}
        disabled={loading}
        style={{
          marginTop: 30,
          width: "100%",
          padding: "10px 14px",
          background: loading ? "#888" : "#007bff",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          cursor: loading ? "not-allowed" : "pointer",
        }}
      >
        {loading ? "创建中..." : "创建订单"}
      </button>
    </div>
  );
}
