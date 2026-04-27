import React from 'react';

function HistoryTab({
    isHistoryLoading,
    historyError,
    historyData,
    fetchHistory,
    expandedDomains,
    setExpandedDomains,
    handleDeleteDomain,
    handleDeleteExtraction,
    showToast,
    setSummaryText,
    setSelectedSummaryType,
    setSelectedCtas,
    setCtaEdits,
    setSelectedImages,
    setSelectedButtonStyle,
    setSelectedColors,
    setUrl,
    setYoutubeUrl,
    setProfileUrl,
    setLinkedinUrl,
    setWebsite2Url,
    setResult,
    setShowJsonPreview,
    setActiveTab,
    skipJsonResetRef,
}) {
    return (
        <div className="input-card" style={{ marginBottom: 0 }}>
            <h1 className="brand-font">Extraction History</h1>
            <p>Previously extracted DNA profiles grouped by domain.</p>
            
            {isHistoryLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 0', gap: '1rem' }}>
                    <div className="loader" style={{ width: '40px', height: '40px', borderWidth: '4px' }}></div>
                    <p style={{ color: 'var(--text-secondary)' }}>Loading history... (server may be waking up, please wait)</p>
                </div>
            ) : historyError ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem 0', gap: '1.5rem', textAlign: 'center' }}>
                    <span style={{ fontSize: '2.5rem' }}>⚠️</span>
                    <p style={{ color: 'var(--text-secondary)', maxWidth: '500px' }}>{historyError}</p>
                    <button onClick={() => fetchHistory()} style={{ background: 'var(--primary)', color: '#000', border: 'none', padding: '0.75rem 2rem', borderRadius: 'var(--radius-sm)', fontWeight: 700, cursor: 'pointer', fontSize: '1rem' }}>↺ Retry</button>
                </div>
            ) : (
                <div className="history-grid" style={{
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', marginTop: '2rem'
                }}>
                    {(() => {
                        if (!historyData || !Array.isArray(historyData) || historyData.length === 0) return <p style={{ color: 'var(--text-secondary)' }}>No extractions found. Run an extraction on the Dashboard first.</p>;
                        const grouped = historyData.reduce((acc, curr) => {
                            let domain = curr.target_url || curr.url;
                            try { domain = new URL(curr.target_url || curr.url).hostname; } catch (e) { }
                            if (!acc[domain]) acc[domain] = [];
                            acc[domain].push(curr);
                            return acc;
                        }, {});
                        return Object.entries(grouped).map(([domain, entries], idx) => {
                            const latest = entries[0];
                            const extractCount = entries.length;

                            const formatDate = (dateString) => {
                                const d = new Date(dateString);
                                const day = String(d.getDate()).padStart(2, '0');
                                const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                                const month = months[d.getMonth()];
                                const year = d.getFullYear();
                                const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                return `${day} ${month} ${year} ${time}`;
                            };

                            const isExpanded = expandedDomains[domain] === true; // Default to collapsed

                            return (
                                <div key={idx} className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    <div 
                                        style={{ display: 'flex', alignItems: 'center', gap: '1rem', borderBottom: isExpanded ? '1px solid var(--border-color)' : 'none', paddingBottom: isExpanded ? '1rem' : '0', cursor: 'pointer' }}
                                        onClick={() => setExpandedDomains(prev => ({ ...prev, [domain]: !isExpanded }))}
                                    >
                                        <div style={{ width: '60px', height: '60px', borderRadius: 'var(--radius-sm)', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                                            {latest.payload?.data?.image || latest.payload?.mappedData?.image ? <img src={latest.payload.data?.image || latest.payload.mappedData?.image} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : '🌐'}
                                        </div>
                                        <div style={{ width: 'calc(100% - 150px)', overflow: 'hidden' }}>
                                            <h3 style={{ fontSize: '1.2rem', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                <a href={latest.target_url || latest.url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }} onClick={(e) => e.stopPropagation()}>
                                                    {domain.replace(/^www\./i, '')}
                                                </a>
                                            </h3>
                                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                {extractCount} extraction{extractCount !== 1 ? 's' : ''}
                                                <span style={{ fontSize: '1rem', color: 'var(--primary)' }}>
                                                    {isExpanded ? '▲' : '▼'}
                                                </span>
                                            </p>
                                        </div>
                                        <div style={{ marginLeft: 'auto', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                            <button title="Delete All" onClick={(e) => { e.stopPropagation(); handleDeleteDomain(domain); }} className="btn-secondary" style={{ background: 'transparent', color: 'var(--primary)', border: 'none', padding: '0.4rem', cursor: 'pointer' }}>
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                                            </button>
                                        </div>
                                    </div>
                                    {isExpanded && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        {entries.map((entry, eIdx) => {
                                            const urlPills = [
                                                entry.target_url  && { key: `w-${eIdx}`, url: entry.target_url,  icon: '🌐', bg: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)' },
                                                entry.youtube_url && { key: `y-${eIdx}`, url: entry.youtube_url, icon: '▶',  bg: 'rgba(255,0,0,0.12)',       color: '#ff7070' },
                                                entry.profile_url && { key: `p-${eIdx}`, url: entry.profile_url, icon: '👤', bg: 'rgba(100,149,237,0.15)',   color: '#7aabff' },
                                            ].filter(Boolean);
                                            return (
                                            <div key={eIdx} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', background: 'var(--surface-color)', padding: '0.8rem 1rem', borderRadius: 'var(--radius-sm)' }}>
                                                {/* URL labels row */}
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', fontSize: '0.78rem' }}>
                                                    {urlPills.map(({ key, url, icon, bg, color }) => (
                                                        <span key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', background: bg, color, padding: '0.15rem 0.35rem 0.15rem 0.5rem', borderRadius: '4px', maxWidth: '100%', minWidth: 0 }}>
                                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{icon} {url}</span>
                                                            <button
                                                                title="Copy URL"
                                                                onClick={() => {
                                                                    navigator.clipboard.writeText(url).then(() => showToast(`✅ Copied: ${url}`, 'success', 2500));
                                                                }}
                                                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 0.1rem', color: 'inherit', opacity: 0.6, display: 'flex', alignItems: 'center', flexShrink: 0, lineHeight: 1 }}
                                                                onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                                                                onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}
                                                            >
                                                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                                                </svg>
                                                            </button>
                                                        </span>
                                                    ))}
                                                </div>
                                                {/* Actions row */}
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                                        {formatDate(entry.timestamp)}
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                        <button title="Delete record" onClick={() => handleDeleteExtraction(entry.timestamp)} style={{background: 'transparent', color: 'var(--primary)', border: 'none', padding: '0.4rem', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                                        </button>
                                                        <button
                                                        onClick={() => {
                                                            if (!entry.payload) {
                                                                showToast('⚠️ This record was saved before Review was supported. Please re-extract to use Review.', 'warning', 6000);
                                                                return;
                                                            }
                                                            const p = entry.payload;
                                                            const inputs = p._inputs || {};
                                                            const verified = p.data || {};

                                                            // ── Restore all 5 input URL fields ──────────────────
                                                            setUrl(inputs.url || entry.target_url || entry.url || '');
                                                            setYoutubeUrl(inputs.youtubeUrl || entry.youtube_url || '');
                                                            setProfileUrl(inputs.profileUrl || entry.profile_url || '');
                                                            setLinkedinUrl(inputs.linkedinUrl || '');
                                                            setWebsite2Url(inputs.website2Url || '');

                                                            // ── Restore summaries ───────────────────────────────
                                                            setSummaryText({
                                                                website: verified.website_summary || '',
                                                                youtube: verified.youtube_summary || '',
                                                                combined: verified.combined_summary || '',
                                                                raw_youtube: p.youtubeData?.description || ''
                                                            });
                                                            setSelectedSummaryType('website');

                                                            // ── Restore CTAs ─────────────────────────────────────
                                                            setSelectedCtas([
                                                                ...(verified.youtube_ctas || []),
                                                                ...(p.ctas || [])
                                                            ]);
                                                            setCtaEdits({});

                                                            // ── Restore images ───────────────────────────────────
                                                            const heroes = p.featuredImages || [];
                                                            if (heroes.length > 0) {
                                                                setSelectedImages(heroes);
                                                            } else if (verified.image || p.mappedData?.image) {
                                                                setSelectedImages([verified.image || p.mappedData?.image].filter(Boolean));
                                                            } else {
                                                                setSelectedImages([]);
                                                            }

                                                            // ── Restore styles ───────────────────────────────────
                                                            const histBtnStyles = p.data?.buttonStyles || p.buttonStyles || [];
                                                            setSelectedButtonStyle(histBtnStyles.length > 0 ? histBtnStyles[0] : null);
                                                            const histColorsToSelect = [
                                                                { label: 'Background Color', hex: p.data?.background_color },
                                                                { label: 'Foreground Color', hex: p.data?.foreground_color },
                                                                { label: 'App Bar Background', hex: p.data?.background_app_bar_color },
                                                                { label: 'App Bar Text', hex: p.data?.foreground_app_bar_color },
                                                                { label: 'Button Accent', hex: p.data?.icon_background_color_left }
                                                            ];
                                                            setSelectedColors(histColorsToSelect.filter(c => c.hex).map(c => c.label));

                                                            // ── Restore full result + show JSON ──────────────────
                                                            setResult(p);
                                                            setActiveTab('Dashboard');
                                                            // Suppress the JSON-reset useEffect for this render cycle
                                                            skipJsonResetRef.current = true;
                                                            setShowJsonPreview(true);
                                                            // Re-enable after React has processed all state updates
                                                            setTimeout(() => { skipJsonResetRef.current = false; }, 200);
                                                            // Scroll to top so JSON panel is visible
                                                            window.scrollTo({ top: 0, behavior: 'smooth' });
                                                        }}
                                                        style={{
                                                            background: entry.payload ? 'var(--primary)' : 'rgba(255,255,255,0.15)',
                                                            color: entry.payload ? 'black' : 'var(--text-secondary)',
                                                            border: 'none',
                                                            padding: '0.4rem 0.8rem',
                                                            borderRadius: 'var(--radius-sm)',
                                                            cursor: 'pointer',
                                                            fontWeight: 'bold',
                                                            fontSize: '0.85rem'
                                                        }}
                                                    >
                                                            Review
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                            );
                                        })}
                                        </div>
                                    )}
                                </div>
                            );
                        });
                    })()}
                </div>
            )}
        </div>
    );
}

export default HistoryTab;
