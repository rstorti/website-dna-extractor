import React from 'react';

function SettingsTab({ lastExtractionUrls, stageTimings, totalMs }) {
    return (
        <div className="input-card">
            <h1 className="brand-font">Settings & Logs</h1>
            <p>Admin diagnostics and extraction performance report.</p>
            <div className="dashboard-grid">
                {/* Extraction Timing Log */}
                <div className="glass-panel" style={{ gridColumn: '1 / -1' }}>
                    <h3 style={{ marginBottom: '0.5rem', color: 'var(--primary)' }}>⏱ Last Extraction Timing Report</h3>

                    {/* Input URLs panel */}
                    {lastExtractionUrls && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1.2rem', padding: '0.8rem 1rem', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Extraction Inputs</div>
                            {[
                                { label: 'Website', url: lastExtractionUrls.website, icon: '🌐' },
                                { label: 'YouTube', url: lastExtractionUrls.youtube, icon: '▶️' },
                                { label: 'Profile', url: lastExtractionUrls.profile, icon: '👤' },
                            ].filter(r => r.url).map(r => (
                                <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.82rem' }}>
                                    <span style={{ width: '20px', textAlign: 'center' }}>{r.icon}</span>
                                    <span style={{ color: 'rgba(255,255,255,0.4)', minWidth: '55px' }}>{r.label}</span>
                                    <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}
                                        onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                                        onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
                                    >{r.url}</a>
                                    <button onClick={() => navigator.clipboard.writeText(r.url)} title="Copy URL" style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)', cursor: 'pointer', padding: '0 2px', fontSize: '0.75rem' }}>⎘</button>
                                </div>
                            ))}
                        </div>
                    )}

                    {stageTimings.length === 0 ? (
                        <p style={{ color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' }}>No extraction run yet this session. Run an extraction to see stage timings.</p>
                    ) : (
                        <>
                            <div style={{ display: 'flex', gap: '2rem', marginBottom: '1rem', fontSize: '0.9rem', color: 'rgba(255,255,255,0.6)' }}>
                                <span>Total: <strong style={{ color: '#4ade80' }}>{totalMs ? (totalMs / 1000).toFixed(1) + 's' : '—'}</strong></span>
                                <span>Stages: <strong style={{ color: 'var(--primary)' }}>{stageTimings.length}</strong></span>
                                <span>Slowest: <strong style={{ color: '#f87171' }}>{stageTimings.length > 0 ? stageTimings.reduce((a,b) => b.durationMs > a.durationMs ? b : a).stage.substring(0,40) : '—'}</strong></span>
                            </div>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.5)' }}>
                                            <th style={{ textAlign: 'left', padding: '6px 8px' }}>#</th>
                                            <th style={{ textAlign: 'left', padding: '6px 8px' }}>Stage</th>
                                            <th style={{ textAlign: 'right', padding: '6px 8px' }}>Duration</th>
                                            <th style={{ textAlign: 'right', padding: '6px 8px' }}>Cumulative</th>
                                            <th style={{ textAlign: 'right', padding: '6px 8px' }}>% of Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {stageTimings.map((t, i) => {
                                            const pct = totalMs ? ((t.durationMs / totalMs) * 100).toFixed(1) : 0;
                                            const isSlowest = t === stageTimings.reduce((a,b) => b.durationMs > a.durationMs ? b : a);
                                            return (
                                                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: isSlowest ? 'rgba(248,113,113,0.08)' : 'transparent' }}>
                                                    <td style={{ padding: '5px 8px', color: 'rgba(255,255,255,0.3)' }}>{i + 1}</td>
                                                    <td style={{ padding: '5px 8px', color: isSlowest ? '#f87171' : 'rgba(255,255,255,0.85)', fontWeight: isSlowest ? '600' : 'normal' }}>
                                                        {isSlowest ? '🐌 ' : ''}{t.stage}
                                                    </td>
                                                    <td style={{ textAlign: 'right', padding: '5px 8px', color: t.durationMs > 5000 ? '#fbbf24' : '#4ade80', fontFamily: 'monospace' }}>
                                                        {t.durationMs >= 1000 ? (t.durationMs / 1000).toFixed(2) + 's' : t.durationMs + 'ms'}
                                                    </td>
                                                    <td style={{ textAlign: 'right', padding: '5px 8px', color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>
                                                        {(t.elapsedMs / 1000).toFixed(2)}s
                                                    </td>
                                                    <td style={{ textAlign: 'right', padding: '5px 8px' }}>
                                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                                            <div style={{ width: '60px', height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                                                                <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: pct > 30 ? '#f87171' : pct > 10 ? '#fbbf24' : '#4ade80', borderRadius: '3px', transition: 'width 0.3s' }} />
                                                            </div>
                                                            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', minWidth: '38px', textAlign: 'right' }}>{pct}%</span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </div>

                {/* Engine Settings */}
                <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <h3 style={{ marginBottom: '0.25rem', color: 'var(--primary)' }}>Engine Settings</h3>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer', fontSize: '1.1rem' }}>
                        <input type="checkbox" defaultChecked style={{ width: '20px', height: '20px', accentColor: 'var(--primary)' }} />
                        Enable Vertex AI Outpainting (1:1 strict)
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer', fontSize: '1.1rem' }}>
                        <input type="checkbox" defaultChecked style={{ width: '20px', height: '20px', accentColor: 'var(--primary)' }} />
                        Auto-scroll lazy loaded elements
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer', fontSize: '1.1rem' }}>
                        <input type="checkbox" defaultChecked style={{ width: '20px', height: '20px', accentColor: 'var(--primary)' }} />
                        Save Raw HTML Snapshot
                    </label>
                </div>
            </div>
        </div>
    );
}

export default SettingsTab;
