import { useState } from "react";

const ETHERSCAN_API_KEY = "84SFQP2F84YIC6M7JNBRF9X3KD43Z6FHRR";
const HELIUS_API_KEY = "7733dd36-5ea9-4c1c-9ecd-044cf74eee23";

function timeAgo(dateMs) {
  const now = Date.now();
  const diff = now - dateMs;
  const days = Math.floor(diff / 86400000);
  const months = Math.floor(days / 30.44);
  const years = Math.floor(days / 365.25);
  const parts = [];
  if (years > 0) parts.push(`${years}y`);
  if (months % 12 > 0) parts.push(`${months % 12}mo`);
  if (days % 30 > 0 && years === 0) parts.push(`${days % 30}d`);
  return parts.join(" ") || "< 1 day";
}

function formatDate(dateMs) {
  return new Date(dateMs).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
}

function formatDateTime(dateMs) {
  return new Date(dateMs).toLocaleString("en-US", {
    year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    timeZoneName: "short",
  });
}

function weiToEth(wei) {
  return (parseInt(wei) / 1e18).toFixed(5);
}

async function fetchEthFirstTx(address) {
  // First tx
  const res = await fetch(
    `http://localhost:3001/eth-first-tx?address=${address}&apikey=${ETHERSCAN_API_KEY}`
  );
  const data = await res.json();
  if (data.status !== "1" || !data.result?.length)
    throw new Error("No ETH transactions found or invalid address.");
  const tx = data.result[0];
  const dateMs = parseInt(tx.timeStamp) * 1000;

  // All txs for stats
  const allRes = await fetch(
    `http://localhost:3001/eth-all-tx?address=${address}&apikey=${ETHERSCAN_API_KEY}`
  );
  const allData = await allRes.json();
  const allTxs = allData.status === "1" ? allData.result : [];

  // Total gas spent
  let totalGasEth = 0;
  const yearCount = {};
  allTxs.forEach(t => {
    const gasUsed = parseInt(t.gasUsed || 0);
    const gasPrice = parseInt(t.gasPrice || 0);
    totalGasEth += (gasUsed * gasPrice) / 1e18;
    const year = new Date(parseInt(t.timeStamp) * 1000).getFullYear();
    yearCount[year] = (yearCount[year] || 0) + 1;
  });
  const mostActiveYear = Object.keys(yearCount).sort((a, b) => yearCount[b] - yearCount[a])[0] || "—";

  // ENS name
  let ensName = null;
  try {
    const ensRes = await fetch(`http://localhost:3001/ens?address=${address}&apikey=${ETHERSCAN_API_KEY}`);
    const ensData = await ensRes.json();
    ensName = ensData.name || null;
  } catch {}

  // First token transfer
  let firstToken = null;
  try {
    const tokenRes = await fetch(
      `http://localhost:3001/eth-first-token?address=${address}&apikey=${ETHERSCAN_API_KEY}`
    );
    const tokenData = await tokenRes.json();
    if (tokenData.status === "1" && tokenData.result?.length) {
      const t = tokenData.result[0];
      firstToken = { name: t.tokenName || "Unknown Token", symbol: t.tokenSymbol || "?", type: "ERC-20" };
    }
  } catch {}

  // First NFT
  let firstNFT = null;
  try {
    const nftRes = await fetch(
      `http://localhost:3001/eth-first-nft?address=${address}&apikey=${ETHERSCAN_API_KEY}`
    );
    const nftData = await nftRes.json();
    if (nftData.status === "1" && nftData.result?.length) {
      const n = nftData.result[0];
      firstNFT = { name: n.tokenName || "Unknown NFT", symbol: n.tokenSymbol || "?", type: "ERC-721" };
    }
  } catch {}

  return {
    chain: "Ethereum",
    hash: tx.hash,
    date: formatDate(dateMs),
    dateTime: formatDateTime(dateMs),
    age: timeAgo(dateMs),
    dateMs,
    from: tx.from,
    to: tx.to,
    type: tx.from.toLowerCase() === address.toLowerCase() ? "Outgoing" : "Incoming",
    totalTx: allTxs.length,
    totalGasEth: totalGasEth.toFixed(5),
    mostActiveYear,
    ensName,
    firstToken,
    firstNFT,
  };
}

async function fetchSolFirstTx(address) {
  const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
  const sigRes = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1,
      method: "getSignaturesForAddress",
      params: [address, { limit: 1000 }],
    }),
  });
  const sigData = await sigRes.json();
  const sigs = sigData.result;
  if (!sigs || sigs.length === 0) throw new Error("No Solana transactions found.");
  const oldest = sigs[sigs.length - 1];
  const dateMs = oldest.blockTime * 1000;

  // Stats via Helius
  let totalTx = sigs.length;
  const yearCount = {};
  sigs.forEach(s => {
    const year = new Date(s.blockTime * 1000).getFullYear();
    yearCount[year] = (yearCount[year] || 0) + 1;
  });
  const mostActiveYear = Object.keys(yearCount).sort((a, b) => yearCount[b] - yearCount[a])[0] || "—";

  // First token via Helius
  let firstToken = null;
  let firstNFT = null;
  try {
    const txRes = await fetch(
      `https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${HELIUS_API_KEY}&limit=100&type=ANY`
    );
    const txData = await txRes.json();
    if (Array.isArray(txData)) {
      const reversed = [...txData].reverse();
      for (const t of reversed) {
        if (!firstToken && t.tokenTransfers?.length > 0) {
          const tk = t.tokenTransfers[0];
          firstToken = { name: tk.tokenStandard || "SPL Token", symbol: tk.mint?.slice(0, 6) || "?", type: "SPL" };
        }
        if (!firstNFT && t.nativeTransfers?.length > 0 && t.type === "NFT_SALE") {
          firstNFT = { name: "Solana NFT", symbol: "NFT", type: "Metaplex" };
        }
        if (firstToken && firstNFT) break;
      }
    }
  } catch {}

  return {
    chain: "Solana",
    hash: oldest.signature,
    date: formatDate(dateMs),
    dateTime: formatDateTime(dateMs),
    age: timeAgo(dateMs),
    dateMs,
    from: address,
    to: "—",
    type: "First recorded",
    totalTx,
    totalGasEth: "—",
    mostActiveYear,
    ensName: null,
    firstToken,
    firstNFT,
  };
}

const chainConfig = {
  eth: { label: "Ethereum", color: "#627EEA", icon: "⟠" },
  sol: { label: "Solana", color: "#9945FF", icon: "◎" },
};

function StatBox({ label, value, color }) {
  return (
    <div style={{ background: "#080b10", borderRadius: 8, padding: "10px 12px" }}>
      <div style={{ fontSize: 9, color: "#444", letterSpacing: "0.2em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, color: color || "#ccc", fontWeight: 600 }}>{value}</div>
    </div>
  );
}

export default function WalletBirthday() {
  const [address, setAddress] = useState("");
  const [chain, setChain] = useState("eth");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function lookup() {
    if (!address.trim()) return;
    setLoading(true);
    setResult(null);
    setError("");
    try {
      const data = chain === "eth"
        ? await fetchEthFirstTx(address.trim())
        : await fetchSolFirstTx(address.trim());
      setResult(data);
    } catch (e) {
      setError(e.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function copyHash() {
    if (!result) return;
    navigator.clipboard.writeText(result.hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const activeChain = chainConfig[chain];

  return (
    <div style={{
      minHeight: "100vh", background: "#080b10", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", fontFamily: "'Courier New', monospace",
      padding: "24px", position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: `linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)`,
        backgroundSize: "40px 40px", pointerEvents: "none",
      }} />
      <div style={{
        position: "absolute", width: 500, height: 500, borderRadius: "50%",
        background: `radial-gradient(circle, ${activeChain.color}22 0%, transparent 70%)`,
        top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        transition: "background 0.5s ease", pointerEvents: "none",
      }} />

      <div style={{ position: "relative", width: "100%", maxWidth: 560 }}>
        {/* Header */}
        <div style={{ marginBottom: 40, textAlign: "center" }}>
          <div style={{ fontSize: 11, letterSpacing: "0.3em", color: "#555", marginBottom: 10, textTransform: "uppercase" }}>
            On-Chain Archive
          </div>
          <h1 style={{ fontSize: "clamp(28px, 5vw, 42px)", fontWeight: 700, color: "#fff", margin: 0, lineHeight: 1.1, letterSpacing: "-0.02em" }}>
            Wallet<span style={{ color: activeChain.color }}> Birthday</span>
          </h1>
          <p style={{ color: "#444", fontSize: 13, marginTop: 10, letterSpacing: "0.05em" }}>
            Find your first ever on-chain transaction
          </p>
        </div>

        {/* Chain selector */}
        <div style={{ display: "flex", background: "#0e1219", border: "1px solid #1e2530", borderRadius: 10, padding: 4, marginBottom: 16, gap: 4 }}>
          {Object.entries(chainConfig).map(([key, cfg]) => (
            <button key={key} onClick={() => { setChain(key); setResult(null); setError(""); }}
              style={{
                flex: 1, padding: "10px 0", borderRadius: 7, border: "none", cursor: "pointer",
                fontSize: 13, fontFamily: "inherit", fontWeight: 600, letterSpacing: "0.05em",
                transition: "all 0.2s", background: chain === key ? cfg.color + "22" : "transparent",
                color: chain === key ? cfg.color : "#444",
                borderBottom: chain === key ? `2px solid ${cfg.color}` : "2px solid transparent",
              }}>
              {cfg.icon} {cfg.label}
            </button>
          ))}
        </div>

        {/* Input */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input
            value={address}
            onChange={e => setAddress(e.target.value)}
            onKeyDown={e => e.key === "Enter" && lookup()}
            placeholder={chain === "eth" ? "0x... Ethereum address" : "Solana wallet address"}
            style={{
              flex: 1, background: "#0e1219", border: "1px solid #1e2530", borderRadius: 9,
              padding: "13px 16px", color: "#e8eaf0", fontSize: 13, fontFamily: "inherit",
              letterSpacing: "0.02em", outline: "none", transition: "border-color 0.2s",
            }}
            onFocus={e => e.target.style.borderColor = activeChain.color}
            onBlur={e => e.target.style.borderColor = "#1e2530"}
          />
          <button onClick={lookup} disabled={loading}
            style={{
              padding: "13px 22px", borderRadius: 9, border: "none", background: activeChain.color,
              color: "#fff", fontSize: 13, fontWeight: 700, fontFamily: "inherit",
              cursor: loading ? "not-allowed" : "pointer", letterSpacing: "0.08em",
              opacity: loading ? 0.7 : 1, transition: "opacity 0.2s", whiteSpace: "nowrap",
            }}>
            {loading ? "..." : "Look up →"}
          </button>
        </div>

        {error && (
          <div style={{ background: "#1a0a0a", border: "1px solid #3a1515", borderRadius: 9, padding: "12px 16px", color: "#e05050", fontSize: 12 }}>
            ⚠ {error}
          </div>
        )}

        {loading && (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#444", fontSize: 12, letterSpacing: "0.15em" }}>
            <div style={{
              display: "inline-block", width: 20, height: 20,
              border: `2px solid ${activeChain.color}33`, borderTop: `2px solid ${activeChain.color}`,
              borderRadius: "50%", animation: "spin 0.8s linear infinite", marginBottom: 12,
            }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <div>Scanning the chain...</div>
          </div>
        )}

        {result && !loading && (
          <div style={{ marginTop: 16, background: "#0e1219", border: `1px solid ${activeChain.color}44`, borderRadius: 14, overflow: "hidden", animation: "fadeUp 0.4s ease" }}>
            <style>{`@keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }`}</style>

            {/* Header */}
            <div style={{ padding: "18px 20px", borderBottom: `1px solid ${activeChain.color}22`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                {result.ensName && (
                  <div style={{ fontSize: 12, color: activeChain.color, marginBottom: 4, fontWeight: 700 }}>
                    🌐 {result.ensName}
                  </div>
                )}
                <div style={{ fontSize: 10, color: "#444", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 4 }}>
                  {result.chain} · Wallet Opened
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", letterSpacing: "-0.01em" }}>
                  🎂 {result.date}
                </div>
                <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>
                  🕐 {result.dateTime}
                </div>
              </div>
              <div style={{ background: activeChain.color + "22", border: `1px solid ${activeChain.color}55`, borderRadius: 8, padding: "8px 14px", textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "#555", letterSpacing: "0.15em", marginBottom: 2 }}>AGE</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: activeChain.color }}>{result.age}</div>
              </div>
            </div>

            {/* Stats */}
            <div style={{ padding: "16px 20px", borderBottom: `1px solid #1a1f28` }}>
              <div style={{ fontSize: 9, color: "#444", letterSpacing: "0.2em", marginBottom: 10, textTransform: "uppercase" }}>Wallet Stats</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <StatBox label="TOTAL TXS" value={result.totalTx || "—"} color="#ccc" />
                <StatBox label="GAS SPENT" value={result.totalGasEth !== "—" ? `${result.totalGasEth} ETH` : "—"} color="#f0a500" />
                <StatBox label="MOST ACTIVE" value={result.mostActiveYear} color={activeChain.color} />
              </div>
            </div>

            {/* First Token & NFT */}
            {(result.firstToken || result.firstNFT) && (
              <div style={{ padding: "16px 20px", borderBottom: `1px solid #1a1f28` }}>
                <div style={{ fontSize: 9, color: "#444", letterSpacing: "0.2em", marginBottom: 10, textTransform: "uppercase" }}>First Interactions</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {result.firstToken && (
                    <div style={{ background: "#080b10", borderRadius: 8, padding: "10px 12px" }}>
                      <div style={{ fontSize: 9, color: "#444", letterSpacing: "0.2em", marginBottom: 4 }}>FIRST TOKEN</div>
                      <div style={{ fontSize: 13, color: "#ccc", fontWeight: 600 }}>{result.firstToken.symbol}</div>
                      <div style={{ fontSize: 10, color: "#555" }}>{result.firstToken.name}</div>
                    </div>
                  )}
                  {result.firstNFT && (
                    <div style={{ background: "#080b10", borderRadius: 8, padding: "10px 12px" }}>
                      <div style={{ fontSize: 9, color: "#444", letterSpacing: "0.2em", marginBottom: 4 }}>FIRST NFT</div>
                      <div style={{ fontSize: 13, color: "#ccc", fontWeight: 600 }}>{result.firstNFT.symbol}</div>
                      <div style={{ fontSize: 10, color: "#555" }}>{result.firstNFT.name}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TX Details */}
            <div style={{ padding: "16px 20px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <StatBox label="TX TYPE" value={result.type} />
                <StatBox label="NETWORK" value={`${activeChain.icon} ${result.chain}`} color={activeChain.color} />
              </div>
              <div
                style={{ background: "#080b10", borderRadius: 8, padding: "10px 12px", cursor: "pointer", transition: "background 0.2s" }}
                onClick={copyHash}
                onMouseEnter={e => e.currentTarget.style.background = "#111620"}
                onMouseLeave={e => e.currentTarget.style.background = "#080b10"}
              >
                <div style={{ fontSize: 9, color: "#444", letterSpacing: "0.2em", marginBottom: 4, display: "flex", justifyContent: "space-between" }}>
                  <span>TX HASH</span>
                  <span style={{ color: copied ? "#4caf50" : "#333" }}>{copied ? "✓ COPIED" : "CLICK TO COPY"}</span>
                </div>
                <div style={{ fontSize: 11, color: "#666", wordBreak: "break-all", lineHeight: 1.5 }}>{result.hash}</div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: "12px 20px", borderTop: "1px solid #1a1f28", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 10, color: "#333", letterSpacing: "0.1em" }}>wallet-birthday.app</div>
              <a
                href={chain === "eth" ? `https://etherscan.io/tx/${result.hash}` : `https://solscan.io/tx/${result.hash}`}
                target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 10, color: activeChain.color, textDecoration: "none", letterSpacing: "0.1em", border: `1px solid ${activeChain.color}44`, padding: "4px 10px", borderRadius: 5 }}
              >
                View on Explorer →
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}