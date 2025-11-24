import React from "react";
import { Routes, Route, Link, Navigate } from "react-router-dom";
import Orders from "./pages/Orders";
import OrderDetail from "./pages/OrderDetail";
import UserTrack from "./pages/UserTrack";
import TrackDetail from "./pages/TrackDetail";

export default function App() {
  return (
    <div
      style={{
        fontFamily: "system-ui, sans-serif",
        maxWidth: 1100,
        margin: "0 auto",
      }}
    >
      <header
        style={{
          padding: 16,
          borderBottom: "1px solid #eee",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}
      >
        <h2 style={{ margin: 0 }}>物流配送可视化平台（MVP）</h2>

        <nav style={{ display: "flex", gap: "20px" }}>
          <Link to="/orders">商家端</Link>
          <Link to="/track">用户查询</Link>
        </nav>
      </header>

      <main style={{ padding: 16 }}>
        <Routes>
          <Route path="/" element={<Navigate to="/orders" replace />} />

          {/* 商家端 */}
          <Route path="/orders" element={<Orders />} />
          <Route path="/orders/:id" element={<OrderDetail />} />

          {/* 用户端 */}
          <Route path="/track" element={<UserTrack />} />
          <Route path="/track/:id" element={<TrackDetail />} />
        </Routes>
      </main>
    </div>
  );
}
