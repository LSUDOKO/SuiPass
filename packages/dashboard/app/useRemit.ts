"use client";

// SuiPass: Dashboard hooks for card management.
// Replaces Privy + EIP-7702 + EIP-712 with zkLogin auth + Sui PTB signing.

import { useCallback } from "react";
import { useAuth } from "./useAuth";
import { api, type CardTermsInput } from "@/lib/api";

export function useRemit() {
  const { authenticated, loading, user, login, logout, address } = useAuth();

  // ─── Compile NL to CardTerms ───

  const compileTerms = useCallback(async (prompt: string) => {
    return api.compile(prompt);
  }, []);

  // ─── Issue a new root card ───

  const issueCard = useCallback(async (name: string, terms: CardTermsInput) => {
    return api.createCard(name, terms);
  }, []);

  // ─── Load the card tree ───

  const loadCards = useCallback(async () => {
    return api.cards();
  }, []);

  // ─── Load a single card ───

  const loadCard = useCallback(async (id: string) => {
    return api.card(id);
  }, []);

  // ─── Load charges for a card ───

  const loadCharges = useCallback(async (id: string) => {
    return api.cardCharges(id);
  }, []);

  // ─── Control operations ───

  const freezeCard = useCallback(async (id: string) => {
    return api.freeze(id);
  }, []);

  const unfreezeCard = useCallback(async (id: string) => {
    return api.unfreeze(id);
  }, []);

  const revokeCard = useCallback(async (id: string) => {
    return api.revoke(id);
  }, []);

  // ─── Connect MCP card URL ───

  const getCardUrl = useCallback((secret: string) => {
    const base = process.env.NEXT_PUBLIC_SUIPASS_SERVER ?? "http://localhost:4070";
    return `${base}/c/${secret}/mcp`;
  }, []);

  return {
    ready: !loading,
    authenticated,
    user,
    login,
    logout,
    address,
    compileTerms,
    issueCard,
    loadCards,
    loadCard,
    loadCharges,
    freezeCard,
    unfreezeCard,
    revokeCard,
    getCardUrl,
  };
}
