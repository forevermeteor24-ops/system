import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { fetchOrders } from "../api/orders";
import { fetchMerchants } from "../api/merchants";
import { fetchProductsByMerchant } from "../api/products";  
import http from "../api/http";
import type { Order } from "../types/order";

export default function MyOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState("time_desc");

  const [showModal, setShowModal] = useState(false);
  const [merchants, setMerchants] = useState<any[]>([]); 
  const [products, setProducts] = useState<any[]>([]);  
  const [merchantId, setMerchantId] = useState("");
  const [productId, setProductId] = useState("");  
  const [quantity, setQuantity] = useState(1);  // 新增数量
  const [userAddress, setUserAddress] = useState("");  

  const navigate = useNavigate();  

  // 加载商家列表及用户地址
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

  const handleMerchantChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedMerchantId = e.target.value;
    setMerchantId(selectedMerchantId);
  
    try {
      const productList = await fetchProductsByMerchant(selectedMerchantId);
      setProducts(productList);
    } catch (err) {
      console.error(err);
      alert("无法加载商品列表");
    }
  };

  const createOrder = async () => {
    if (!merchantId) return alert("请选择商家！");
    if (!productId) return alert("请选择商品！");
    if (!userAddress.trim()) return alert("用户地址为空，请去个人资料设置！");
    if (!quantity || quantity < 1) return alert("请输入正确的数量！");

    try {
      const selectedProduct = products.find((p) => p._id === productId);

      await http.post("/api/orders", {
        merchantId,
        title: selectedProduct?.name,
        price: selectedProduct?.price,
        quantity, // 发送数量
        address: { detail: userAddress, lng: null, lat: null },
      });

      alert("创建成功！");
      setShowModal(false);
      setQuantity(1);
      const data = await fetchOrders();
      setOrders(data);
    } catch (err) {
      console.error(err);
      alert("创建订单失败");
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

  const sortedOrders = [...orders].sort((a, b) => {
    const tA = a.createdAt ? +new Date(a.createdAt) : 0;
    const tB = b.createdAt ? +new Date(b.createdAt) : 0;

    if (sort === "time_desc") return tB - tA;
    if (sort === "time_asc") return tA - tB;
    if (sort === "price_desc") return (b.price * (b.quantity || 1)) - (a.price * (a.quantity || 1));
    if (sort === "price_asc") return (a.price * (a.quantity || 1)) - (b.price * (b.quantity || 1));
    return 0;
  });

  const handleLogout = () => {
    localStorage.removeItem("token");
    navigate("/login");
  };

  if (loading) return <div>加载中...</div>;

  return (
    <div style={{ padding: 24 }}>
      <h2>我的订单</h2>

      <button
        onClick={handleLogout}
        style={{ marginBottom: 20, padding: "10px 14px", background: "#ff4d4d", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}
      >
        退出登录
      </button>

      <button
        onClick={() => navigate("/profile")}
        style={{ marginBottom: 20, padding: "10px 14px", background: "#007bff", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}
      >
        修改账户信息
      </button>

      <button
        onClick={() => { loadCreateOrderData(); setShowModal(true); }}
        style={{ marginBottom: 20, padding: "10px 14px", background: "#007bff", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}
      >
        创建订单
      </button>

      <div style={{ margin: "12px 0" }}>
        <label>排序方式： </label>
        <select value={sort} onChange={(e) => setSort(e.target.value)} style={{ padding: 6, borderRadius: 6 }}>
          <option value="time_desc">按创建时间（最新）</option>
          <option value="time_asc">按创建时间（最早）</option>
          <option value="price_desc">按总价（高→低）</option>
          <option value="price_asc">按总价（低→高）</option>
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
            数量：{o.quantity || 1}
            <br />
            单价：{o.price} 元
            <br />
            总价：{(o.price || 0) * (o.quantity || 1)} 元
            <br />
            创建时间：{o.createdAt ? new Date(o.createdAt).toLocaleString() : "未知"}
          </div>
        </div>
      ))}

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
                onChange={handleMerchantChange}
                style={{ width: "100%", padding: 8, marginTop: 6 }}
              >
                <option value="">请选择商家</option>
                {merchants.map((m) => (
                  <option key={m._id} value={m._id}>{m.username}</option>
                ))}
              </select>
            </div>

            <div style={{ marginTop: 15 }}>
              <label>商品名称</label>
              <select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                style={{ width: "100%", padding: 8, marginTop: 6 }}
                disabled={!merchantId}
              >
                <option value="">请选择商品</option>
                {products.map((p) => (
                  <option key={p._id} value={p._id}>{p.name} - ¥{p.price}</option>
                ))}
              </select>
            </div>

            <div style={{ marginTop: 15 }}>
              <label>数量</label>
              <input
                type="number"
                value={quantity}
                min={1}
                onChange={(e) => setQuantity(Number(e.target.value))}
                style={{ width: "100%", padding: 8, marginTop: 6 }}
              />
            </div>

            <div style={{ marginTop: 15 }}>
              <label>地址</label>
              <input
                value={userAddress}
                readOnly
                placeholder="正在获取用户地址..."
                style={{ width: "100%", padding: 8, marginTop: 6, background: "#eee" }}
              />
            </div>

            <button
              type="button"
              onClick={createOrder}
              style={{ marginTop: 20, width: "100%", padding: "10px 14px", background: "#007bff", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}
            >
              提交
            </button>

            <button
              type="button"
              onClick={() => setShowModal(false)}
              style={{ marginTop: 10, width: "100%", padding: "10px 14px", background: "#aaa", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
