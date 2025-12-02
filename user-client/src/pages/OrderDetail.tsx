import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
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
  const wsRef = useRef<WebSocket | null>(null);

  /* ---------------- 获取订单数据 ---------------- */
  useEffect(() => {
    if (!id) return;

    let mounted = true;

    (async () => {
      try {
        const o = await fetchOrder(id);
        if (!mounted) return;

        setOrder(o);

        /* 等 DOM 挂载 */
        await new Promise<void>((resolve) => {
          const wait = () =>
            mapRef.current ? resolve() : requestAnimationFrame(wait);
          wait();
        });

        /* 初始化地图 */
        const map =
          mapInstanceRef.current ||
          new AMap.Map(mapRef.current!, {
            zoom: 12,
            center: [121.47, 31.23],
          });
        mapInstanceRef.current = map;
        map.plugin(["AMap.MoveAnimation"], () => {
          console.log("MoveAnimation 插件已加载");
        });
        

        /* 拿到路线点，安全处理 */
        const routePoints = o.routePoints ?? [];

        /** 绘制路线 */
        if (routePoints.length > 1) {
          const path = routePoints.map(
            (p: any) => new AMap.LngLat(p.lng, p.lat)
          );

          const polyline = new AMap.Polyline({
            path,
            strokeWeight: 4,
            strokeColor: "#1677ff",
            showDir: true,
          });

          map.add(polyline);
          map.setFitView([polyline]);

          /** 小车 marker */
          const startPos = path[0];
          const endPos = path[path.length - 1];

          const marker = new AMap.Marker({
            position: o.status === "已送达" ? endPos : startPos,
            icon: "https://webapi.amap.com/theme/v1.3/markers/n/mark_b.png",
            offset: new AMap.Pixel(-13, -30),
            autoRotation: true,
          });

          map.add(marker);
          markerRef.current = marker;
        }
      } catch (e) {
        alert("订单获取失败");
        navigate("/orders");
      }
    })();

    return () => {
      mounted = false;
    };
  }, [id]);

  /* ---------------- WebSocket 实时移动小车 ---------------- */
useEffect(() => {
  if (!order) return;
  if (order.status !== "配送中") return;

  // 确保地图 marker 已创建
  if (!markerRef.current) {
    console.log("marker 未创建，等待地图初始化...");
    return;
  }

  // 使用你的正式后端地址（保持不变）
  const ws = new WebSocket("wss://system-backend.zeabur.app");
  wsRef.current = ws;

  ws.onopen = () => {
    console.log("WS 已连接");

    // 订阅订单轨迹
    ws.send(JSON.stringify({
      type: "subscribe",
      orderId: order._id,
    }));

    ws.send(JSON.stringify({
      type: "request-current",
      orderId: order._id,
    }));
  };

  ws.onmessage = (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }

    /** 兼容后端格式 { type:'location', position:{lng,lat} } */
    let pos = msg.position || null;

    if (!pos || !pos.lng || !pos.lat) return;
    if (!markerRef.current) return;

    const newPos = new AMap.LngLat(pos.lng, pos.lat);

    // 🚗 平滑移动（需要 MoveAnimation 插件）
    markerRef.current.moveTo(newPos, {
      duration: 1000,
      autoRotation: true,
    });
  };

  ws.onerror = () => console.log("WS 出错");
  ws.onclose = () => console.log("WS 关闭");

  return () => ws.close();
}, [order?.status, markerRef.current]);

          

  /* ---------------- 剩余时间更新 ---------------- */
  useEffect(() => {
    if (!order || !order.eta) return;

    const update = () => {
      setRemainingTime(formatRemainingETA(order.eta));
    };

    update();
    const timer = setInterval(update, 60000);
    return () => clearInterval(timer);
  }, [order]);

  /* ---------------- 按钮操作 ---------------- */
  async function confirmReceive() {
    await updateStatus(order._id, "已完成");
    setOrder({ ...order, status: "已完成" });
    alert("确认收货成功");
  }

  async function handleDelete() {
    if (!confirm("确认删除订单？")) return;
    await deleteOrder(order._id);
    alert("订单已删除");
    navigate("/orders");
  }

  /* ---------------- 物流时间线 ---------------- */
  const timeLine = [
    { key: "待发货", title: "待发货", desc: "商家正在准备发货" },
    { key: "配送中", title: "配送中", desc: "快递员正在配送，请保持电话畅通" },
    {
      key: "已送达",
      title: "已送达",
      desc: "包裹已送达",
      time: order?.deliveredAt,
    },
    { key: "已完成", title: "已完成", desc: "订单已完成" },
  ];

  const activeIndex = order
    ? timeLine.findIndex((i) => i.key === order.status)
    : -1;

  /* ---------------- 样式 ---------------- */
  const layout: React.CSSProperties = {
    display: "flex",
    gap: 20,
    height: "100vh",
    padding: 20,
    boxSizing: "border-box",
  };

  const left: React.CSSProperties = {
    width: "55%",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 20,
  };

  const right: React.CSSProperties = {
    width: "45%",
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-start",
  };

  const card: React.CSSProperties = {
    background: "#fff",
    padding: 20,
    borderRadius: 12,
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
  };

  return (
    <div style={layout}>
      {/* 左侧详情 */}
      <div style={left}>
        <div style={card}>
          <h2>订单详情</h2>

          {!order ? (
            <p>加载中...</p>
          ) : (
            <>
              <p>商品：{order.title}</p>
              <p>数量：{order.quantity}</p>
              <p>单价：¥{order.price}</p>
              <p>总价：¥{order.totalPrice}</p>

              <p>剩余时间：{remainingTime}</p>

              <p>地址：{order.address?.detail}</p>

              <p>
                状态：
                <span style={{ color: "#1677ff", fontWeight: "bold" }}>
                  {order.status}
                </span>
              </p>

              {order.status === "已送达" && (
                <button
                  onClick={confirmReceive}
                  style={{
                    background: "#52c41a",
                    padding: "6px 14px",
                    borderRadius: 6,
                    color: "#fff",
                    marginTop: 10,
                  }}
                >
                  确认收货
                </button>
              )}

              {(order.status === "已完成" ||
                order.status === "商家已取消") && (
                <button
                  onClick={handleDelete}
                  style={{
                    background: "#ff4d4f",
                    padding: "6px 14px",
                    borderRadius: 6,
                    color: "#fff",
                    marginLeft: 10,
                  }}
                >
                  删除订单
                </button>
              )}
            </>
          )}
        </div>

        {/* 时间线 */}
        <div style={card}>
          <h3>物流状态</h3>

          {timeLine.map((item, index) => {
            const active = index <= activeIndex;

            return (
              <div key={item.key} style={{ marginBottom: 18 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: active ? "#1677ff" : "#ccc",
                    }}
                  />
                  <b style={{ color: active ? "#1677ff" : "#444" }}>
                    {item.title}
                  </b>
                </div>

                <div style={{ paddingLeft: 18, marginTop: 2 }}>
                  <p style={{ margin: 0 }}>{item.desc}</p>
                  {item.time && (
                    <p style={{ margin: 0, color: "#999" }}>{item.time}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 右侧地图 */}
      <div style={right}>
        <div
          ref={mapRef}
          style={{
            width: "92%",
            height: 360,
            borderRadius: 12,
            border: "1px solid #ddd",
            boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
            background: "#fff",
          }}
        />
      </div>
    </div>
  );
}
