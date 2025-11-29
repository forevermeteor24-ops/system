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

  useEffect(() => {
    // 仅首次加载页面时执行
    if (sessionStorage.getItem("force-login-done")) return;

    const path = location.pathname;

    // 不是 /login 或 /register → 清除登录
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
