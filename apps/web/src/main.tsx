import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "@/layouts/AppShell";
import { ThemeProvider } from "@/lib/theme";
import { Toaster } from "@/components/ui/toast";
import Upload from "./pages/Upload";
import SynthesisHUD from "./pages/SynthesisHUD";
import DreamQuery from "./pages/DreamQuery";
import SupplyChain from "./pages/SupplyChain";
import AgentWall from "./pages/AgentWall";
import "./styles/index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5_000,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<AppShell />}>
              <Route index element={<Navigate to="/synthesize" replace />} />
              <Route path="synthesize" element={<Upload />} />
              <Route path="synthesize/:id" element={<SynthesisHUD />} />
              <Route
                path="synthesize/:id/dream-query"
                element={<DreamQuery />}
              />
              <Route path="agents" element={<AgentWall />} />
              <Route path="agents/:id/supply-chain" element={<SupplyChain />} />
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>
  </React.StrictMode>
);
