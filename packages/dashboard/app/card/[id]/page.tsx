"use client";

// Card detail: the same slab language, scoped to one card. A single dossier ·
// no carousel, no create affordance; the back link rides the floating chrome.

import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type CardState, type TreeNode, type Charge } from "@/lib/api";
import { useRemit } from "../../useRemit";
import { Cockpit } from "../../components/Shell";
import { Dossier } from "../../components/Dossier";
import type { FeedRow } from "../../components/Activity";

export default function CardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const remit = useRemit();
  const { address, logout } = remit;
  const [card, setCard] = useState<CardState | null>(null);
  const [kids, setKids] = useState<CardState[]>([]);
  const [charges, setCharges] = useState<FeedRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const idRef = useRef(id);
  useEffect(() => {
    if (idRef.current !== id) {
      setCard(null);
      setKids([]);
      setCharges([]);
      setMsg(null);
    }
    idRef.current = id;
  }, [id]);

  const refresh = useCallback(async () => {
    const want = id;
    try {
      const d = await api.card(want);
      const [chRes, ...ksRes] = await Promise.all([
        api.cardCharges(want).catch(() => ({ charges: [] })),
        ...(d.subcards ?? []).map((kid) => api.card(kid).catch(() => null)),
      ]);
      if (idRef.current !== want) return;
      setCard(d);
      const liveKids = ksRes.filter((k): k is CardState => k !== null);
      setKids(liveKids);
      setCharges(chRes.charges.map((ch) => ({ ch, cardName: d.name })));
      setMsg(null);
    } catch (e) {
      if (idRef.current === want) setMsg(e instanceof Error ? e.message : String(e));
    }
  }, [id]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [refresh]);

  if (!card) {
    return (
      <main className="narrow" style={{ textAlign: "center" }}>
        <span style={{ color: "var(--body)", fontSize: 13 }}>
          Loading… {msg && <span className="err">{msg}</span>}
        </span>
      </main>
    );
  }

  const node: TreeNode = { card, children: kids.map((k) => ({ card: k, children: [] })) };
  const kmap = new Map<string, string>();
  const feed: FeedRow[] = [
    ...charges,
    ...kids.flatMap((k) => ([] as FeedRow[])),
  ].sort((a, b) => b.ch.at - a.ch.at);

  return (
    <Cockpit
      back={{ href: "/", label: "Dashboard" }}
      remit={remit}
      refresh={refresh}
      onLogout={logout}
      address={address ?? undefined}
    >
      <h1 data-testid="card-status" data-status={card.status} style={{ position: "absolute", left: -9999, top: 0 }}>
        {card.name}
      </h1>

      {msg && (
        <p className="err" style={{ margin: "0 8px 10px" }}>
          {msg}
        </p>
      )}

      <Dossier
        node={node}
        feed={feed}
        remit={remit}
        refresh={refresh}
        roots={[node]}
        currentId={card.id}
        onDeleted={() => router.replace("/")}
      />
    </Cockpit>
  );
}
