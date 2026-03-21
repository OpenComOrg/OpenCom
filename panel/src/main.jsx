import React from "react";
import { createRoot } from "react-dom/client";
import { AdminApp } from "./admin/AdminApp.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AdminApp />
  </React.StrictMode>
);
