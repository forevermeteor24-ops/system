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
  const [statusFilter, setStatusFilter] = useState("全部");

  // 创建订单弹窗
  const [showModal, setShowModal] = useState(false);
  const [merchants, setMerchants] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [merchantId, setMerchantId] = useState("");
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [userAddress, setUserAddress] = useState("");

  const navigate = useNavigate();

  /* ---------------- 加载 ---------------- */
  useEffect(() => {
    (async () => {
      try {
        const data = await fetchOrders();
        setOrders(data);
      } catch (err) {
        console.error("获取订单失败:", err);
        alert("获取订单失败");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const loadCreateOrderData = async () => {
    try {
      const merchantList = await fetchMerchants();
      setMerchants(merchantList);

      const u = await http.get("/api/auth/me");
      setUserAddress(u.data.address?.detail || "");
    } catch (err) {
      console.error("加载失败:", err);
      alert("无法加载创建订单信息");
    }
  };

  const handleMerchantChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setMerchantId(id);
    const productList = await fetchProductsByMerchant(id);
    setProducts(productList);
  };

  const createOrder = async () => {
    if (!merchantId) return alert("请选择商家！");
    if (!productId) return alert("请选择商品！");
    if (!userAddress.trim()) return alert("用户地址为空，请去个人资料设置！");
    if (quantity <= 0) return alert("数量不正确");

    try {
      const product = products.find((p) => p._id === productId);

      await http.post("/api/orders", {
        merchantId,
        productId,
        title: product?.name,
        quantity,
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

  /* ---------------- 排序 & 筛选 ---------------- */
  const sortedOrders = [...orders].sort((a, b) => {
    const tA = a.createdAt ? +new Date(a.createdAt) : 0;
    const tB = b.createdAt ? +new Date(b.createdAt) : 0;

    if (sort === "time_desc") return tB - tA;
    if (sort === "time_asc") return tA - tB;
    if (sort === "price_desc") return (b.price || 0) - (a.price || 0);
    if (sort === "price_asc") return (a.price || 0) - (b.price || 0);
    return 0;
  });

  const filteredOrders = sortedOrders.filter((o) =>
    statusFilter === "全部" ? true : o.status === statusFilter
  );

  /* ---------------- UI ---------------- */

  if (loading) return <div style={{ padding: 24 }}>加载中...</div>;

  return (
    <div style={page}>

      {/* 顶部导航栏 */}
      <div style={navbar}>
        <div style={navTitle}>我的订单</div>

        <div style={{ display: "flex", gap: 12 }}>
          <button style={navBtn} onClick={() => navigate("/profile")}>资料</button>
          <button
            style={{ ...navBtn, background: "#ff4d4f" }}
            onClick={() => {
              localStorage.removeItem("token");
              navigate("/login");
            }}
          >
            退出
          </button>
        </div>
      </div>

      {/* 主体内容容器 */}
      <div style={contentWrapper}>

        {/* 筛选栏 */}
        <div style={filterBar}>
          {/* 排序 */}
          <div style={filterItem}>
            <span>排序：</span>
            <select style={select} value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="time_desc">最新</option>
              <option value="time_asc">最早</option>
              <option value="price_desc">价格高</option>
              <option value="price_asc">价格低</option>
            </select>
          </div>

          {/* 状态 */}
          <div style={filterItem}>
            <span>状态：</span>
            <select
              style={select}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="全部">全部</option>
              <option value="待发货">待发货</option>
              <option value="配送中">配送中</option>
              <option value="已送达">已送达</option>
              <option value="已完成">已完成</option>
              <option value="用户申请退货">用户申请退货</option>
              <option value="商家已取消">商家已取消</option>
            </select>
          </div>

          <button
            style={createBtn}
            onClick={() => {
              loadCreateOrderData();
              setShowModal(true);
            }}
          >
            + 创建订单
          </button>
        </div>

        {/* 订单卡片网格布局 */}
        <div style={grid}>
          {filteredOrders.map((o) => (
            <div style={card} key={o._id}>
              <div style={cardHeader}>
                <span style={cardTitle}>{o.title}</span>
                <span style={statusTag(o.status)}>{o.status}</span>
              </div>

              <div style={cardInfo}>
                <div>价格：<b>{o.price}</b> 元</div>
                <div>数量：{o.quantity} 件</div>
                <div>总价：<b>{o.price * o.quantity}</b> 元</div>
                <div style={{ color: "#888", marginTop: 6 }}>
                  {o.createdAt ? new Date(o.createdAt).toLocaleString() : "未知"}
                </div>
              </div>

              <Link to={`/orders/${o._id}`} style={detailBtn}>
                查看详情 →
              </Link>
            </div>
          ))}
        </div>
      </div>

      {/* 创建订单弹窗 */}
      {showModal && (
        <div style={modalMask}>
          <div style={modal}>
            <h2 style={{ margin: 0 }}>创建订单</h2>

            <label>商家</label>
            <select style={input} value={merchantId} onChange={handleMerchantChange}>
              <option value="">请选择商家</option>
              {merchants.map((m) => (
                <option key={m._id} value={m._id}>{m.username}</option>
              ))}
            </select>

            <label>商品</label>
            <select
              style={input}
              value={productId}
              disabled={!merchantId}
              onChange={(e) => setProductId(e.target.value)}
            >
              <option value="">请选择商品</option>
              {products.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name} - ¥{p.price}
                </option>
              ))}
            </select>

            <label>数量</label>
            <input
              type="number"
              min={1}
              style={input}
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value))}
            />

            <label>地址</label>
            <input style={{ ...input, background: "#eee" }} value={userAddress} readOnly />

            <button style={modalPrimaryBtn} onClick={createOrder}>提交</button>
            <button style={modalCancelBtn} onClick={() => setShowModal(false)}>取消</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- 样式 ---------------- */

const page: React.CSSProperties = {
  minHeight: "100vh",
  background: "linear-gradient(135deg, #e3f2fd, #fce4ec)",
  paddingBottom: 40,
};

const navbar: React.CSSProperties = {
  height: 60,
  background: "#ffffffaa",
  backdropFilter: "blur(10px)",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "0 20px",
  position: "sticky",
  top: 0,
  zIndex: 10,
  borderBottom: "1px solid #eee",
};

const navTitle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: "bold",
};

const navBtn: React.CSSProperties = {
  padding: "8px 14px",
  background: "#1677ff",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
};

const contentWrapper: React.CSSProperties = {
  maxWidth: 1100,
  margin: "20px auto",
  padding: "0 20px",
};

/* 筛选栏 */
const filterBar: React.CSSProperties = {
  background: "#fff",
  padding: 16,
  borderRadius: 10,
  boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
  marginBottom: 20,
  display: "flex",
  alignItems: "center",
  gap: 20,
};

const filterItem: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
};

const select: React.CSSProperties = {
  padding: 8,
  borderRadius: 6,
  border: "1px solid #ccc",
};

const createBtn: React.CSSProperties = {
  marginLeft: "auto",
  padding: "8px 14px",
  background: "#52c41a",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
};

/* 订单网格 */
const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
  gap: 20,
};

const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  padding: 18,
  boxShadow: "0 4px 15px rgba(0,0,0,0.08)",
  transition: "0.25s",
};

(card as any)[":hover"] = {
  transform: "translateY(-6px)",
  boxShadow: "0 10px 25px rgba(0,0,0,0.12)",
};

const cardHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  marginBottom: 12,
};

const cardTitle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 600,
};

const statusTag = (status: string): React.CSSProperties => ({
  padding: "4px 8px",
  borderRadius: 6,
  color: "#fff",
  fontSize: 12,
  background:
    status === "待发货" ? "#faad14" :
    status === "配送中" ? "#1890ff" :
    status === "已送达" ? "#52c41a" :
    status === "已完成" ? "#16a34a" :
    status === "已申请退货" ? "#ff4d4f" :
    status === "商家已取消" ? "#999" :
    "#888",
});

const cardInfo: React.CSSProperties = {
  fontSize: 14,
  lineHeight: "22px",
  marginBottom: 12,
};

const detailBtn: React.CSSProperties = {
  display: "inline-block",
  marginTop: 10,
  padding: "6px 12px",
  background: "#1677ff",
  color: "#fff",
  borderRadius: 6,
  textDecoration: "none",
};

/* 弹窗 */
const modalMask: React.CSSProperties = {
  position: "fixed",
  left: 0,
  top: 0,
  right: 0,
  bottom: 0,
  background: "rgba(0,0,0,0.4)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
};

const modal: React.CSSProperties = {
  width: 380,
  padding: 20,
  background: "#fff",
  borderRadius: 12,
  boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
};

const input: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  marginTop: 6,
  marginBottom: 14,
  borderRadius: 6,
  border: "1px solid #ccc",
};

const modalPrimaryBtn: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  background: "#1677ff",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  marginBottom: 10,
};

const modalCancelBtn: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  background: "#aaa",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
};
