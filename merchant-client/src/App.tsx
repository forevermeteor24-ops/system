import React, { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";

import Login from "./pages/Login";
import Register from "./pages/Register";
import Orders from "./pages/Orders";
import OrderDetail from "./pages/OrderDetail";
import Profile from "./pages/Profile";

/** 强制每次访问都要求登录 */
function ForceLogin({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  // 如果当前访问的不是 /login 或 /register，则强制清除 token 并跳登录
  useEffect(() => {
    if (!location.pathname.startsWith("/login") && !location.pathname.startsWith("/register")) {
      localStorage.removeItem("token");
    }
  }, [location.pathname]);

  const token = localStorage.getItem("token");
  if (!token) return <Navigate to="/login" replace />;

  return children;
}

export default function App() {
  return (
      <Routes>
        {/* 登录、注册允许访问 */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* 其它页面：强制登录 */}
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

        {/* 默认跳 orders（但仍会被 ForceLogin 拉回 login） */}
        <Route path="*" element={<Navigate to="/orders" replace />} />
      </Routes>
  );
}
