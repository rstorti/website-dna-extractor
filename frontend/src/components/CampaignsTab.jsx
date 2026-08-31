import React, { useState, useEffect } from 'react';

function CampaignsTab({ brandDna, showToast }) {
    const [sessions, setSessions] = useState([]);
    const [isLoadingSessions, setIsLoadingSessions] = useState(false);
    const [activeSession, setActiveSession] = useState(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [uploadedFiles, setUploadedFiles] = useState([]);
    const [customRules, setCustomRules] = useState('');
    const [targetDna, setTargetDna] = useState(brandDna || null);

    const getSessionToken = () => localStorage.getItem('dna_session_token') || '';

    // Load campaign sessions for tenant
    const fetchSessions = async () => {
        setIsLoadingSessions(true);
        try {
            const res = await fetch('/api/campaign/sessions', {
                headers: { 'Authorization': 'Bearer ' + getSessionToken() }
            });
            if (res.ok) {
                const data = await res.json();
                setSessions(data);
            } else {
                showToast('Failed to load campaign sessions', 'error');
            }
        } catch (e) {
            showToast('Network error loading sessions', 'error');
        } finally {
            setIsLoadingSessions(false);
        }
    };

    useEffect(() => {
        fetchSessions();
    }, []);

    useEffect(() => {
        if (brandDna) {
            setTargetDna(brandDna);
        }
    }, [brandDna]);

    const handleFileChange = (e) => {
        setUploadedFiles(Array.from(e.target.files));
    };

    const handleGenerate = async () => {
        if (!targetDna) {
            showToast('Please run a website/profile extraction first to obtain Brand DNA.', 'warning');
            return;
        }

        setIsGenerating(true);
        const formData = new FormData();
        formData.append('brandDna', JSON.stringify(targetDna));
        
        if (customRules) {
            formData.append('styleGuideRules', JSON.stringify({ customRules }));
        }

        uploadedFiles.forEach(file => {
            formData.append('documents', file);
        });

        try {
            const res = await fetch('/api/campaign/generate', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + getSessionToken()
                },
                body: formData
            });

            if (res.ok) {
                const data = await res.json();
                setActiveSession(data.session);
                showToast('Campaign generated and saved successfully!', 'success');
                fetchSessions(); // Refresh list
            } else {
                const err = await res.json();
                showToast(err.error || 'Campaign generation failed', 'error');
            }
        } catch (e) {
            showToast('Network error during generation', 'error');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleImport = async (sessionId) => {
        setIsImporting(true);
        try {
            const res = await fetch('/api/minfo/import', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + getSessionToken()
                },
                body: JSON.stringify({ sessionId })
            });

            if (res.ok) {
                const data = await res.json();
                showToast('Campaign successfully imported into Minfo!', 'success');
                // Refresh active session and sessions list
                if (activeSession && activeSession.session_id === sessionId) {
                    setActiveSession(prev => ({ ...prev, status: 'imported', idempotency_key: data.idempotencyKey }));
                }
                fetchSessions();
            } else {
                const err = await res.json();
                showToast(err.error || 'Minfo import failed', 'error');
            }
        } catch (e) {
            showToast('Network error during Minfo import', 'error');
        } finally {
            setIsImporting(false);
        }
    };

    const handleDelete = async (sessionId, e) => {
        e.stopPropagation();
        if (!confirm('Are you sure you want to delete this campaign draft?')) return;

        try {
            const res = await fetch(`/api/campaign/sessions/${sessionId}`, {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer ' + getSessionToken() }
            });
            if (res.ok) {
                showToast('Campaign deleted', 'success');
                if (activeSession && activeSession.session_id === sessionId) {
                    setActiveSession(null);
                }
                fetchSessions();
            } else {
                showToast('Failed to delete campaign', 'error');
            }
        } catch (e) {
            showToast('Network error deleting campaign', 'error');
        }
    };

    return (
        <div className="dashboard-grid" style={{ gridTemplateColumns: '1fr 2fr', gap: '1.5rem' }}>
            {/* Sidebar: Ingest & Sessions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {/* Generation Form */}
                <div className="glass-panel" style={{ padding: '1.5rem' }}>
                    <h3 className="brand-font" style={{ marginBottom: '1rem', color: 'var(--primary)' }}>Campaign Creator</h3>
                    
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginBottom: '0.4rem' }}>
                            Target Brand DNA
                        </label>
                        {targetDna ? (
                            <div style={{ padding: '0.6rem', background: 'rgba(255,255,255,0.04)', borderRadius: '6px', fontSize: '0.85rem', color: '#4ade80', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>✔ {targetDna.data?.name || 'Scraped Brand'} loaded</span>
                                <button onClick={() => setTargetDna(null)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '0.8rem' }}>Clear</button>
                            </div>
                        ) : (
                            <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.4)', fontStyle: 'italic', margin: 0 }}>
                                No DNA loaded. Extract a site first.
                            </p>
                        )}
                    </div>

                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginBottom: '0.4rem' }}>
                            Upload Style Guides (PDF / TXT)
                        </label>
                        <input 
                            type="file" 
                            multiple 
                            accept=".pdf,.txt,.md"
                            onChange={handleFileChange}
                            style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)', width: '100%' }}
                        />
                        {uploadedFiles.length > 0 && (
                            <div style={{ marginTop: '0.4rem', fontSize: '0.75rem', color: 'var(--primary)' }}>
                                {uploadedFiles.length} file(s) attached
                            </div>
                        )}
                    </div>

                    <div style={{ marginBottom: '1.2rem' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginBottom: '0.4rem' }}>
                            Custom Style / Tone Rules (optional)
                        </label>
                        <textarea
                            value={customRules}
                            onChange={(e) => setCustomRules(e.target.value)}
                            placeholder="e.g. Tone must be highly professional. Color palette must strictly be dark gray with orange highlights."
                            style={{ width: '100%', height: '80px', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.2)', color: 'white', resize: 'vertical', fontSize: '0.8rem', outline: 'none' }}
                        />
                    </div>

                    <button
                        onClick={handleGenerate}
                        disabled={isGenerating || !targetDna}
                        style={{ width: '100%', padding: '0.8rem', background: 'var(--primary)', color: 'black', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', opacity: (isGenerating || !targetDna) ? 0.6 : 1 }}
                    >
                        {isGenerating ? 'Synthesizing Campaign...' : 'Generate Campaign'}
                    </button>
                </div>

                {/* Saved Campaigns List */}
                <div className="glass-panel" style={{ padding: '1.5rem', flex: 1, minHeight: '300px', display: 'flex', flexDirection: 'column' }}>
                    <h3 className="brand-font" style={{ marginBottom: '1rem', color: 'var(--primary)' }}>Campaign Sessions</h3>
                    
                    {isLoadingSessions ? (
                        <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' }}>Loading drafts...</p>
                    ) : sessions.length === 0 ? (
                        <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.4)', fontStyle: 'italic', margin: 0 }}>No saved campaigns found.</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', overflowY: 'auto', flex: 1, maxHeight: '400px' }}>
                            {sessions.map(s => {
                                const active = activeSession && activeSession.session_id === s.session_id;
                                return (
                                    <div 
                                        key={s.session_id} 
                                        onClick={() => setActiveSession(s)}
                                        style={{ 
                                            padding: '0.8rem', 
                                            borderRadius: '8px', 
                                            background: active ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)', 
                                            border: active ? '1px solid var(--primary)' : '1px solid rgba(255,255,255,0.06)', 
                                            cursor: 'pointer',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        <div style={{ overflow: 'hidden', marginRight: '0.5rem' }}>
                                            <div style={{ fontWeight: '600', fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {s.campaign_output?.campaign?.campaignName || 'Draft Campaign'}
                                            </div>
                                            <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', marginTop: '0.2rem' }}>
                                                {new Date(s.updated_at).toLocaleDateString()} • {s.status.toUpperCase()}
                                            </div>
                                        </div>
                                        <button 
                                            onClick={(e) => handleDelete(s.session_id, e)} 
                                            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', padding: '4px', fontSize: '0.9rem' }}
                                            title="Delete Draft"
                                            onMouseEnter={(e) => e.currentTarget.style.color = '#f87171'}
                                            onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.3)'}
                                        >
                                            🗑
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Campaign Workspace Detail View */}
            <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', minHeight: '500px' }}>
                {activeSession ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', height: '100%' }}>
                        {/* Header controls */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1rem' }}>
                            <div>
                                <h2 className="brand-font" style={{ margin: 0 }}>
                                    {activeSession.campaign_output?.campaign?.campaignName || 'Campaign Details'}
                                </h2>
                                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)' }}>
                                    Session: {activeSession.session_id} • Status: <span style={{ color: activeSession.status === 'imported' ? '#4ade80' : '#fbbf24', fontWeight: 'bold' }}>{activeSession.status.toUpperCase()}</span>
                                </p>
                            </div>
                            <div>
                                <button
                                    onClick={() => handleImport(activeSession.session_id)}
                                    disabled={isImporting || activeSession.status === 'imported'}
                                    style={{ 
                                        padding: '0.6rem 1.2rem', 
                                        background: activeSession.status === 'imported' ? 'rgba(74,222,128,0.2)' : 'var(--primary)', 
                                        color: activeSession.status === 'imported' ? '#4ade80' : 'black', 
                                        border: activeSession.status === 'imported' ? '1px solid #4ade80' : 'none', 
                                        borderRadius: '6px', 
                                        cursor: activeSession.status === 'imported' ? 'default' : 'pointer', 
                                        fontWeight: 'bold',
                                        opacity: isImporting ? 0.6 : 1 
                                    }}
                                >
                                    {activeSession.status === 'imported' ? '✓ Imported to Minfo' : isImporting ? 'Importing...' : 'Publish to Minfo CRM'}
                                </button>
                            </div>
                        </div>

                        {activeSession.idempotency_key && (
                            <div style={{ padding: '0.6rem', background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: '6px', fontSize: '0.75rem', fontFamily: 'monospace', color: '#4ade80' }}>
                                Idempotency Key: {activeSession.idempotency_key}
                            </div>
                        )}

                        {/* Layout details */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                            {/* Left panel: Info & Copy */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                                <div>
                                    <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--primary)' }}>Campaign Description</h4>
                                    <div 
                                        style={{ padding: '0.8rem', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', fontSize: '0.85rem', color: 'rgba(255,255,255,0.85)', minHeight: '100px', border: '1px solid rgba(255,255,255,0.05)', overflowY: 'auto', maxHeight: '200px' }}
                                        dangerouslySetInnerHTML={{ __html: activeSession.campaign_output?.campaign?.campaignDescription || '' }}
                                    />
                                </div>

                                <div>
                                    <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--primary)' }}>Primary Calls-to-Action</h4>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                        {activeSession.campaign_output?.campaignItemButtons?.map((btn, idx) => (
                                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.8rem', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.04)', fontSize: '0.8rem' }}>
                                                <span style={{ fontWeight: '600' }}>{btn.buttonName}</span>
                                                <a href={btn.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>
                                                    {btn.url}
                                                </a>
                                            </div>
                                        )) || <p style={{ fontSize: '0.8rem', fontStyle: 'italic', color: 'rgba(255,255,255,0.3)' }}>No CTAs defined</p>}
                                    </div>
                                </div>
                            </div>

                            {/* Right panel: Pomelli Image Prompts */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                                <div>
                                    <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--primary)' }}>Concept A Image Prompt</h4>
                                    <div style={{ padding: '0.8rem', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                        {activeSession.campaign_output?.imagePrompts?.conceptA || 'No prompt generated.'}
                                    </div>
                                </div>

                                <div>
                                    <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--primary)' }}>Concept B Image Prompt</h4>
                                    <div style={{ padding: '0.8rem', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', fontSize: '0.8rem', color: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                        {activeSession.campaign_output?.imagePrompts?.conceptB || 'No prompt generated.'}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Decision Provenance / Trace Logs */}
                        {activeSession.campaign_output?.decisionProvenance && (
                            <div>
                                <h4 style={{ margin: '0 0 0.6rem 0', color: 'var(--primary)' }}>🛡 Decision Provenance & Brand Rules Alignment</h4>
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', background: 'rgba(255,255,255,0.01)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.04)' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}>
                                                <th style={{ textAlign: 'left', padding: '8px' }}>Decision</th>
                                                <th style={{ textAlign: 'left', padding: '8px' }}>Selected Value</th>
                                                <th style={{ textAlign: 'left', padding: '8px' }}>Source Trace</th>
                                                <th style={{ textAlign: 'left', padding: '8px' }}>Logic / Rationale</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {Object.entries(activeSession.campaign_output.decisionProvenance).map(([key, dec]) => (
                                                <tr key={key} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                                    <td style={{ padding: '8px', fontWeight: 'bold', color: 'rgba(255,255,255,0.85)' }}>{key}</td>
                                                    <td style={{ padding: '8px', color: 'var(--primary)', fontFamily: 'monospace' }}>
                                                        {typeof dec.value === 'string' && dec.value.startsWith('http') ? (
                                                            <a href={dec.value} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)' }}>Link</a>
                                                        ) : (
                                                            dec.value || '—'
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '8px' }}>
                                                        <span style={{ 
                                                            padding: '2px 6px', 
                                                            borderRadius: '4px', 
                                                            fontSize: '0.7rem', 
                                                            fontWeight: '600', 
                                                            textTransform: 'uppercase',
                                                            background: dec.source === 'style-guide' ? 'rgba(168,85,247,0.2)' : 'rgba(59,130,246,0.2)',
                                                            color: dec.source === 'style-guide' ? '#c084fc' : '#60a5fa'
                                                        }}>
                                                            {dec.source}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '8px', color: 'rgba(255,255,255,0.6)' }}>{dec.rationale}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Import JSON Payload Preview */}
                        <div>
                            <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--primary)' }}>Import-Ready Payload JSON</h4>
                            <pre style={{ margin: 0, padding: '0.8rem', background: 'rgba(0,0,0,0.35)', borderRadius: '6px', overflow: 'auto', maxHeight: '150px', fontSize: '0.75rem', border: '1px solid rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.9)' }}>
                                {JSON.stringify({
                                    campaign: activeSession.campaign_output.campaign,
                                    campaignItemButtons: activeSession.campaign_output.campaignItemButtons,
                                    idempotencyKey: activeSession.idempotency_key
                                }, null, 2)}
                            </pre>
                        </div>
                    </div>
                ) : (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.3)', gap: '1rem' }}>
                        <span style={{ fontSize: '3rem' }}>📁</span>
                        <p style={{ margin: 0, fontStyle: 'italic' }}>Select a campaign session or generate a new one to get started.</p>
                    </div>
                )}
            </div>
        </div>
    );
}

export default CampaignsTab;
