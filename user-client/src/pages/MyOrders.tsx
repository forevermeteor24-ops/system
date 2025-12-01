import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { fetchOrders } from "../api/orders";
import { fetchMerchants } from "../api/merchants";
import { fetchProductsByMerchant } from "../api/products";  // 获取商品的 API
import http from "../api/http";
import type { Order } from "../types/order";

export default function MyOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState("time_desc");

  const [showModal, setShowModal] = useState(false);
  const [merchants, setMerchants] = useState<any[]>([]); 
  const [products, setProducts] = useState<any[]>([]);  // 存储商家的商品列表
  const [merchantId, setMerchantId] = useState("");
  const [productId, setProductId] = useState("");  // 选择的商品ID
  const [quantity, setQuantity] = useState(1);  // 商品数量
  const [title, setTitle] = useState("");  // 商品名称
  const [userAddress, setUserAddress] = useState("");  // 用户地址

  const navigate = useNavigate();  // 使用 useNavigate

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

  // 当商家选择变化时，加载该商家的商品列表
  const handleMerchantChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedMerchantId = e.target.value;
    setMerchantId(selectedMerchantId);
  
    // 获取该商家的商品列表
    try {
      const productList = await fetchProductsByMerchant(selectedMerchantId);  // 通过商家ID获取商品
      setProducts(productList);  // 更新商品列表
    } catch (err) {
      console.error(err);
      alert("无法加载商品列表");
    }
  };

  // 创建订单
  const createOrder = async () => {
    if (!merchantId) return alert("请选择商家！");
    if (!productId) return alert("请选择商品！");
    if (!userAddress.trim()) return alert("用户地址为空，请去个人资料设置！");
    if (!quantity || quantity <= 0) return alert("请输入有效的商品数量！");

    try {
      const selectedProduct = products.find((product) => product._id === productId);

      await http.post("/api/orders", {
        merchantId,
        title: selectedProduct?.name,  // 使用商品名称作为订单标题
        price: selectedProduct?.price,  // 使用商品价格
        quantity,  // 传递数量
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

  // 排序逻辑
  const sortedOrders = [...orders].sort((a, b) => {
    const tA = a.createdAt ? +new Date(a.createdAt) : 0;
    const tB = b.createdAt ? +new Date(b.createdAt) : 0;

    if (sort === "time_desc") return tB - tA;
    if (sort === "time_asc") return tA - tB;
    if (sort === "price_desc") return (b.price || 0) - (a.price || 0);
    if (sort === "price_asc") return (a.price || 0) - (b.price || 0);
    return 0;
  });

  // 退出登录
  const handleLogout = () => {
    localStorage.removeItem("token");
    navigate("/login");  // 使用 navigate 跳转到登录页面
  };

  if (loading) return <div>加载中...</div>;

  return (
    <div style={{ padding: 24 }}>
      <h2>我的订单</h2>

      {/* 顶部按钮：退出登录 */}
      <button
        onClick={handleLogout}
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

      {/* 修改账户信息按钮 */}
      <button
        onClick={() => navigate("/profile")}  // 导航到个人信息页面
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
        修改账户信息
      </button>

      {/* 创建订单按钮 */}
      <button
        onClick={() => {
          loadCreateOrderData();
          setShowModal(true);
        }}
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
          <Link to={`/orders/${o._id}`} style={{ fontSize: 16 }}>
            <b>{o.title}</b>
          </Link>
          <div style={{ fontSize: 14, color: "#888" }}>
            状态：{o.status}
            <br />
            价格：{o.price} 元
            <br />
            数量：{o.quantity} 件
            <br />
            总价：{o.price * o.quantity} 元  {/* 计算总价 */}
            <br />
            创建时间：{o.createdAt ? new Date(o.createdAt).toLocaleString() : "未知"}
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
                onChange={handleMerchantChange}
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
              <select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                style={{ width: "100%", padding: 8, marginTop: 6 }}
                disabled={!merchantId}
              >
                <option value="">请选择商品</option>
                {products.map((product) => (
                  <option key={product._id} value={product._id}>
                    {product.name} - ¥{product.price}
                  </option>
                ))}
              </select>
            </div>

            {/* 商品数量输入框 */}
            <div style={{ marginTop: 15 }}>
              <label>商品数量</label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value))}
                style={{ width: "100%", padding: 8, marginTop: 6 }}
                min={1}
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
