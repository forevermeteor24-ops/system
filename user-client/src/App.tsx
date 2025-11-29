import React, { useEffect } from "react";
import {
  HashRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";

import Login from "./pages/Login";
import Register from "./pages/Register";

import MyOrders from "./pages/MyOrders";
import OrderDetail from "./pages/OrderDetail";
import UserTrack from "./pages/UserTrack";
import UserProfile from "./pages/UserProfile";

/* 是否已登录 */
function isAuthed() {
  return !!localStorage.getItem("token");
}

/* 刷新强制退出（只执行一次） */
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

/* 登录保护 */
function PrivateRoute({ children }: { children: React.ReactNode }) {
  return isAuthed() ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
      <ForceLogin>
        <Routes>
          {/* 公共页面 */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* 受保护页面 */}
          <Route
            path="/"
            element={
              <PrivateRoute>
                <MyOrders />
              </PrivateRoute>
            }
          />

          {/* ❗ 已创建订单弹窗，因此不再需要 /create 页面
              已从这里删除 /create 路由
          */}

          <Route
            path="/orders/:id"
            element={
              <PrivateRoute>
                <OrderDetail />
              </PrivateRoute>
            }
          />

          <Route
            path="/track/:id"
            element={
              <PrivateRoute>
                <UserTrack />
              </PrivateRoute>
            }
          />

          <Route
            path="/profile"
            element={
              <PrivateRoute>
                <UserProfile />
              </PrivateRoute>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ForceLogin>
  );
}
