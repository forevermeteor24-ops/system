import { useState } from "react";
import http from "../api/http";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const login = async () => {
    const res = await http.post("/auth/login", {
      username,
      password,
    });

    localStorage.setItem("token", res.data.token);
    localStorage.setItem("role", res.data.role);

    location.href = "/#/";
  };

  return (
    <div style={{ padding: 32 }}>
      <h2>登录</h2>

      <input
        placeholder="用户名"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
      <br />

      <input
        placeholder="密码"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <br />

      <button onClick={login}>登录</button>
    </div>
  );
}
