import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  fetchOrder,
  requestRoute,
  shipOrder,
  updateStatus,
  deleteOrder,
} from "../api/orders";
import { formatRemainingETA } from "../utils/formatETA"

declare const AMap: any;

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [order, setOrder] = useState<any>(null);
  const [routePoints, setRoutePoints] = useState<any[]>([]);
  const [routeLoaded, setRouteLoaded] = useState(false);
  const [fitViewDone, setFitViewDone] = useState(false);
  const [etaText, setEtaText] = useState("--");

  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);

  /* ------------------------ 获取订单 & 初始化地图 ------------------------ */
  useEffect(() => {
    if (!id) return;
    let mounted = true;

    (async () => {
      const o = await fetchOrder(id);
      if (!mounted) return;
      setOrder(o);

      // 初始化剩余时间
      if (o.eta) setEtaText(formatRemainingETA(o.eta));

      // 等待 mapRef 渲染
      await new Promise<void>((resolve) => {
        const wait = () => (mapRef.current ? resolve() : requestAnimationFrame(wait));
        wait();
      });

      const map =
        mapInstanceRef.current ||
        new AMap.Map(mapRef.current!, {
          zoom: 14,
          center: [116.397428, 39.90923],
        });
      mapInstanceRef.current = map;

      const r = await requestRoute(o._id);
      if (r?.points?.length > 0) {
        setRoutePoints(r.points);
        setRouteLoaded(true);

        const centerLng = r.origin.lng;
        const centerLat = r.origin.lat;
        map.setCenter([centerLng, centerLat]);

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
      }
    })();

    return () => {
      mounted = false;
    };
  }, [id]);

  /* ------------------------ WebSocket：配送中 ------------------------ */
  useEffect(() => {
    if (!order || order.status !== "配送中" || !routeLoaded) return;

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
      } catch {
        return;
      }

      if (msg.type === "location" && msg.position) {
        markerRef.current?.setPosition(new AMap.LngLat(msg.position.lng, msg.position.lat));
      }

      if (msg.type === "current-state" && msg.position) {
        markerRef.current?.setPosition(new AMap.LngLat(msg.position.lng, msg.position.lat));
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

  /* ------------------------ 剩余时间刷新（每分钟一次） ------------------------ */
  useEffect(() => {
    if (!order?.expectedArrival) return;

    const updateETA = () => setEtaText(formatRemainingETA(order.expectedArrival));
    updateETA();
    const timer = setInterval(updateETA, 60 * 1000); // 每分钟刷新
    return () => clearInterval(timer);
  }, [order?.expectedArrival]);

  /* ------------------------ 商家操作 ------------------------ */
  async function handleShip() {
    try {
      const updated = await shipOrder(order._id);
      setOrder(updated);
      alert("🚚 已发货，车辆开始配送！");
    } catch {
      alert("发货失败");
    }
  }

  async function handleCancel() {
    if (!confirm("确认取消订单？")) return;
    const updated = await updateStatus(order._id, "商家已取消");
    setOrder(updated);
  }

  async function handleDelete() {
    if (!confirm("确认删除订单？")) return;
    await deleteOrder(order._id);
    alert("订单已删除");
    navigate("/orders");
  }

  /* ------------------------ 计算订单总价 ------------------------ */
  const calculateTotal = () => {
    if (!order?.items) return order?.price || 0;
    return order.items.reduce((sum: number, item: any) => sum + item.price * item.quantity, 0);
  };

  /* ------------------------ 渲染 ------------------------ */
  return (
    <div>
      <h2>订单详情</h2>

      {!order ? (
        <p>加载中...</p>
      ) : (
        <>
          <p><b>ID：</b>{order._id}</p>
          <p><b>商品：</b>{order.title}</p>

          {order.items && (
            <div>
              <b>商品列表：</b>
              <ul>
                {order.items.map((item: any, idx: number) => (
                  <li key={idx}>
                    {item.name} × {item.quantity} = ¥{item.price * item.quantity}
                  </li>
                ))}
              </ul>
              <p><b>总价：</b>¥{calculateTotal()}</p>
            </div>
          )}

          <p><b>客户地址：</b>{order.address.detail}</p>
          <p><b>状态：</b>{order.status}</p>
          {order.expectedArrival && <p><b>预计送达剩余时间：</b>{etaText}</p>}

          {order.status === "待发货" && <button onClick={handleShip}>发货</button>}
          {order.status === "用户申请退货" && <button onClick={handleCancel}>取消订单</button>}
          {(order.status === "已完成" || order.status === "商家已取消") && <button onClick={handleDelete}>删除订单</button>}

          <div
            ref={mapRef}
            style={{ height: 420, marginTop: 16, borderRadius: 8, border: "1px solid #eee" }}
          />
        </>
      )}
    </div>
  );
}
