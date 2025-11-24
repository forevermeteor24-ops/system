import React, { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { fetchOrder } from "../api/orders";

declare const AMap: any;

export default function TrackDetail() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchOrder(id!);
        setOrder(data);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  useEffect(() => {
    if (!mapRef.current) return;

    const timer = setInterval(() => {
      if (mapRef.current && !mapInstanceRef.current && (window as any).AMap) {
        mapInstanceRef.current = new AMap.Map(mapRef.current, {
          zoom: 6,
          center: [116.4, 39.9],
        });
        clearInterval(timer);
      }
    }, 200);

    return () => clearInterval(timer);
  }, []);

  if (loading) return <div>加载中...</div>;
  if (!order) return <div>订单未找到</div>;

  return (
    <div>
      <h3>订单号：{order._id}</h3>
      <p>收货地址：{order.address}</p>
      <p>当前状态：{order.status}</p>

      <div
        ref={mapRef}
        style={{
          height: 500,
          marginTop: 20,
          borderRadius: 8,
          overflow: "hidden",
          border: "1px solid #ddd",
        }}
      />

      <p style={{ marginTop: 20, color: "#777" }}>
        实时物流轨迹将稍后接入 WebSocket 动态显示…
      </p>
    </div>
  );
}
