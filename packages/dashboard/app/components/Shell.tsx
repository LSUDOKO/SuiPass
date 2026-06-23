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
          <ProfileMenu address={address} remit={remit} onLogout={onLogout} refresh={refresh} nukeable={nukeable} aggregate={aggregate} />
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
  aggregate,
}: {
  address?: string;
  remit: Remit;
  onLogout?: () => void;
  refresh: () => void;
  nukeable: boolean;
  aggregate?: string;
}) {
  const [open, setOpen] = useState(false);
  const [usdcBal, setUsdcBal] = useState<string | null>(null);
  const [suiBal, setSuiBal] = useState<string | null>(null);
  const [sponsorAddress, setSponsorAddress] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [nukePhase, setNukePhase] = useState<"idle" | "confirm" | "signing" | "done">("idle");

  useEffect(() => {
    if (!address) return;
    // Fetch balances from server (includes sponsor pool balance + user balance)
    api.balances()
      .then((b) => {
        setUsdcBal(b.sponsor.usdc);
        setSuiBal(b.sponsor.sui);
        setSponsorAddress(b.sponsor.address);
      })
      .catch(() => {
        // Fallback: direct RPC query
        suiClient.getBalance({ owner: address, coinType: USDC_COIN_TYPE })
          .then((b) => setUsdcBal((Number(b.totalBalance) / 1e6).toFixed(2)))
          .catch(() => setUsdcBal(null));
        suiClient.getBalance({ owner: address, coinType: "0x2::sui::SUI" })
          .then((b) => setSuiBal((Number(b.totalBalance) / 1e9).toFixed(4)))
          .catch(() => setSuiBal(null));
      });
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

  const handleNuke = async () => {
    setNukePhase("signing");
    try {
      await api.nuke();
      refresh();
      setNukePhase("done");
      setTimeout(() => { setOpen(false); setNukePhase("idle"); }, 1200);
    } catch { setNukePhase("idle"); }
  };

  return (
    <div className="profile">
      <button className="avatar" onClick={() => setOpen((v) => !v)} title={address} aria-label="Profile menu">
        {address ? (
          <span className="avatar-addr">{address.slice(2, 4).toUpperCase()}</span>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
            <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
          </svg>
        )}
      </button>
      {open && (
        <div className="promenu" ref={menuRef} data-testid="profile-menu" style={{ position: "absolute", bottom: "calc(100% + 10px)", left: 0, right: "auto", top: "auto", minWidth: 270, margin: 0 }}>
          {/* Identity */}
          <div className="prowho">
            <span className="avatar">{address?.slice(2, 4).toUpperCase()}</span>
            <div className="prowhocol">
              <div className="em">{shortHex(address)}</div>
              {aggregate && <div className="proagg">{aggregate} · delegated</div>}
            </div>
          </div>

          {/* Balances */}
          <div className="prowallet">
            <div className="probal">
              <span className="probalfig">${usdcBal ?? "–"}</span>
              <span className="proballbl">USDC</span>
            </div>
            <div className="proassets">
              <span className="proasset">
                <span className="proassetfig">{suiBal ?? "–"}</span> SUI
              </span>
            </div>
          </div>

          {/* Copy address — compact with auto-sized icon */}
          <button
            className={`proaddr${copied ? " done" : ""}`}
            onClick={() => { copyText(address ?? ""); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          >
            <span className="proaddrtext">{address}</span>
            {copied ? <IconCheck /> : <IconCopy />}
          </button>

          <div className="pronote">Send USDC on Sui Testnet to this address to fund your cards</div>

          {/* Export */}
          <div className="proexport">
            <button className="proitem" onClick={() => { api.exportKey?.(); }}>
              Export Key
            </button>
          </div>

          {/* Nuke */}
          {nukeable && (
            <>
              {nukePhase === "idle" ? (
                <>
                  <hr />
                  <div className="prodanger">
                    <button className="proitem danger" onClick={() => setNukePhase("confirm")}>
                      Nuke All Cards
                    </button>
                  </div>
                </>
              ) : nukePhase === "confirm" ? (
                <div style={{ padding: "4px 10px 6px" }}>
                  <p style={{ fontSize: 11, opacity: 0.7, marginBottom: 6, lineHeight: 1.4 }}>
                    One on-chain tx revokes every card this wallet ever issued
                  </p>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="proitem" style={{ flex: 1, justifyContent: "center", textAlign: "center" }} onClick={() => setNukePhase("idle")}>Cancel</button>
                    <button className="proitem danger" style={{ flex: 1, justifyContent: "center", textAlign: "center" }} onClick={handleNuke}>Confirm</button>
                  </div>
                </div>
              ) : nukePhase === "signing" ? (
                <div className="proitem" style={{ opacity: 0.6, justifyContent: "center", textAlign: "center" }}>Revoking…</div>
              ) : (
                <div className="proitem" style={{ justifyContent: "center", textAlign: "center", color: "var(--accent)" }}>All cards revoked</div>
              )}
            </>
          )}

          {/* Sign Out */}
          <div className="prodanger">
            <button className="proitem danger" onClick={onLogout}>Sign Out</button>
          </div>
        </div>
      )}
    </div>
  );
}
