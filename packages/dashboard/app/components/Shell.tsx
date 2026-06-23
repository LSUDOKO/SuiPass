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
  const [copied, setCopied] = useState(false);
  const [nukePhase, setNukePhase] = useState<"idle" | "confirm" | "signing" | "done">("idle");
  const [exportOpen, setExportOpen] = useState(false);

  useEffect(() => {
    if (!address) return;
    api.balances()
      .then((b) => {
        setUsdcBal(b.sponsor.usdc);
        setSuiBal(b.sponsor.sui);
      })
      .catch(() => {
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
            <button className="proitem" onClick={() => setExportOpen(true)}>
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
      {exportOpen && (
        <ExportKeyModal address={address ?? ""} onClose={() => setExportOpen(false)} />
      )}
    </div>
  );
}

// ─── Export Key Modal ───

function ExportKeyModal({ address, onClose }: { address: string; onClose: () => void }) {
  const [token, setToken] = useState<string | null>(null);
  const [userInfo, setUserInfo] = useState<Record<string, unknown> | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [addrCopied, setAddrCopied] = useState(false);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    api.exportKey().then((result) => {
      if (result && typeof result === "object" && "token" in result) {
        const r = result as { token: string; [key: string]: unknown };
        setToken(r.token);
        const { token: _, ...info } = r;
        if (Object.keys(info).length > 0) setUserInfo(info);
      }
    });
  }, []);

  const handleCopyToken = () => {
    if (token) {
      copyText(token);
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 2000);
    }
  };

  const handleCopyAddr = () => {
    copyText(address);
    setAddrCopied(true);
    setTimeout(() => setAddrCopied(false), 2000);
  };

  return createPortal(
    <motion.div
      className="cscrim"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        className="confirm"
        initial={{ opacity: 0, y: 20, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 360, damping: 30 } }}
        exit={{ opacity: 0, y: 12, scale: 0.98, transition: { duration: 0.16 } }}
      >
        <div className="cicon ok">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
          </svg>
        </div>
        <h3>Export zkLogin Key</h3>
        <p style={{ marginBottom: 14 }}>
          Export your Google OAuth session token to use this SuiPass wallet in another zkLogin-compatible client.
          The token is valid until you sign out or it expires.
        </p>

        {!revealed ? (
          <>
            <div
              className="proaddr"
              style={{ cursor: "pointer", margin: "0 0 12px", width: "100%", background: "var(--warn-tint)", border: "1px solid rgba(176, 122, 28, 0.2)" }}
              onClick={() => setRevealed(true)}
            >
              <span className="proaddrtext" style={{ color: "var(--warn-ink)", textAlign: "center" }}>
                Click to reveal your session token — treat it like a private key
              </span>
            </div>
            <p style={{ fontSize: 11.5, color: "var(--label)", lineHeight: 1.55, marginBottom: 14 }}>
              Anyone with this token can access your SuiPass account until it expires. Only export on trusted devices.
            </p>
          </>
        ) : (
          <>
            {/* Derived Sui Address */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: "var(--label)", marginBottom: 4 }}>Sui Address</div>
              <button
                className={`proaddr${addrCopied ? " done" : ""}`}
                style={{ width: "100%", margin: 0, cursor: "pointer" }}
                onClick={handleCopyAddr}
              >
                <span className="proaddrtext">{address}</span>
                {addrCopied ? <IconCheck /> : <IconCopy />}
              </button>
            </div>

            {/* JWT Token */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: "var(--label)", marginBottom: 4 }}>
                Session Token (JWT)
                {userInfo?.email ? <span style={{ fontWeight: 400, marginLeft: 6 }}>· {String(userInfo.email)}</span> : null}
              </div>
              <button
                className={`proaddr${tokenCopied ? " done" : ""}`}
                style={{ width: "100%", margin: 0, cursor: "pointer" }}
                onClick={handleCopyToken}
              >
                <span className="proaddrtext" style={{ fontSize: 9 }}>{token ?? "Loading..."}</span>
                {tokenCopied ? <IconCheck /> : <IconCopy />}
              </button>
            </div>

            <p style={{ fontSize: 11, color: "var(--label)", lineHeight: 1.55, marginBottom: 4 }}>
              This is a Google OAuth id_token. It authorizes your zkLogin session on Sui.
              Keep it secret — it grants access to your cards until revoked or expired.
            </p>
          </>
        )}

        <div className="cbtns">
          <button className="mghost" onClick={onClose}>Close</button>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
