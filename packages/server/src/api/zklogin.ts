// SuiPass: zkLogin JWT verification
// Replaces Privy session verification with Google OAuth token verification.
// The zkLogin flow: user signs in with Google -> gets JWT -> server verifies JWT
// -> derives Sui address from JWT sub claim.

import { jwtVerify, createRemoteJWKSet } from "jose";
import { SUI_CLIENT } from "@suipass/engine";

const GOOGLE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);

export type ZkLoginPayload = {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
  /** When the token was issued (epoch seconds) */
  iat: number;
  /** When the token expires (epoch seconds) */
  exp: number;
  /** The audience (your Google OAuth client ID) */
  aud: string;
};

export type ZkLoginVerifier = {
  verify(token: string): Promise<ZkLoginPayload>;
  deriveSuiAddress(sub: string): string;
};

export function makeZkLoginVerifier(googleClientId: string): ZkLoginVerifier {
  return {
    async verify(token: string): Promise<ZkLoginPayload> {
      const { payload } = await jwtVerify(token, GOOGLE_JWKS, {
        audience: googleClientId,
      });

      return {
        sub: payload.sub!,
        email: payload.email as string | undefined,
        name: payload.name as string | undefined,
        picture: payload.picture as string | undefined,
        iat: payload.iat!,
        exp: payload.exp!,
        aud: payload.aud as string,
      };
    },

    // Derive a deterministic Sui address from the Google sub claim.
    // This is a simplified version. Real zkLogin uses ephemeral key + proof.
    // For the hackathon, we hash the sub into a valid Sui address format.
    deriveSuiAddress(sub: string): string {
      // In production, use @mysten/zklogin to compute the actual address.
      // For the hackathon, we derive a deterministic address from the sub hash.
      const hash = new Bun.CryptoHasher("sha256").update(sub).digest();
      const hex = Buffer.from(hash.slice(0, 32)).toString("hex");
      return `0x${hex}`;
    },
  };
}

/// Verify a zkLogin JWT from the Authorization header.
export async function verifyAuthHeader(
  verifier: ZkLoginVerifier | null,
  authHeader: string | undefined,
): Promise<{ userId: string; address: string; payload: ZkLoginPayload } | null> {
  if (!verifier || !authHeader) return null;

  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  try {
    const payload = await verifier.verify(token);
    const address = verifier.deriveSuiAddress(payload.sub);
    return {
      userId: payload.sub,
      address,
      payload,
    };
  } catch {
    return null;
  }
}
