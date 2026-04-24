import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "@/layouts/AppShell";
import { ThemeProvider } from "@/lib/theme";
import { Toaster } from "@/components/ui/toast";
import "./styles/index.css";

// Route-level code-splitting — each page becomes its own chunk so the
// initial bundle only carries the shell + AppShell + theme.
const Upload = lazy(() => import("./pages/Upload"));
const SynthesisHUD = lazy(() => import("./pages/SynthesisHUD"));
const DreamQuery = lazy(() => import("./pages/DreamQuery"));
const SupplyChain = lazy(() => import("./pages/SupplyChain"));
const AgentWall = lazy(() => import("./pages/AgentWall"));

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
          <Suspense fallback={null}>
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
          </Suspense>
        </BrowserRouter>
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>
  </React.StrictMode>
);
