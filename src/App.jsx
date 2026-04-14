import { useState } from "react";

const ETHERSCAN_API_KEY = "84SFQP2F84YIC6M7JNBRF9X3KD43Z6FHRRx";
const HELIUS_API_KEY = "7733dd36-5ea9-4c1c-9ecd-044cf74eee23";
const SERVER = "https://wallet-birthday-server.onrender.com";

function timeAgo(dateMs) {
  const now = Date.now();
  const days = Math.floor((now - dateMs) / 86400000);
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
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    timeZoneName: "short",
  });
}

async function fetchEthFirstTx(address) {
  const res = await fetch(`${SERVER}/eth-first-tx?address=${address}&apikey=${ETHERSCAN_API_KEY}`);
  const data = await res.json();
  if (data.status !== "1" || !data.result?.length)
    throw new Error("No ETH transactions found or invalid address.");
  const tx = data.result[0];
  const dateMs = parseInt(tx.timeStamp) * 1000;
  const ethValue = (parseInt(tx.value) / 1e18).toFixed(6);

  let totalTx = 0;
  let totalGasEth = 0;
  let mostActiveYear = "—";
  try {
    const allRes = await fetch(`${SERVER}/eth-all-tx?address=${address}&apikey=${ETHERSCAN_API_KEY}`);
    const allData = await allRes.json();
    const allTxs = allData.status === "1" ? allData.result : [];
    totalTx = allTxs.length;
    const yearCount = {};
    allTxs.forEach(t => {
      totalGasEth += (parseInt(t.gasUsed || 0) * parseInt(t.gasPrice || 0)) / 1e18;
      const year = new Date(parseInt(t.timeStamp) * 1000).getFullYear();
      yearCount[year] = (yearCount[year] || 0) + 1;
    });
    mostActiveYear = Object.keys(yearCount).sort((a, b) => yearCount[b] - yearCount[a])[0] || "—";
  } catch (e) {}

  let ensName = null;
  try {
    const ensRes = await fetch(`${SERVER}/ens?address=${address}&apikey=${ETHERSCAN_API_KEY}`);
    const ensData = await ensRes.json();
    ensName = ensData.name || null;
  } catch (e) {}

  let firstToken = null;
  try {
    const tokenRes = await fetch(`${SERVER}/eth-first-token?address=${address}&apikey=${ETHERSCAN_API_KEY}`);
    const tokenData = await tokenRes.json();
    if (tokenData.status === "1" && tokenData.result?.length) {
      const t = tokenData.result[0];
      firstToken = { name: t.tokenName || "Unknown", symbol: t.tokenSymbol || "?" };
    }
  } catch (e) {}

  let firstNFT = null;
  try {
    const nftRes = await fetch(`${SERVER}/eth-first-nft?address=${address}&apikey=${ETHERSCAN_API_KEY}`);
    const nftData = await nftRes.json();
    if (nftData.status === "1" && nftData.result?.length) {
      const n = nftData.result[0];
      firstNFT = { name: n.tokenName || "Unknown NFT", symbol: n.tokenSymbol || "?" };
    }
  } catch (e) {}

  return {
    chain: "Ethereum",
    hash: tx.hash,
    date: formatDate(dateMs),
    dateTime: formatDateTime(dateMs),
    age: timeAgo(dateMs),
    value: ethValue + " ETH",
    rawValue: parseInt(tx.value),
    type: tx.from.toLowerCase() === address.toLowerCase() ? "Outgoing" : "Incoming",
    totalTx,
    totalGasEth: totalGasEth.toFixed(5) + " ETH",
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
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getSignaturesForAddress", params: [address, { limit: 1000 }] }),
  });
  const sigData = await sigRes.json();
  const sigs = sigData.result;
  if (!sigs || sigs.length === 0) throw new Error("No Solana transactions found.");
  const oldest = sigs[sigs.length - 1];
  const dateMs = oldest.blockTime * 1000;
  const yearCount = {};
  sigs.forEach(s => {
    const year = new Date(s.blockTime * 1000).getFullYear();
    yearCount[year] = (yearCount[year] || 0) + 1;
  });
  const mostActiveYear = Object.keys(yearCount).sort((a, b) => yearCount[b] - yearCount[a])[0] || "—";

  let firstToken = null;
  let firstNFT = null;
  try {
    const txRes = await fetch(`https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${HELIUS_API_KEY}&limit=100&type=ANY`);
    const txData = await txRes.json();
    if (Array.isArray(txData)) {
      const reversed = [...txData].reverse();
      for (const t of reversed) {
        if (!firstToken && t.tokenTransfers?.length > 0) {
          const tk = t.tokenTransfers[0];
          firstToken = { name: "SPL Token", symbol: tk.mint?.slice(0, 6) + "..." };
        }
        if (!firstNFT && t.type === "NFT_SALE") {
          firstNFT = { name: "Solana NFT", symbol: "NFT" };
        }
        if (firstToken && firstNFT) break;
      }
    }
  } catch (e) {}

  return {
    chain: "Solana",
    hash: oldest.signature,
    date: formatDate(dateMs),
    dateTime: formatDateTime(dateMs),
    age: timeAgo(dateMs),
    value: "—",
    rawValue: 0,
    type: "First recorded",
    totalTx: sigs.length,
    totalGasEth: "—",
    mostActiveYear,
    ensName: null,
    firstToken,
    firstNFT,
  };
}

const chains = {
  eth: { label: "Ethereum", color: "#627EEA", icon: "⟠" },
  sol: { label: "Solana", color: "#14F195", icon: "◎" },
};

export default function App() {
  const [address, setAddress] = useState("");
  const [chain, setChain] = useState("eth");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const cfg = chains[chain];

  async function lookup() {
    if (!address.trim()) return;
    setLoading(true);
    setResult(null);
    setError("");
    try {
      const data = chain === "eth" ? await fetchEthFirstTx(address.trim()) : await fetchSolFirstTx(address.trim());
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

  return (
    <div style={{
      minHeight: "100vh", background: "#050608",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Courier New', monospace", padding: "20px",
      position: "relative", overflow: "hidden",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@700;800&display=swap');
        * { box-sizing: border-box; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes scanline { 0% { top: -2px; } 100% { top: 100vh; } }
        .btn:hover { opacity: 0.85; transform: translateY(-1px); }
        .btn:active { transform: translateY(0); }
        .copy-box:hover { background: #0e1118 !important; }
        input:focus { outline: none; }
      `}</style>

      {/* Scanline */}
      <div style={{
        position: "fixed", left: 0, right: 0, height: "2px",
        background: `linear-gradient(90deg, transparent, ${cfg.color}60, transparent)`,
        animation: "scanline 5s linear infinite", pointerEvents: "none", zIndex: 0,
      }} />

      {/* Glow */}
      <div style={{
        position: "fixed", width: 700, height: 700, borderRadius: "50%",
        background: `radial-gradient(circle, ${cfg.color}12 0%, transparent 70%)`,
        top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        transition: "background 0.6s", pointerEvents: "none",
      }} />

      {/* Grid */}
      <div style={{
        position: "fixed", inset: 0,
        backgroundImage: `linear-gradient(${cfg.color}06 1px, transparent 1px), linear-gradient(90deg, ${cfg.color}06 1px, transparent 1px)`,
        backgroundSize: "60px 60px", pointerEvents: "none",
      }} />

      <div style={{ position: "relative", width: "100%", maxWidth: 560, zIndex: 1 }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ fontSize: 9, letterSpacing: "0.6em", color: "#2a2f3a", marginBottom: 10, fontFamily: "'Space Mono', monospace" }}>
            ◈ ON-CHAIN ARCHIVE ◈
          </div>
          <h1 style={{
            fontFamily: "'Syne', sans-serif", fontSize: "clamp(40px, 9vw, 72px)",
            fontWeight: 800, margin: 0, lineHeight: 0.9, letterSpacing: "-0.02em",
            background: `linear-gradient(135deg, #ffffff 30%, ${cfg.color} 100%)`,
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            backgroundClip: "text", transition: "background 0.5s",
          }}>
            WALLET<br/>BIRTHDAY
          </h1>
          <p style={{ color: "#2a2f3a", fontSize: 10, marginTop: 14, letterSpacing: "0.25em", fontFamily: "'Space Mono', monospace" }}>
            DISCOVER YOUR FIRST ON-CHAIN MOMENT
          </p>
        </div>

        {/* Chain tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          {Object.entries(chains).map(([key, c]) => (
            <button key={key} className="btn"
              onClick={() => { setChain(key); setResult(null); setError(""); }}
              style={{
                flex: 1, padding: "11px 0", cursor: "pointer",
                border: `1px solid ${chain === key ? c.color : "#131720"}`,
                borderRadius: 8, background: chain === key ? c.color + "18" : "#080a0f",
                color: chain === key ? c.color : "#2a2f3a",
                fontSize: 11, fontWeight: 700, fontFamily: "'Space Mono', monospace",
                letterSpacing: "0.15em", transition: "all 0.2s",
              }}>
              {c.icon} {c.label.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Input row */}
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <input value={address} onChange={e => setAddress(e.target.value)}
            onKeyDown={e => e.key === "Enter" && lookup()}
            placeholder={chain === "eth" ? "0x... ethereum address" : "solana wallet address"}
            style={{
              flex: 1, background: "#080a0f", border: "1px solid #131720",
              borderRadius: 8, padding: "13px 16px", color: "#c8d0e0",
              fontSize: 11, fontFamily: "'Space Mono', monospace",
              letterSpacing: "0.04em", transition: "border-color 0.2s",
            }}
            onFocus={e => e.target.style.borderColor = cfg.color}
            onBlur={e => e.target.style.borderColor = "#131720"}
          />
          <button className="btn" onClick={lookup} disabled={loading}
            style={{
              padding: "13px 22px", borderRadius: 8, border: "none",
              background: loading ? "#0e1018" : cfg.color,
              color: chain === "sol" ? "#050608" : "#fff",
              fontSize: 11, fontWeight: 700, fontFamily: "'Space Mono', monospace",
              cursor: loading ? "not-allowed" : "pointer",
              letterSpacing: "0.1em", transition: "all 0.2s", whiteSpace: "nowrap",
            }}>
            {loading ? "···" : "SEARCH →"}
          </button>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            background: "#120808", border: "1px solid #2a1010", borderRadius: 8,
            padding: "11px 16px", color: "#ff5555", fontSize: 10,
            fontFamily: "'Space Mono', monospace", letterSpacing: "0.05em",
          }}>⚠ {error}</div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: "center", padding: "50px 0" }}>
            <div style={{
              display: "inline-block", width: 22, height: 22,
              border: `2px solid ${cfg.color}25`, borderTop: `2px solid ${cfg.color}`,
              borderRadius: "50%", animation: "spin 0.7s linear infinite", marginBottom: 14,
            }} />
            <div style={{ color: "#2a2f3a", fontSize: 9, letterSpacing: "0.35em", fontFamily: "'Space Mono', monospace" }}>
              SCANNING THE CHAIN...
            </div>
          </div>
        )}

        {/* Result card */}
        {result && !loading && (
          <div style={{ animation: "fadeUp 0.4s ease" }}>
            <div style={{
              background: "#080a0f", border: `1px solid ${cfg.color}55`,
              borderRadius: 14, overflow: "hidden",
              boxShadow: `0 0 60px ${cfg.color}10`,
            }}>
              {/* Color bar */}
              <div style={{ height: 2, background: `linear-gradient(90deg, transparent, ${cfg.color}, transparent)` }} />

              <div style={{ padding: "22px 24px" }}>

                {/* ENS badge */}
                {result.ensName && (
                  <div style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    background: cfg.color + "12", border: `1px solid ${cfg.color}33`,
                    borderRadius: 20, padding: "4px 14px", marginBottom: 16,
                    fontSize: 10, color: cfg.color, fontFamily: "'Space Mono', monospace",
                  }}>
                    🌐 {result.ensName}
                  </div>
                )}

                {/* Date + age row */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                  <div>
                    <div style={{ fontSize: 8, color: "#2a2f3a", letterSpacing: "0.35em", marginBottom: 8, fontFamily: "'Space Mono', monospace" }}>
                      WALLET OPENED ON
                    </div>
                    <div style={{ fontSize: "clamp(16px, 3.5vw, 24px)", fontWeight: 800, color: "#fff", fontFamily: "'Syne', sans-serif", lineHeight: 1.2 }}>
                      🎂 {result.date}
                    </div>
                    <div style={{ fontSize: 9, color: "#2a2f3a", marginTop: 6, fontFamily: "'Space Mono', monospace" }}>
                      {result.dateTime}
                    </div>
                  </div>
                  <div style={{
                    background: cfg.color + "12", border: `1px solid ${cfg.color}33`,
                    borderRadius: 10, padding: "10px 18px", textAlign: "center",
                  }}>
                    <div style={{ fontSize: 7, color: "#2a2f3a", letterSpacing: "0.3em", marginBottom: 4, fontFamily: "'Space Mono', monospace" }}>AGE</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: cfg.color, fontFamily: "'Syne', sans-serif" }}>{result.age}</div>
                  </div>
                </div>

                {/* First TX value highlight */}
                {result.value !== "—" && (
                  <div style={{
                    background: `linear-gradient(135deg, ${cfg.color}08, transparent)`,
                    border: `1px solid ${cfg.color}22`, borderRadius: 10,
                    padding: "14px 18px", marginBottom: 14,
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}>
                    <div>
                      <div style={{ fontSize: 8, color: "#2a2f3a", letterSpacing: "0.3em", marginBottom: 6, fontFamily: "'Space Mono', monospace" }}>
                        FIRST TRANSACTION VALUE
                      </div>
                      <div style={{ fontSize: "clamp(18px, 4vw, 28px)", fontWeight: 800, color: cfg.color, fontFamily: "'Syne', sans-serif" }}>
                        {result.value}
                      </div>
                    </div>
                    <div style={{
                      background: result.type === "Incoming" ? "#14F19520" : "#627EEA20",
                      border: `1px solid ${result.type === "Incoming" ? "#14F19544" : "#627EEA44"}`,
                      borderRadius: 6, padding: "6px 12px",
                      fontSize: 10, fontWeight: 700, fontFamily: "'Space Mono', monospace",
                      color: result.type === "Incoming" ? "#14F195" : "#627EEA",
                    }}>
                      {result.type.toUpperCase()}
                    </div>
                  </div>
                )}

                {/* Stats */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14 }}>
                  {[
                    { label: "TOTAL TXS", value: result.totalTx || "—" },
                    { label: "GAS SPENT", value: result.totalGasEth },
                    { label: "PEAK YEAR", value: result.mostActiveYear },
                  ].map((s, i) => (
                    <div key={i} style={{ background: "#050608", borderRadius: 8, padding: "10px 12px", border: "1px solid #0e1018" }}>
                      <div style={{ fontSize: 7, color: "#2a2f3a", letterSpacing: "0.25em", marginBottom: 5, fontFamily: "'Space Mono', monospace" }}>{s.label}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#8892a4", fontFamily: "'Space Mono', monospace" }}>{s.value}</div>
                    </div>
                  ))}
                </div>

                {/* First token & NFT */}
                {(result.firstToken || result.firstNFT) && (
                  <div style={{ display: "grid", gridTemplateColumns: result.firstToken && result.firstNFT ? "1fr 1fr" : "1fr", gap: 8, marginBottom: 14 }}>
                    {result.firstToken && (
                      <div style={{ background: "#050608", borderRadius: 8, padding: "10px 12px", border: "1px solid #0e1018" }}>
                        <div style={{ fontSize: 7, color: "#2a2f3a", letterSpacing: "0.25em", marginBottom: 5, fontFamily: "'Space Mono', monospace" }}>FIRST TOKEN</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: cfg.color, fontFamily: "'Space Mono', monospace" }}>{result.firstToken.symbol}</div>
                        <div style={{ fontSize: 9, color: "#3a4050", fontFamily: "'Space Mono', monospace", marginTop: 2 }}>{result.firstToken.name}</div>
                      </div>
                    )}
                    {result.firstNFT && (
                      <div style={{ background: "#050608", borderRadius: 8, padding: "10px 12px", border: "1px solid #0e1018" }}>
                        <div style={{ fontSize: 7, color: "#2a2f3a", letterSpacing: "0.25em", marginBottom: 5, fontFamily: "'Space Mono', monospace" }}>FIRST NFT</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: cfg.color, fontFamily: "'Space Mono', monospace" }}>{result.firstNFT.symbol}</div>
                        <div style={{ fontSize: 9, color: "#3a4050", fontFamily: "'Space Mono', monospace", marginTop: 2 }}>{result.firstNFT.name}</div>
                      </div>
                    )}
                  </div>
                )}

                {/* TX Hash */}
                <div className="copy-box" onClick={copyHash}
                  style={{ background: "#050608", borderRadius: 8, padding: "10px 14px", cursor: "pointer", border: "1px solid #0e1018", transition: "background 0.2s" }}>
                  <div style={{ fontSize: 7, color: "#2a2f3a", letterSpacing: "0.25em", marginBottom: 6, display: "flex", justifyContent: "space-between", fontFamily: "'Space Mono', monospace" }}>
                    <span>FIRST TX HASH</span>
                    <span style={{ color: copied ? "#14F195" : "#1e2430" }}>{copied ? "✓ COPIED" : "CLICK TO COPY"}</span>
                  </div>
                  <div style={{ fontSize: 9, color: "#3a4050", wordBreak: "break-all", lineHeight: 1.7, fontFamily: "'Space Mono', monospace" }}>
                    {result.hash}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div style={{
                padding: "12px 24px", borderTop: "1px solid #0e1018",
                display: "flex", justifyContent: "space-between", alignItems: "center",
                background: "#050608",
              }}>
                <div style={{ fontSize: 8, color: "#1e2430", letterSpacing: "0.2em", fontFamily: "'Space Mono', monospace" }}>
                  WALLET-BIRTHDAY.NETLIFY.APP
                </div>
                <a href={chain === "eth" ? `https://etherscan.io/tx/${result.hash}` : `https://solscan.io/tx/${result.hash}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{
                    fontSize: 8, color: cfg.color, textDecoration: "none",
                    border: `1px solid ${cfg.color}30`, padding: "5px 12px", borderRadius: 4,
                    fontFamily: "'Space Mono', monospace", letterSpacing: "0.1em",
                  }}>
                  EXPLORER →
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}