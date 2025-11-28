import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchOrder, requestRoute, shipOrder } from "../api/orders";

declare const AMap: any;

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();

  const [order, setOrder] = useState<any>(null);

  const [routePoints, setRoutePoints] = useState<
    { lng: number; lat: number }[]
  >([]);
  const [routeLoaded, setRouteLoaded] = useState(false);
  const [fitViewDone, setFitViewDone] = useState(false);

  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  const wsRef = useRef<WebSocket | null>(null);

  /** --------------------------------------------------------
   * 初始化：加载订单 → 初始化地图 → 请求真实路线
   -------------------------------------------------------- */
  useEffect(() => {
    if (!id) return;
    let mounted = true;

    (async () => {
      /** 1. 获取订单 */
      const o = await fetchOrder(id);
      if (!mounted) return;
      setOrder(o);

      /** 2. 等待地图容器渲染 */
      await new Promise<void>((resolve) => {
        const wait = () =>
          mapRef.current ? resolve() : requestAnimationFrame(wait);
        wait();
      });

      /** ⭐ 商家坐标（作为地图中心点）*/
      const centerLng = o.merchantId.address.lng;
      const centerLat = o.merchantId.address.lat;

      const map =
        mapInstanceRef.current ||
        new AMap.Map(mapRef.current!, {
          zoom: 14,
          center: [centerLng, centerLat], // ⭐ 不再是北京
        });

      mapInstanceRef.current = map;

      /** 3. ⭐ 请求真实路线：商家 → 客户 */
      const res = await requestRoute(
        o.merchantId.address.detail, // 商家地址
        o.address.detail // 客户地址
      );

      /** 4. 绘制路线 */
      if (res?.points?.length > 0) {
        setRoutePoints(res.points);
        setRouteLoaded(true);

        const path = res.points.map(
          (p: any) => new AMap.LngLat(p.lng, p.lat)
        );

        const polyline = new AMap.Polyline({
          path,
          strokeWeight: 4,
          showDir: true,
        });

        map.add(polyline);

        /** 视野自动缩放 */
        if (!fitViewDone) {
          try {
            map.setFitView([polyline]);
          } catch (err) {
            console.warn("setFitView failed", err);
          }
          setFitViewDone(true);
        }

        /** 设置车辆图标位置（起点）*/
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

  /** --------------------------------------------------------
   * WebSocket：实时轨迹流
   -------------------------------------------------------- */
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
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }

      /** 实时位置 */
      if (msg.type === "location" && msg.position) {
        if (markerRef.current) {
          markerRef.current.setPosition(
            new AMap.LngLat(msg.position.lng, msg.position.lat)
          );
        }
        return;
      }

      /** 轨迹恢复（刷新页面） */
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

      /** 没有轨迹 → 重新开始轨迹 */
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

  /** --------------------------------------------------------
   * 发货按钮（修改订单状态）
   -------------------------------------------------------- */
  async function handleShip() {
    const updated = await shipOrder(order._id);
    setOrder(updated);
    console.log("🚚 发货成功：订单进入 shipped 状态");
  }

  return (
    <div>
      <h3>订单详情</h3>

      <p>订单ID：{order?._id}</p>
      <p>商品：{order?.title}</p>
      <p>客户地址：{order?.address.detail}</p>
      <p>订单状态：{order?.status}</p>

      {/* ⭐ 发货按钮：仅 pending 时显示 */}
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
