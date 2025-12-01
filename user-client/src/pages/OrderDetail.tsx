import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  fetchOrder,
  requestRoute,
  updateStatus,
  deleteOrder,
} from "../api/orders";
import { formatRemainingETA } from "../utils/formatETA"
declare const AMap: any;

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [order, setOrder] = useState<any>(null);
  const [remainingTime, setRemainingTime] = useState<string>("--");
  const [routePoints, setRoutePoints] = useState<any[]>([]);
  const [routeLoaded, setRouteLoaded] = useState(false);
  const [fitViewDone, setFitViewDone] = useState(false);

  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);

  /* ------------------ 获取订单 & 初始化地图 ------------------ */
  useEffect(() => {
    if (!id) return;
    let mounted = true;

    (async () => {
      try {
        const o = await fetchOrder(id);
        if (!mounted) return;
        setOrder(o);

        // 初始化地图
        await new Promise<void>((resolve) => {
          const wait = () =>
            mapRef.current ? resolve() : requestAnimationFrame(wait);
          wait();
        });

        const map =
          mapInstanceRef.current ||
          new AMap.Map(mapRef.current!, { zoom: 14, center: [116.397428, 39.90923] });
        mapInstanceRef.current = map;

        const r = await requestRoute(o._id);

        if (r?.points?.length > 0) {
          setRoutePoints(r.points);
          setRouteLoaded(true);
          map.setCenter([r.origin.lng, r.origin.lat]);

          const path = r.points.map((p: any) => new AMap.LngLat(p.lng, p.lat));
          const polyline = new AMap.Polyline({ path, strokeWeight: 5, showDir: true });
          map.add(polyline);

          if (!fitViewDone) {
            map.setFitView([polyline]);
            setFitViewDone(true);
          }

          const marker = new AMap.Marker({
            position: path[0],
            icon: "https://webapi.amap.com/theme/v1.3/markers/n/mark_b.png",
            offset: new AMap.Pixel(-13, -30),
          });
          map.add(marker);
          markerRef.current = marker;
        } else {
          alert("路径规划失败，请检查数据！");
        }
      } catch (err) {
        console.error("获取订单失败", err);
        alert("订单数据加载失败，请稍后重试！");
        navigate("/orders");
      }
    })();

    return () => {
      mounted = false;
    };
  }, [id]);

  /* ------------------ 剩余时间更新 ------------------ */
  useEffect(() => {
    if (!order || !order.eta) return;
    setRemainingTime(formatRemainingETA(order.eta));

    const interval = setInterval(() => {
      setRemainingTime(formatRemainingETA(order.eta));
    }, 60 * 1000); // 每分钟刷新一次

    return () => clearInterval(interval);
  }, [order]);

  /* ------------------ WebSocket 实时配送 ------------------ */
  useEffect(() => {
    if (!order) return;
    if (order.status !== "配送中") return;
    if (!routeLoaded) return;

    const ws = new WebSocket("wss://system-backend.zeabur.app");
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "subscribe", orderId: order._id }));
      ws.send(JSON.stringify({ type: "request-current", orderId: order._id }));
    };

    ws.onmessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch { return; }

      if (msg.type === "location" && msg.position) {
        markerRef.current?.setPosition(new AMap.LngLat(msg.position.lng, msg.position.lat));
      }

      if (msg.type === "current-state" && msg.position && markerRef.current) {
        markerRef.current.setPosition(new AMap.LngLat(msg.position.lng, msg.position.lat));
        if (msg.index < msg.total - 1) {
          ws.send(JSON.stringify({ type: "start-track", orderId: order._id, points: routePoints }));
        }
      }

      if (msg.type === "no-track") {
        ws.send(JSON.stringify({ type: "start-track", orderId: order._id, points: routePoints }));
      }
    };

    return () => ws.close();
  }, [order?.status, routeLoaded, routePoints]);

  async function handleReturnRequest() {
    if (!order) return;
    try {
      await updateStatus(order._id, "用户申请退货");
      setOrder({ ...order, status: "用户申请退货" });
      alert("已提交退货请求");
    } catch {
      alert("退货失败，请稍后重试");
    }
  }

  async function handleDelete() {
    if (!confirm("确认删除订单？")) return;
    await deleteOrder(order._id);
    alert("订单已删除");
    navigate("/orders");
  }

  return (
    <div>
      <h2>订单详情</h2>

      {!order ? (
        <p>加载中...</p>
      ) : (
        <>
          <p><b>ID：</b>{order._id}</p>
          <p><b>商品：</b>{order.title}</p>
          <p><b>数量：</b>{order.quantity || 1}</p>
          <p><b>单价：</b>¥{order.price}</p>
          <p><b>总价：</b>¥{(order.price || 0) * (order.quantity || 1)}</p>
          <p><b>剩余时间：</b>{remainingTime}</p>
          <p><b>客户地址：</b>{order.address.detail}</p>
          <p><b>状态：</b>{order.status}</p>

          {(order.status === "配送中" || order.status === "待发货") && (
            <button onClick={handleReturnRequest} style={{ background: "#ff4d4d", padding: "8px 18px", color: "#fff" }}>
              申请退货
            </button>
          )}

          {order.status === "已送达" && (
            <button onClick={handleDelete} style={{ background: "#4caf50", padding: "8px 18px", color: "#fff" }}>
              删除订单
            </button>
          )}

          <div ref={mapRef} style={{ height: 420, marginTop: 16, borderRadius: 8, border: "1px solid #eee" }} />

          <Link to="/orders" style={{ color: "#1677ff" }}>← 返回我的订单</Link>
        </>
      )}
    </div>
  );
}
