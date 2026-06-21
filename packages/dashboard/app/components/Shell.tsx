"use client";

// SuiPass: Shell — left rail with brand, balance, theme, profile menu.
// Replaces viem/Privy with SuiClient for balance lookups.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { api } from "@/lib/api";
import { SUI_RPC_URL, USDC_COIN_TYPE } from "@/lib/chain";
import type { useRemit } from "../useRemit";
import { copyText, IconCheck, IconCopy, shortHex } from "./ui";
import { ThemeToggle } from "./Theme";
import { DangerModal, type DangerPhase } from "./Confirm";

type Remit = ReturnType<typeof useRemit>;

const suiClient = new SuiJsonRpcClient({ url: SUI_RPC_URL, network: "testnet" });

export function Cockpit({
  back,
  remit,
  refresh,
  onLogout,
  address,
  nukeable = false,
  aggregate,
  children,
}: {
  back?: { href: string; label: string };
  remit: Remit;
  refresh: () => void | Promise<void>;
  onLogout?: () => void;
  address?: string;
  nukeable?: boolean;
  aggregate?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="app">
      <aside className="rail">
        <Link className="brand" href="/">SuiPass</Link>
        {back && (
          <Link className="railback" href={back.href} title={back.label} aria-label={back.label}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </Link>
        )}
        <div className="railfoot">
          <Link className="raillink" href="/docs" title="Documentation" aria-label="Documentation">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H18a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H6.5A1.5 1.5 0 0 1 5 18.5z" />
              <path d="M5 17.5A1.5 1.5 0 0 1 6.5 16H19" />
              <path d="M8.5 7.5h7M8.5 10.5h7" />
            </svg>
          </Link>
          <span className="net" title="Sui · Testnet" aria-label="Sui · Testnet">
            <svg viewBox="0 0 16 16" aria-hidden>
              <circle cx="8" cy="8" r="7" fill="currentColor" />
            </svg>
          </span>
          <ThemeToggle />
          <ProfileMenu address={address} remit={remit} onLogout={onLogout} refresh={refresh} nukeable={nukeable} />
        </div>
      </aside>
      <main className="col">{children}</main>
    </div>
  );
}

function ProfileMenu({
  address,
  remit,
  onLogout,
  refresh,
  nukeable,
}: {
  address?: string;
  remit: Remit;
  onLogout?: () => void;
  refresh: () => void;
  nukeable: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [balance, setBalance] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!address) return;
    suiClient.getBalance({ owner: address, coinType: USDC_COIN_TYPE })
      .then((b) => setBalance((Number(b.totalBalance) / 1e6).toFixed(2)))
      .catch(() => setBalance(null));
  }, [address]);

  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <>
      <button className="avatar" onClick={() => setOpen((v) => !v)} title={address} aria-label="Profile menu">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
          <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
        </svg>
      </button>
      {open &&
        createPortal(
          <div className="pop-shell" ref={menuRef} data-testid="profile-menu">
            <div className="pop-head">{address && <span className="data">{shortHex(address)}</span>}</div>
            {balance && <div className="pop-info">USDC: ${balance}</div>}
            <hr />
            <button className="pop-btn" onClick={() => { copyText(address ?? ""); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
              {copied ? <IconCheck /> : <IconCopy />} Copy Address
            </button>
            <hr />
            <button className="pop-btn danger" onClick={onLogout}>Sign Out</button>
          </div>,
          document.body,
        )}
    </>
  );
}
