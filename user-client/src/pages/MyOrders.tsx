import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";  // 使用 Link 跳转
import { fetchOrders } from "../api/orders";
import { fetchMerchants } from "../api/merchants";
import http from "../api/http";
import type { Order } from "../types/order";

export default function MyOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState("time_desc");

  const [showModal, setShowModal] = useState(false);
  const [merchants, setMerchants] = useState<any[]>([]);
  const [merchantId, setMerchantId] = useState("");
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [userAddress, setUserAddress] = useState("");

  const loadCreateOrderData = async () => {
    try {
      const data = await fetchMerchants();
      setMerchants(data);
      const u = await http.get("/api/auth/me");
      setUserAddress(u.data.address?.detail || "");
    } catch (err) {
      console.error(err);
      alert("无法加载创建订单信息");
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchOrders();
        setOrders(data);
      } catch (err) {
        console.error(err);
        alert("获取订单失败");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const openModal = () => {
    loadCreateOrderData();
    setShowModal(true);
  };

  const createOrder = async () => {
    if (!merchantId) return alert("请选择商家！");
    if (!title.trim()) return alert("请输入商品名称！");
    if (!price.trim()) return alert("请输入价格！");
    if (!userAddress.trim()) return alert("用户地址为空，请去个人资料设置！");

    try {
      await http.post("/api/orders", {
        merchantId,
        title,
        price: Number(price),
        address: { detail: userAddress, lng: null, lat: null },
      });

      alert("创建成功！");
      setShowModal(false);

      const data = await fetchOrders();
      setOrders(data);
    } catch (err) {
      console.error(err);
      alert("创建订单失败");
    }
  };

  const sortedOrders = [...orders].sort((a, b) => {
    const tA = a.createdAt ? +new Date(a.createdAt) : 0;
    const tB = b.createdAt ? +new Date(b.createdAt) : 0;

    if (sort === "time_desc") return tB - tA;
    if (sort === "time_asc") return tA - tB;
    if (sort === "price_desc") return (b.price || 0) - (a.price || 0);
    if (sort === "price_asc") return (a.price || 0) - (b.price || 0);
    return 0;
  });

  if (loading) return <div>加载中...</div>;

  return (
    <div style={{ padding: 24 }}>
      <h2>我的订单</h2>

      <button
        onClick={() => localStorage.removeItem("token")}
        style={{
          marginBottom: 20,
          padding: "10px 14px",
          background: "#ff4d4d",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          cursor: "pointer",
        }}
      >
        退出登录
      </button>

      <button
        onClick={openModal}
        style={{
          marginBottom: 20,
          padding: "10px 14px",
          background: "#007bff",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          cursor: "pointer",
        }}
      >
        创建订单
      </button>

      <div style={{ margin: "12px 0" }}>
        <label>排序方式： </label>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          style={{ padding: 6, borderRadius: 6 }}
        >
          <option value="time_desc">按创建时间（最新）</option>
          <option value="time_asc">按创建时间（最早）</option>
          <option value="price_desc">按价格（高→低）</option>
          <option value="price_asc">按价格（低→高）</option>
        </select>
      </div>

      {sortedOrders.map((o) => (
        <div key={o._id} style={{ padding: "12px 0", borderBottom: "1px solid #eee" }}>
          <Link to={`/orders/${o._id}`} style={{ fontSize: 16 }}>
            <b>{o.title}</b>
          </Link>
          <div style={{ fontSize: 14, color: "#888" }}>
            状态：{o.status}
            <br />
            价格：{o.price} 元
            <br />
            创建时间：{o.createdAt ? new Date(o.createdAt).toLocaleString() : '未知'}
          </div>
        </div>
      ))}
    </div>
  );
}
