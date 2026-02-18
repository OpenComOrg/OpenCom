import React from "react";
import { createRoot } from "react-dom/client";
import { ThemeCatalogApp } from "./theme/ThemeCatalogApp.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeCatalogApp />
  </React.StrictMode>
);
