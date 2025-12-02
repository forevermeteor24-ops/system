import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { fetchOrder, updateStatus, deleteOrder } from "../api/orders";
import { formatRemainingETA } from "../utils/formatETA";

declare const AMap: any;

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [order, setOrder] = useState<any>(null);
  const [remainingTime, setRemainingTime] = useState<string>("--");

  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  /* ------------------ 获取订单 ------------------ */
  useEffect(() => {
    if (!id) return;

    let mounted = true;

    (async () => {
      try {
        const o = await fetchOrder(id);
        if (!mounted) return;
        setOrder(o);

        // 地图初始化
        await new Promise<void>((resolve) => {
          const wait = () => (mapRef.current ? resolve() : requestAnimationFrame(wait));
          wait();
        });

        const map =
          mapInstanceRef.current ||
          new AMap.Map(mapRef.current!, { zoom: 12 });

        mapInstanceRef.current = map;

        // 路线绘制
        if (o.routePoints && o.routePoints.length > 0) {
          const path = o.routePoints.map((p: any) => new AMap.LngLat(p.lng, p.lat));

          const polyline = new AMap.Polyline({
            path,
            strokeWeight: 6,
            strokeColor: "#1677ff",
            showDir: true,
          });

          map.add(polyline);
          map.setFitView([polyline]);

          // Marker
          const startPos = path[0];
          const endPos = path[path.length - 1];

          const marker = new AMap.Marker({
            position: o.status === "已送达" ? endPos : startPos,
            icon: "https://webapi.amap.com/theme/v1.3/markers/n/mark_b.png",
            offset: new AMap.Pixel(-13, -30),
          });

          map.add(marker);
          markerRef.current = marker;
        }
      } catch (err) {
        console.error("获取订单失败", err);
        alert("订单获取失败");
        navigate("/orders");
      }
    })();

    return () => {
      mounted = false;
    };
  }, [id]);

  /* ------------------ 剩余时间更新 ------------------ */
  useEffect(() => {
    if (!order?.expectedArrival) return;

    setRemainingTime(formatRemainingETA(order.expectedArrival));

    const t = setInterval(() => {
      setRemainingTime(formatRemainingETA(order.expectedArrival));
    }, 60000);

    return () => clearInterval(t);
  }, [order]);

  /* ------------------ 操作按钮 ------------------ */
  async function handleConfirmDelivered() {
    if (!order) return;
    await updateStatus(order._id, "已完成");
    setOrder({ ...order, status: "已完成" });
  }

  async function handleReturn() {
    if (!order) return;
    await updateStatus(order._id, "用户申请退货");
    setOrder({ ...order, status: "用户申请退货" });
  }

  async function handleDelete() {
    if (!confirm("确认删除订单？")) return;
    await deleteOrder(order._id);
    alert("订单已删除");
    navigate("/orders");
  }

  /* ------------------ 时间线数据 ------------------ */
  const timelineOrder = ["待发货", "配送中", "已送达", "已完成"];
  const activeIndex = order ? timelineOrder.indexOf(order.status) : -1;

  const timelineItems = timelineOrder.map((name, i) => ({
    name,
    desc:
      name === "待发货"
        ? "商家正在准备发货"
        : name === "配送中"
        ? "快递员正在配送，请保持电话畅通"
        : name === "已送达"
        ? "包裹已送达"
        : "订单已完成",
    time:
      name === "已送达" && order?.deliveredAt
        ? new Date(order.deliveredAt).toLocaleString()
        : "",
    active: i <= activeIndex,
  }));

  return (
    <div style={layout}>
      {/* ---------------- 左侧 ---------------- */}
      <div style={left}>
        {order && (
          <>
            {/* 订单详情卡片 */}
            <div style={card}>
              <h2 style={cardTitle}>订单详情</h2>

              <div style={row}>商品：{order.title}</div>
              <div style={row}>数量：{order.quantity}</div>
              <div style={row}>单价：¥{order.price}</div>
              <div style={row}>总价：¥{order.totalPrice}</div>

              <div style={row}>
                剩余时间：{order.expectedArrival ? remainingTime : "--"}
              </div>

              <div style={row}>地址：{order.address.detail}</div>

              <div style={statusLabel(order.status)}>
                状态：{order.status}
              </div>

              {/* 操作按钮 */}
              <div style={{ marginTop: 16 }}>
                {order.status === "已送达" && (
                  <button style={btnBlue} onClick={handleConfirmDelivered}>
                    确认收货
                  </button>
                )}

                {(order.status === "配送中" ||
                  order.status === "待发货") && (
                  <button style={btnRed} onClick={handleReturn}>
                    申请退货
                  </button>
                )}

                {(order.status === "已完成" ||
                  order.status === "商家已取消") && (
                  <button style={btnGrey} onClick={handleDelete}>
                    删除订单
                  </button>
                )}
              </div>
            </div>

            {/* 特殊状态提示 */}
            {(order.status === "商家已取消" ||
              order.status === "用户申请退货") && (
              <div style={card}>
                <h3 style={{ marginTop: 0 }}>提示</h3>
                <div style={{ color: "#ff4d4f" }}>
                  {order.status === "商家已取消"
                    ? "商家已取消订单"
                    : "用户已申请退货，请等待商家处理"}
                </div>
              </div>
            )}

            {/* 时间线卡片 */}
            <div style={card}>
              <h3 style={cardTitle}>物流状态</h3>

              {timelineItems.map((item, idx) => (
                <div key={idx} style={timelineRow}>
                  <div>
                    <div
                      style={{
                        ...dot,
                        background: item.active ? "#1677ff" : "#ccc",
                      }}
                    ></div>
                    {idx < timelineItems.length - 1 && (
                      <div
                        style={{
                          ...line,
                          background: item.active ? "#1677ff" : "#ccc",
                        }}
                      ></div>
                    )}
                  </div>

                  <div style={{ marginLeft: 12 }}>
                    <div
                      style={{
                        fontSize: 16,
                        fontWeight: item.active ? 600 : 500,
                        color: item.active ? "#1677ff" : "#444",
                      }}
                    >
                      {item.name}
                    </div>
                    <div style={{ marginTop: 4, color: "#666" }}>
                      {item.desc}
                    </div>
                    {item.time && (
                      <div style={{ marginTop: 4, color: "#999", fontSize: 12 }}>
                        {item.time}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ---------------- 右侧地图 ---------------- */}
      <div style={right}>
        <div
          ref={mapRef}
          style={{
            width: "100%",
            height: "100%",
            borderRadius: 10,
            border: "1px solid #ddd",
          }}
        />
      </div>
    </div>
  );
}

/* ------------------ 样式 ------------------ */

const layout: React.CSSProperties = {
  display: "flex",
  height: "100vh",
  gap: 16,
  padding: 16,
  boxSizing: "border-box",
};

const left: React.CSSProperties = {
  width: "40%",
  display: "flex",
  flexDirection: "column",
  gap: 16,
  overflowY: "auto",
};

const right: React.CSSProperties = {
  width: "60%",
};

const card: React.CSSProperties = {
  background: "#fff",
  padding: 20,
  borderRadius: 10,
  boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
};

const cardTitle: React.CSSProperties = {
  margin: 0,
  marginBottom: 16,
};

const row: React.CSSProperties = {
  marginBottom: 6,
};

const btnBlue: React.CSSProperties = {
  padding: "8px 14px",
  background: "#1677ff",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  marginRight: 8,
};

const btnRed: React.CSSProperties = {
  padding: "8px 14px",
  background: "#ff4d4f",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  marginRight: 8,
};

const btnGrey: React.CSSProperties = {
  padding: "8px 14px",
  background: "#999",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
};

const statusLabel = (status: string): React.CSSProperties => ({
  marginTop: 10,
  display: "inline-block",
  padding: "4px 10px",
  borderRadius: 6,
  color: "#fff",
  background:
    status === "待发货"
      ? "#faad14"
      : status === "配送中"
      ? "#1677ff"
      : status === "已送达"
      ? "#52c41a"
      : "#666",
});

const timelineRow: React.CSSProperties = {
  display: "flex",
  marginBottom: 24,
};

const dot: React.CSSProperties = {
  width: 14,
  height: 14,
  borderRadius: "50%",
};

const line: React.CSSProperties = {
  width: 2,
  height: 32,
  marginLeft: 6,
};

