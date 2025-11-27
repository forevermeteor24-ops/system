import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchOrder, requestRoute, shipOrder } from "../api/orders";

declare const AMap: any;

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();

  const [order, setOrder] = useState<any>(null);

  const [routePoints, setRoutePoints] = useState<{ lng: number; lat: number }[]>([]);
  const [routeLoaded, setRouteLoaded] = useState(false);

  const [fitViewDone, setFitViewDone] = useState(false);

  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  const wsRef = useRef<WebSocket | null>(null);

  /** ---------------------------
   * 初始化地图 & 加载路线
   --------------------------- */
  useEffect(() => {
    if (!id) return;
    let mounted = true;

    (async () => {
      const o = await fetchOrder(id);
      if (!mounted) return;

      setOrder(o);

      await new Promise<void>((resolve) => {
        const wait = () =>
          mapRef.current ? resolve() : requestAnimationFrame(wait);
        wait();
      });

      const map =
        mapInstanceRef.current ||
        new AMap.Map(mapRef.current, {
          zoom: 13,
          center: new AMap.LngLat(116.407387, 39.904179),
        });

      mapInstanceRef.current = map;

      const res = await requestRoute("北京市", o.address);

      if (res?.points?.length > 0) {
        setRoutePoints(res.points);
        setRouteLoaded(true);

        const path = res.points.map((p: any) => new AMap.LngLat(p.lng, p.lat));

        const polyline = new AMap.Polyline({
          path,
          strokeWeight: 4,
          showDir: true,
        });

        map.add(polyline);

        if (!fitViewDone) {
          try {
            map.setFitView([polyline]);
          } catch (e) {
            console.warn("setFitView failed:", e);
          }
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

  /** ---------------------------------
   * WebSocket：实时轨迹 & 刷新恢复
   --------------------------------- */
  useEffect(() => {
    if (!order) return;
    if (order.status !== "shipped") return;
    if (!routeLoaded) return;

    const ws = new WebSocket("wss://system-backend.zeabur.app");
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: "subscribe",
          orderId: order._id,
        })
      );

      ws.send(
        JSON.stringify({
          type: "request-current",
          orderId: order._id,
        })
      );
    };

    ws.onmessage = (ev) => {
      let msg: any;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }

      if (msg.type === "location" && msg.position) {
        if (markerRef.current) {
          markerRef.current.setPosition(
            new AMap.LngLat(msg.position.lng, msg.position.lat)
          );
        }
        return;
      }

      if (msg.type === "current-state") {
        if (markerRef.current && msg.position) {
          markerRef.current.setPosition(
            new AMap.LngLat(msg.position.lng, msg.position.lat)
          );
        }

        if (msg.index >= msg.total - 1) return;

        ws.send(
          JSON.stringify({
            type: "start-track",
            orderId: order._id,
            points: routePoints,
          })
        );
        return;
      }

      if (msg.type === "no-track") {
        ws.send(
          JSON.stringify({
            type: "start-track",
            orderId: order._id,
            points: routePoints,
          })
        );
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [order?.status, routeLoaded, routePoints, order?._id]);

  /** ---------------------------
   *   ⭐ 发货动作（按钮点击调用）
   --------------------------- */
  async function handleShip() {
    const updated = await shipOrder(order._id); // 调后端 /orders/:id/ship
    setOrder(updated);
    console.log("🚚 发货成功：订单进入 shipped 状态");
  }

  return (
    <div>
      <h3>订单详情</h3>

      <p>订单ID：{order?._id}</p>
      <p>地址：{order?.address}</p>
      <p>状态：{order?.status}</p>

      {/* ⭐ 发货按钮：仅 pending 状态显示 */}
      {order?.status === "pending" && (
        <button
          style={{
            padding: "8px 16px",
            background: "#409eff",
            color: "#fff",
            borderRadius: "6px",
            border: "none",
            cursor: "pointer",
            marginBottom: "12px",
          }}
          onClick={handleShip}
        >
          发货
        </button>
      )}

      <div
        ref={mapRef}
        style={{ height: 420, marginTop: 16, borderRadius: 8 }}
      />
    </div>
  );
}
