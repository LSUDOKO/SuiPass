"use client";

import { createNetworkConfig, SuiClientProvider, WalletProvider } from "@mysten/dapp-kit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { AuthProvider } from "./useAuth";

const queryClient = new QueryClient();

const { networkConfig } = createNetworkConfig({
  testnet: { url: "https://fullnode.testnet.sui.io:443", network: "testnet" },
  mainnet: { url: "https://fullnode.mainnet.sui.io:443", network: "mainnet" },
});

export function Providers({ children }: { children: React.ReactNode }) {
  if (typeof window !== "undefined" && !window.isSecureContext) return <InsecureOrigin />;
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork="testnet">
        <WalletProvider autoConnect={false}>
          <AuthProvider>
            <MotionConfig reducedMotion="user">{children}</MotionConfig>
          </AuthProvider>
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}

function InsecureOrigin() {
  return (
    <main className="narrow" style={{ textAlign: "center" }} data-testid="insecure-origin">
      <h1 style={{ fontSize: 20 }}>This Address Can&apos;t Run the Wallet</h1>
      <p
        style={{
          color: "var(--body)",
          fontSize: 13,
          marginTop: 12,
          lineHeight: 1.7,
          maxWidth: 420,
          marginLeft: "auto",
          marginRight: "auto",
        }}
      >
        The page is being served over plain HTTP, which browsers treat as an insecure context · the
        wallet layer needs Web Crypto and can&apos;t start here. Open the HTTPS deployment instead, or use
        localhost / an HTTPS tunnel for development.
      </p>
    </main>
  );
}
