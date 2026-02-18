import React from "react";
import { createRoot } from "react-dom/client";
import { ThemeCreatorApp } from "./theme/ThemeCreatorApp.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeCreatorApp />
  </React.StrictMode>
);
