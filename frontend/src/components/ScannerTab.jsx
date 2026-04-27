import React, { useState } from 'react';
import { getSessionToken } from '../App';

function ScannerTab({ showToast }) {
    const [scanUrl, setScanUrl] = useState('');
    const [scanResults, setScanResults] = useState(null);
    const [isScanning, setIsScanning] = useState(false);
    const [scanError, setScanError] = useState(null);
    const [scanFilter, setScanFilter] = useState('all');
    const [scanMinWidth, setScanMinWidth] = useState(0);
    const [scanSelected, setScanSelected] = useState([]);
    const [scanDims, setScanDims] = useState({});

    const API_BASE = import.meta.env.VITE_API_URL || '';
    const typeMap = { jpg: ['jpg','jpeg'], png: ['png'], gif: ['gif'], webp: ['webp'], svg: ['svg'], avif: ['avif'] };
    const getExt = (u) => { try { return new URL(u).pathname.split('.').pop().toLowerCase().split('?')[0]; } catch { return ''; } };
    
    const passesType = (u) => {
        if (scanFilter === 'all') return true;
        return (typeMap[scanFilter] || []).includes(getExt(u));
    };
    
    const passesSize = (u) => {
        if (scanMinWidth === 0) return true;
        const d = scanDims[u];
        return d ? d.w >= scanMinWidth : true;
    };
    
    const filtered = scanResults ? scanResults.images.filter(img => passesType(img.url) && passesSize(img.url)) : [];
    const filterSelected = filtered.filter(img => scanSelected.includes(img.url));

    const handleScan = async () => {
        if (!scanUrl.trim()) return;
        setIsScanning(true); setScanError(null); setScanResults(null); setScanSelected([]); setScanDims({});
        try {
            const r = await fetch(`${API_BASE}/api/scan-images`, { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getSessionToken() }, 
                body: JSON.stringify({ url: scanUrl.trim() }) 
            });
            const d = await r.json();
            if (!r.ok) throw new Error(d.error || 'Scan failed');
            setScanResults(d);
        } catch(e) { setScanError(e.message); }
        setIsScanning(false);
    };


    const downloadSelected = () => {
        scanSelected.forEach((url, i) => {
            setTimeout(() => {
                const a = document.createElement('a');
                a.href = url; a.download = `image_${i+1}.${getExt(url) || 'jpg'}`;
                a.target = '_blank'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
            }, i * 200);
        });
    };

    return (
        <div className="input-card">
            <h1 className="brand-font">🔍 Image Scanner</h1>
            <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: '1.5rem' }}>Scan any website and instantly see every image. Filter by type and size, then select to download or add to your campaign.</p>

            {/* URL Input Row */}
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
                <div style={{ flex: 1, position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', fontSize: '1rem', opacity: 0.5 }}>🌐</span>
                    <input
                        type="url"
                        value={scanUrl}
                        onChange={e => setScanUrl(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && !isScanning && handleScan()}
                        placeholder="https://example.com — paste any URL and press Scan"
                        style={{ width: '100%', padding: '0.85rem 1rem 0.85rem 2.8rem', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 'var(--radius-sm)', color: '#fff', fontSize: '0.95rem', boxSizing: 'border-box' }}
                    />
                </div>
                <button
                    onClick={handleScan}
                    disabled={isScanning || !scanUrl.trim()}
                    style={{ padding: '0.85rem 2rem', background: isScanning ? 'rgba(249,157,50,0.4)' : 'var(--primary)', color: '#000', border: 'none', borderRadius: 'var(--radius-sm)', fontWeight: '700', fontSize: '1rem', cursor: isScanning ? 'wait' : 'pointer', whiteSpace: 'nowrap', opacity: (!scanUrl.trim() && !isScanning) ? 0.5 : 1 }}
                >
                    {isScanning ? '⏳ Scanning…' : '🔍 Scan'}
                </button>
            </div>

            {scanError && <div style={{ background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.4)', color: '#f87171', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', marginBottom: '1rem' }}>❌ {scanError}</div>}

            {scanResults && (
            <div className="glass-panel">
                {/* Results header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1 }}>
                        <span style={{ fontWeight: '700', color: 'var(--primary)', fontSize: '1.05rem' }}>{filtered.length}</span>
                        <span style={{ color: 'rgba(255,255,255,0.5)', marginLeft: '0.4rem' }}>images from</span>
                        <span style={{ color: 'rgba(255,255,255,0.8)', marginLeft: '0.4rem', fontFamily: 'monospace', fontSize: '0.85rem' }}>{scanResults.host}</span>
                        {filterSelected.length > 0 && <span style={{ marginLeft: '1rem', background: 'rgba(249,157,50,0.15)', color: 'var(--primary)', padding: '0.1rem 0.6rem', borderRadius: '20px', fontSize: '0.8rem', fontWeight: '700' }}>{filterSelected.length} selected</span>}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={() => setScanSelected(filtered.map(i=>i.url))} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.8)', padding: '0.3rem 0.8rem', borderRadius: '20px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600' }}>☑ All</button>
                        <button onClick={() => setScanSelected([])} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.8)', padding: '0.3rem 0.8rem', borderRadius: '20px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600' }}>✕ Clear</button>
                        {filterSelected.length > 0 && <>
                            <button onClick={downloadSelected} style={{ background: 'var(--primary)', color: '#000', border: 'none', padding: '0.3rem 0.9rem', borderRadius: '20px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '700' }}>⬇ Download ({filterSelected.length})</button>
                            <button onClick={() => navigator.clipboard.writeText(filterSelected.join('\n')).then(() => showToast('✅ URLs copied!'))} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.8)', padding: '0.3rem 0.8rem', borderRadius: '20px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600' }}>⎘ Copy URLs</button>
                        </>}
                    </div>
                </div>

                {/* Filter controls */}
                <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        {['all','jpg','png','gif','webp','svg','avif'].map(t => (
                            <button key={t} onClick={() => setScanFilter(t)} style={{ padding: '0.25rem 0.7rem', borderRadius: '20px', border: '1px solid', borderColor: scanFilter === t ? 'var(--primary)' : 'rgba(255,255,255,0.15)', background: scanFilter === t ? 'rgba(249,157,50,0.15)' : 'rgba(255,255,255,0.05)', color: scanFilter === t ? 'var(--primary)' : 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: scanFilter === t ? '700' : '400', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                {t === 'all' ? 'All types' : t.toUpperCase()}
                            </button>
                        ))}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: 'auto', fontSize: '0.82rem', color: 'rgba(255,255,255,0.5)' }}>
                        <span>Min width:</span>
                        {[0,100,200,400,800].map(w => (
                            <button key={w} onClick={() => setScanMinWidth(w)} style={{ padding: '0.2rem 0.5rem', borderRadius: '12px', border: '1px solid', borderColor: scanMinWidth === w ? 'var(--primary)' : 'rgba(255,255,255,0.12)', background: scanMinWidth === w ? 'rgba(249,157,50,0.12)' : 'transparent', color: scanMinWidth === w ? 'var(--primary)' : 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: scanMinWidth === w ? '700' : '400' }}>
                                {w === 0 ? 'Any' : `${w}px`}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Image Grid */}
                {filtered.length === 0 ? (
                    <p style={{ color: 'rgba(255,255,255,0.35)', textAlign: 'center', padding: '2rem', fontStyle: 'italic' }}>No images match your current filters.</p>
                ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '0.5rem' }}>
                    {filtered.map((img, idx) => {
                        const isSel = scanSelected.includes(img.url);
                        const dim = scanDims[img.url];
                        const ext = getExt(img.url).toUpperCase() || '?';
                        return (
                            <div key={img.url} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <div
                                    onClick={() => setScanSelected(prev => isSel ? prev.filter(s => s !== img.url) : [...prev, img.url])}
                                    title={img.url}
                                    style={{ position: 'relative', aspectRatio: '1', borderRadius: '8px', overflow: 'hidden', cursor: 'pointer', border: isSel ? '2px solid var(--primary)' : '2px solid rgba(255,255,255,0.07)', transition: 'all 0.15s', boxShadow: isSel ? '0 0 0 1px var(--primary), 0 4px 16px rgba(0,0,0,0.5)' : '0 2px 6px rgba(0,0,0,0.3)', transform: isSel ? 'scale(0.97)' : 'scale(1)', background: '#111' }}
                                >
                                    <img
                                        src={img.url}
                                        alt=""
                                        loading="lazy"
                                        style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}
                                        onLoad={e => { const el = e.target; setScanDims(prev => ({ ...prev, [img.url]: { w: el.naturalWidth, h: el.naturalHeight } })); }}
                                        onError={e => { e.target.closest('div[style]').style.display = 'none'; }}
                                    />
                                    {/* Selection overlay */}
                                    <div style={{ position:'absolute', inset:0, background: isSel ? 'rgba(249,157,50,0.15)' : 'transparent', transition:'background 0.15s', pointerEvents:'none' }} />
                                    {/* Checkbox */}
                                    <div style={{ position:'absolute', top:'5px', left:'5px', width:'18px', height:'18px', borderRadius:'4px', background: isSel ? 'var(--primary)' : 'rgba(0,0,0,0.6)', border: isSel ? '2px solid var(--primary)' : '2px solid rgba(255,255,255,0.35)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'10px', fontWeight:'900', color:'#000', pointerEvents:'none' }}>
                                        {isSel && '✓'}
                                    </div>
                                    {/* Source badge */}
                                    {img.context === 'og' && <div style={{ position:'absolute', top:'5px', right:'5px', background:'rgba(74,222,128,0.8)', borderRadius:'3px', fontSize:'0.55rem', padding:'1px 3px', color:'#000', fontWeight:'700', pointerEvents:'none' }}>OG</div>}
                                </div>
                                {/* Dimension badge */}
                                {dim && <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.7rem', color:'rgba(255,255,255,0.6)', fontFamily:'monospace', padding: '0 2px' }}>
                                    <span>{ext.length > 4 ? ext.substring(0,4) : ext}</span>
                                    <span>{dim.w}×{dim.h}</span>
                                </div>}
                            </div>
                        );
                    })}
                </div>
                )}
            </div>
            )}
        </div>
    );
}

export default ScannerTab;
