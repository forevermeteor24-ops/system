import React, { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";

import Login from "./pages/Login";
import Register from "./pages/Register";
import Orders from "./pages/Orders";
import OrderDetail from "./pages/OrderDetail";
import Profile from "./pages/Profile";
import Dashboard from "./pages/Dashboard"; // ⭐ 新增
import RegionShipping from "./pages/RegionShipping";

/** 强制每次访问都要求登录 */
function ForceLogin({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  useEffect(() => {
    if (sessionStorage.getItem("force-login-done")) return;

    const path = location.pathname;

    if (!path.startsWith("/login") && !path.startsWith("/register")) {
      localStorage.removeItem("token");
    }

    sessionStorage.setItem("force-login-done", "1");
  }, []);

  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      {/* 登录、注册允许访问 */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* ---- 需要登录页面 ---- */}
      <Route
        path="/orders"
        element={
          <ForceLogin>
            <Orders />
          </ForceLogin>
        }
      />
      <Route
        path="/orders/:id"
        element={
          <ForceLogin>
            <OrderDetail />
          </ForceLogin>
        }
      />
      <Route
        path="/merchant/profile"
        element={
          <ForceLogin>
            <Profile />
          </ForceLogin>
        }
      />
      <Route
        path="/region-shipping"
        element={
          <ForceLogin>
            <RegionShipping />
          </ForceLogin>
        }
      />

      {/* ⭐⭐ 新增：Dashboard 数据可视化看板 ⭐⭐ */}
      <Route
        path="/dashboard"
        element={
          <ForceLogin>
            <Dashboard />
          </ForceLogin>
        }
      />

      {/* 默认跳 orders */}
      <Route path="*" element={<Navigate to="/orders" replace />} />
    </Routes>
  );
}
