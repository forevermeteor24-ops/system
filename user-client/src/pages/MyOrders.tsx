import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { fetchOrders } from "../api/orders";
// 👇 新增：引入你那个写对了地址的 API 函数
import { fetchMerchants } from "../api/merchants"; 
import type { Order } from "../types/order";
import http from "../api/http";

export default function MyOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const [sort, setSort] = useState("time_desc");

  /* 创建订单弹窗控制 */
  const [showModal, setShowModal] = useState(false);
  const [merchants, setMerchants] = useState<any[]>([]);
  const [merchantId, setMerchantId] = useState("");
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [userAddress, setUserAddress] = useState("");

  /** 加载商家列表 & 用户地址 */
  const loadCreateOrderData = async () => {
    try {
      // ✅ 修复：不再使用 http.get，改用 fetchMerchants() 直连 Zeabur
      // 这样能保证一定会从线上服务器拉取商家列表
      const data = await fetchMerchants();
      setMerchants(data);

      // 获取当前用户的地址
      // ⚠️ 注意：如果 http.ts 配置不对，这步可能还会报错，稍后检查 src/api/http.ts
      const u = await http.get("/api/auth/me");
      setUserAddress(u.data.address?.detail || "");
    } catch (err) {
      console.error(err);
      alert("无法加载创建订单信息");
    }
  };

  /** 获取订单列表 */
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

  /* 打开弹窗 */
  const openModal = () => {
    loadCreateOrderData();
    setShowModal(true);
  };

  /* 创建订单 */
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

      // 刷新订单
      const data = await fetchOrders();
      setOrders(data);
    } catch (err) {
      console.error(err);
      alert("创建订单失败");
    }
  };

  /* 排序逻辑 */
  const sortedOrders = [...orders].sort((a, b) => {
    // 简单的类型保护，防止 createdAt 为空报错
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

      {/* 顶部按钮 */}
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

      {/* 排序下拉框 */}
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

      {/* 订单列表 */}
      {sortedOrders.map((o) => (
        <div key={o._id} style={{ padding: "12px 0", borderBottom: "1px solid #eee" }}>
          <Link to={`/track/${o._id}`} style={{ fontSize: 16 }}>
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

      {/* 创建订单弹窗 */}
      {showModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 999,
          }}
        >
          <div
            style={{
              width: 350,
              background: "#fff",
              padding: 20,
              borderRadius: 8,
            }}
          >
            <h3>创建订单</h3>

            <div style={{ marginTop: 15 }}>
              <label>商家</label>
              <select
                value={merchantId}
                onChange={(e) => setMerchantId(e.target.value)}
                style={{ width: "100%", padding: 8, marginTop: 6 }}
              >
                <option value="">请选择商家</option>
                {merchants.map((m) => (
                  <option key={m._id} value={m._id}>
                    {m.username}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginTop: 15 }}>
              <label>商品名称</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={{ width: "100%", padding: 8, marginTop: 6 }}
              />
            </div>

            <div style={{ marginTop: 15 }}>
              <label>价格</label>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                style={{ width: "100%", padding: 8, marginTop: 6 }}
              />
            </div>

            <div style={{ marginTop: 15 }}>
              <label>地址</label>
              <input
                value={userAddress}
                readOnly
                placeholder="正在获取用户地址..."
                style={{
                  width: "100%",
                  padding: 8,
                  marginTop: 6,
                  background: "#eee",
                }}
              />
            </div>

            <button
              type="button"
              onClick={createOrder}
              style={{
                marginTop: 20,
                width: "100%",
                padding: "10px 14px",
                background: "#007bff",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              提交
            </button>

            <button
              type="button"
              onClick={() => setShowModal(false)}
              style={{
                marginTop: 10,
                width: "100%",
                padding: "10px 14px",
                background: "#aaa",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}