import { useState, useEffect } from 'react';
import './index.css';
import './loading.css';

function App() {
    const [url, setUrl] = useState('');
    const [youtubeUrl, setYoutubeUrl] = useState('');
    const [profileUrl, setProfileUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('Dashboard');
    const [historyData, setHistoryData] = useState([]);
    const [loadingText, setLoadingText] = useState('Extracting Brand DNA & Outpainting Assets...');
    
    // Interactive Selection States
    const [selectedSummaryType, setSelectedSummaryType] = useState('website'); // website, youtube, combined
    const [summaryText, setSummaryText] = useState({ website: '', youtube: '', combined: '' });
    const [selectedCtas, setSelectedCtas] = useState([]);
    const [selectedImages, setSelectedImages] = useState([]);
    const [showJsonPreview, setShowJsonPreview] = useState(false);
    const [selectedButtonStyle, setSelectedButtonStyle] = useState(null);
    const [selectedColors, setSelectedColors] = useState([]);
    const [customPalettes, setCustomPalettes] = useState({});
    const [ctaEdits, setCtaEdits] = useState({});
    const [expandedDomains, setExpandedDomains] = useState({});
    const [isGeneratingJson, setIsGeneratingJson] = useState(false);

    const loadingMessages = [
        "Initializing environment...",
        "Navigating to website...",
        "Analyzing layout and styles...",
        "Extracting high-resolution images...",
        "Enhancing hero images...",
        "Expanding image boundaries seamlessly...",
        "Generating alternative layouts...",
        "Compiling metadata...",
        "Finalizing extraction..."
    ];

    useEffect(() => {
        let interval;
        if (loading) {
            let step = 0;
            setLoadingText(loadingMessages[0]);
            interval = setInterval(() => {
                step++;
                if (step < loadingMessages.length) setLoadingText(loadingMessages[step]);
            }, 3000);
        }
        return () => clearInterval(interval);
    }, [loading]);

    const fetchHistory = async () => {
        try {
            const res = await fetch('/api/history');
            const data = await res.json();
            setHistoryData(data || []);
        } catch (e) { console.error('Failed to fetch history', e); }
    };

    useEffect(() => {
        if (activeTab === 'History') fetchHistory();
    }, [activeTab]);

    useEffect(() => {
        // Reset JSON preview (and revert green selectors back to orange) if the user modifies any active selections
        if (showJsonPreview) {
            setShowJsonPreview(false);
        }
    }, [selectedSummaryType, summaryText, selectedCtas, selectedImages, selectedButtonStyle, selectedColors]);

    useEffect(() => {
        // Dynamic Theming: Update CSS root variables based on extracted brand DNA or user overrides
        const accentColor = customPalettes['Button Accent'] || (result?.data?.icon_background_color_left !== '#000000' && result?.data?.icon_background_color_left !== '#FFFFFF' ? result?.data?.icon_background_color_left : null) || '#f99d32';
        
        if (accentColor.startsWith('#')) {
            document.documentElement.style.setProperty('--primary', accentColor);
            try {
                let r = 0, g = 0, b = 0;
                if (accentColor.length === 4) { r = "0x" + accentColor[1] + accentColor[1]; g = "0x" + accentColor[2] + accentColor[2]; b = "0x" + accentColor[3] + accentColor[3]; }
                else if (accentColor.length === 7) { r = "0x" + accentColor[1] + accentColor[2]; g = "0x" + accentColor[3] + accentColor[4]; b = "0x" + accentColor[5] + accentColor[6]; }
                document.documentElement.style.setProperty('--primary-glow', `rgba(${+r}, ${+g}, ${+b}, 0.4)`);
            } catch(e) {}
        } else {
            document.documentElement.style.setProperty('--primary', '#f99d32');
            document.documentElement.style.setProperty('--primary-glow', 'rgba(249, 157, 50, 0.4)');
        }
    }, [result, customPalettes]);

    const handleExtract = async () => {
        if (!url && !profileUrl && !youtubeUrl) return;
        setLoading(true);
        setError(null);
        setResult(null);

        // Implement a timeout to prevent hanging forever
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 180000); // 3-minute timeout

        try {
            const response = await fetch('/api/extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, youtubeUrl, profileUrl }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            
            const rawText = await response.text();
            let data;
            try {
                data = JSON.parse(rawText);
            } catch (err) {
                if (response.status >= 500) {
                     throw new Error(`Server Gateway Error (${response.status}): The Render backend might be sleeping or crashed. Please wait 1 minute and click Extract again. Raw: ${rawText.substring(0, 50)}`);
                }
                throw new Error(`Invalid JSON Response (${response.status}): The backend returned non-JSON. This usually happens if the server hasn't been deployed yet or Netlify connection timed out.`);
            }

            if (!response.ok) throw new Error(data.error || 'Failed to extract DNA');
            
            setResult(data);
            
            // Initialize selection states
            const verified = data.data || {};
            setSummaryText({
                website: verified.website_summary || '',
                youtube: verified.youtube_summary || '',
                combined: verified.combined_summary || '',
                raw_youtube: data.youtubeData?.description || ''
            });
            setSelectedSummaryType('website');
            setSelectedCtas([
                ...(verified.youtube_ctas || []),
                ...(data.ctas || [])
            ]);
            setCtaEdits({}); // Reset CTA edits on new extraction
            setSelectedImages(data.data?.image ? [data.data.image] : []);
            
            const btnStyles = data.data?.buttonStyles || data.buttonStyles || [];
            setSelectedButtonStyle(btnStyles.length > 0 ? btnStyles[0] : null);

            const colorsToSelect = [
                { label: 'Background Color', hex: data.data?.background_color },
                { label: 'Foreground Color', hex: data.data?.foreground_color },
                { label: 'App Bar Background', hex: data.data?.background_app_bar_color },
                { label: 'App Bar Text', hex: data.data?.foreground_app_bar_color },
                { label: 'Button Accent', hex: data.data?.icon_background_color_left }
            ];
            setSelectedColors(colorsToSelect.filter(c => c.hex).map(c => c.label));

            setShowJsonPreview(false);
            
            // Instantly sync the current extraction to local history UI
            setHistoryData(prev => [{ 
                id: new Date().getTime().toString(),
                url: url || profileUrl || youtubeUrl, 
                timestamp: new Date().toISOString(), 
                success: true, 
                payload: data 
            }, ...prev]);
            
            setActiveTab('Dashboard');
        } catch (err) {
            clearTimeout(timeoutId);
            if (err.name === 'AbortError') {
                setError('Extraction taking too long (Timeout). The website may be heavily protected or rendering slowly.');
            } else {
                setError(err.message);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteDomain = async (domain) => {
        if (!window.confirm(`Are you sure you want to delete ALL extractions for ${domain}?`)) return;
        try {
            await fetch('/api/history', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ domain })
            });
            setHistoryData(prev => prev.filter(item => {
                let itemDomain = item.url || item.target_url;
                try { itemDomain = new URL(itemDomain).hostname; } catch(e) {}
                return String(itemDomain) !== String(domain);
            }));
        } catch (error) {
            console.error('Failed to delete domain history', error);
        }
    };

    const handleDeleteExtraction = async (timestamp) => {
        if (!window.confirm(`Delete this specific extraction record?`)) return;
        try {
            await fetch('/api/history', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ timestamp })
            });
            setHistoryData(prev => prev.filter(item => item.timestamp !== timestamp));
        } catch (error) {
            console.error('Failed to delete extraction history', error);
        }
    };

    // Helper function to handle downloads safely via proxy to preserve file extensions
    const handleForceDownload = (e, url, title) => {
        e.preventDefault();
        // Route through our local backend to cleanly affix the filename without CORS issues
        window.location.href = `/api/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(title)}`;
    };

    return (
        <div className="layout-wrapper">
            <aside className="sidebar">
                <div className="brand-logo">
                    <span>🧬</span> DNA Extractor
                </div>
                <nav className="nav-menu">
                    <div className={`nav-item ${activeTab === 'Dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('Dashboard')}>Dashboard</div>
                    <div className={`nav-item ${activeTab === 'History' ? 'active' : ''}`} onClick={() => setActiveTab('History')}>History</div>
                    <div className={`nav-item ${activeTab === 'Settings' ? 'active' : ''}`} onClick={() => setActiveTab('Settings')}>Settings</div>
                </nav>
            </aside>

            <main className="main-area">
                {activeTab === 'Dashboard' && (
                    <>
                        <div className="input-card">
                            <h1 className="brand-font" style={{ marginBottom: '0.5rem', fontSize: '2.5rem', textAlign: 'center' }}>Create Your Campaign</h1>
                            <h3 style={{ color: 'var(--primary)', fontWeight: '500', fontSize: '1.4rem', marginTop: 0, marginBottom: '1rem', textAlign: 'center' }}>Most content gets watched and forgotten.</h3>
                            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '1.1rem', lineHeight: '1.6', textAlign: 'center', maxWidth: '800px', margin: '0 auto 1.5rem auto' }}>
                                A Minfo campaign gives your audience a seamless accessible connection to what interests them at the moment of curiosity - and gives you proof it worked.
                            </p>
                            <p style={{ color: 'var(--text-secondary)', marginBottom: '2.5rem', fontSize: '1.1rem', lineHeight: '1.6', textAlign: 'center', maxWidth: '800px', margin: '0 auto 2.5rem auto' }}>
                                Add either or all of the URLs below. Minfo pulls your brand details and content style automatically, then builds a draft campaign for you to review and make your own.
                            </p>

                            <div className="search-bar" style={{ display: 'flex', gap: '1.5rem', maxWidth: '850px', margin: '0 auto', alignItems: 'stretch' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1 }}>
                                    <div style={{ display: 'flex', gap: '1rem', height: '54px' }}>
                                        <input
                                            type="url"
                                            className="url-input"
                                            placeholder="Website URL (e.g. https://example.com)"
                                            style={{ flex: 1, height: '100%', padding: '0 1.2rem', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}
                                            value={url}
                                            onChange={(e) => setUrl(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleExtract()}
                                            disabled={loading}
                                        />
                                        <button 
                                            onClick={async () => { try { const text = await navigator.clipboard.readText(); setUrl(text); } catch (e) { alert('Enable clipboard permissions or use Win+V/Ctrl+V directly'); } }}
                                            style={{ width: '54px', height: '54px', background: 'transparent', color: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: 'var(--radius-sm)', padding: 0, cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', transition: 'all 0.2s', flexShrink: 0 }}
                                            onMouseEnter={(e)=>e.currentTarget.style.background='rgba(249, 157, 50, 0.1)'}
                                            onMouseLeave={(e)=>e.currentTarget.style.background='transparent'}
                                            title="Paste from Clipboard"
                                        >
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
                                        </button>
                                    </div>
                                    <div style={{ display: 'flex', gap: '1rem', height: '54px' }}>
                                        <input
                                            type="url"
                                            className="url-input"
                                            placeholder="YouTube Video URL (Optional)"
                                            style={{ flex: 1, height: '100%', padding: '0 1.2rem', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}
                                            value={youtubeUrl}
                                            onChange={(e) => setYoutubeUrl(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleExtract()}
                                            disabled={loading}
                                        />
                                        <button 
                                            onClick={async () => { try { const text = await navigator.clipboard.readText(); setYoutubeUrl(text); } catch (e) { alert('Enable clipboard permissions or use Win+V/Ctrl+V directly'); } }}
                                            style={{ width: '54px', height: '54px', background: 'transparent', color: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: 'var(--radius-sm)', padding: 0, cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', transition: 'all 0.2s', flexShrink: 0 }}
                                            onMouseEnter={(e)=>e.currentTarget.style.background='rgba(249, 157, 50, 0.1)'}
                                            onMouseLeave={(e)=>e.currentTarget.style.background='transparent'}
                                            title="Paste from Clipboard"
                                        >
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
                                        </button>
                                    </div>
                                    <div style={{ display: 'flex', gap: '1rem', height: '54px' }}>
                                        <input
                                            type="url"
                                            className="url-input"
                                            placeholder="Link-in-Bio / Profile Page URL (Optional)"
                                            style={{ flex: 1, height: '100%', padding: '0 1.2rem', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}
                                            value={profileUrl}
                                            onChange={(e) => setProfileUrl(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleExtract()}
                                            disabled={loading}
                                        />
                                        <button 
                                            onClick={async () => { try { const text = await navigator.clipboard.readText(); setProfileUrl(text); } catch (e) { alert('Enable clipboard permissions or use Win+V/Ctrl+V directly'); } }}
                                            style={{ width: '54px', height: '54px', background: 'transparent', color: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: 'var(--radius-sm)', padding: 0, cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', transition: 'all 0.2s', flexShrink: 0 }}
                                            onMouseEnter={(e)=>e.currentTarget.style.background='rgba(249, 157, 50, 0.1)'}
                                            onMouseLeave={(e)=>e.currentTarget.style.background='transparent'}
                                            title="Paste from Clipboard"
                                        >
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
                                        </button>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', flexShrink: 0, marginLeft: '2rem' }}>
                                    <button 
                                        className="btn-extract-custom" 
                                        onClick={handleExtract} 
                                        disabled={loading || (!url && !profileUrl && !youtubeUrl)} 
                                        style={{ 
                                            height: '54px', 
                                            alignSelf: 'center',
                                            minWidth: '180px', 
                                            display: 'flex', 
                                            flexDirection: 'row', 
                                            justifyContent: 'center', 
                                            alignItems: 'center', 
                                            margin: 0, 
                                            borderRadius: '12px', 
                                            border: 'none', 
                                            background: (url || profileUrl || youtubeUrl) ? 'var(--primary)' : 'rgba(255, 255, 255, 0.08)', 
                                            color: (url || profileUrl || youtubeUrl) ? '#000000' : 'var(--text-secondary)',
                                            fontSize: '1.2rem',
                                            cursor: (loading || (!url && !profileUrl && !youtubeUrl)) ? 'not-allowed' : 'pointer',
                                            transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                                            opacity: loading ? 0.7 : 1,
                                            transform: loading ? 'scale(0.98)' : 'scale(1)'
                                        }}
                                        onMouseEnter={(e) => { if(!(loading || (!url && !profileUrl && !youtubeUrl))) { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.boxShadow = '0 8px 30px var(--primary-glow)'; }}}
                                        onMouseLeave={(e) => { if(!(loading || (!url && !profileUrl && !youtubeUrl))) { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}}
                                    >
                                        {loading ? <div className="loader" style={{borderColor: '#000', borderBottomColor: 'transparent'}}></div> : (
                                            <span style={{ fontWeight: '700', color: 'inherit' }}>Extract Info</span>
                                        )}
                                    </button>
                                </div>
                            </div>
                            
                            {error && (
                                <div className="error-box" style={{ maxWidth: '850px', margin: '1rem auto 0 auto', textAlign: 'center' }}>
                                    <strong>⚠️ Extraction Failed:</strong> {error}
                                </div>
                            )}

                            {loading && (
                                <div className="loading-container" style={{ maxWidth: '850px', width: '100%', margin: '1rem auto 0 auto' }}>
                                    <div className="progress-bar-wrapper">
                                        <div className="progress-bar-fill"></div>
                                    </div>
                                    <div className="loading-status-text">
                                        <span className="pulsing-dot"></span> {loadingText}
                                    </div>
                                </div>
                            )}
                        </div>

                        {result && (
                            <div className="dashboard-grid" style={{ '--active-select': showJsonPreview ? '#4caf50' : 'var(--primary)' }}>

                                {/* 1. Top Header with Logo and Descriptions */}
                                <div className="glass-panel top-header" style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>
                                    <div className="logo-preview-box" style={{ position: 'relative', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
                                        {result.data?.image ? (
                                            <>
                                                <img src={result.data.image} alt="Logo" style={{ maxWidth: '150px' }} />
                                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '1rem', background: 'rgba(0,0,0,0.5)', padding: '0.4rem 0.8rem', borderRadius: 'var(--radius-sm)', color: 'var(--primary)', fontWeight: 'bold' }}>
                                                    <input 
                                                        type="checkbox" 
                                                        checked={selectedImages.includes(result.data.image)}
                                                        onChange={(e) => {
                                                            if (e.target.checked) setSelectedImages([...selectedImages, result.data.image]);
                                                            else setSelectedImages(selectedImages.filter(img => img !== result.data.image));
                                                        }}
                                                    />
                                                    Include Logo
                                                </label>
                                                <a
                                                    href={result.data.image}
                                                    onClick={(e) => handleForceDownload(e, result.data.image, 'extracted_logo_256.png')}
                                                    style={{ display: 'flex', alignItems: 'center', position: 'absolute', bottom: '-40px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '0.2rem 0.6rem', borderRadius: '20px', textDecoration: 'none', fontWeight: '500', fontSize: '0.7rem', whiteSpace: 'nowrap', backdropFilter: 'blur(2px)', transition: 'all 0.2s ease', cursor: 'pointer' }}
                                                >
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '0.4rem' }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                                                    Download
                                                </a>
                                            </>
                                        ) : (
                                            <span style={{ color: "var(--text-secondary)" }}>No Logo</span>
                                        )}
                                    </div>
                                    <div className="header-descriptions" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Generated Descriptions</h3>
                                        
                                        {['website', 'combined', 'youtube'].map(type => {
                                            if (!summaryText[type] && type !== 'website') return null; // Don't show combined or youtube if it doesn't exist
                                            
                                            // Fallback label names
                                            const labels = { website: 'Website Summary', combined: 'Combined Summary', youtube: 'YouTube Video Summary (AI Generated)' };
                                            
                                            return (
                                                <div key={type} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: 'var(--radius-sm)' }}>
                                                    <input 
                                                        type="radio" 
                                                        name="summaryType" 
                                                        value={type} 
                                                        checked={selectedSummaryType === type}
                                                        onChange={() => setSelectedSummaryType(type)}
                                                        style={{ marginTop: '0.3rem', width: '18px', height: '18px', accentColor: 'var(--active-select)' }}
                                                    />
                                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                        <strong style={{ textTransform: 'capitalize', color: selectedSummaryType === type ? 'var(--active-select)' : 'var(--text-color)' }}>{labels[type]}</strong>
                                                        <textarea 
                                                            value={summaryText[type]} 
                                                            onChange={(e) => setSummaryText({ ...summaryText, [type]: e.target.value })}
                                                            style={{ width: '100%', minHeight: '80px', background: 'rgba(255,255,255,0.05)', border: selectedSummaryType === type ? '1px solid var(--active-select)' : '1px solid var(--border-color)', color: 'white', padding: '0.8rem', borderRadius: 'var(--radius-sm)', resize: 'vertical', fontFamily: 'inherit', fontSize: '0.95rem' }}
                                                            disabled={selectedSummaryType !== type}
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        


                                        {/* Totally new independent field for Raw YouTube Description */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: 'var(--radius-sm)' }}>
                                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                    <strong style={{ color: 'var(--primary)' }}>YouTube Video Description used</strong>
                                                    <textarea 
                                                        value={summaryText['raw_youtube'] || ''} 
                                                        onChange={(e) => setSummaryText({ ...summaryText, raw_youtube: e.target.value })}
                                                        style={{ width: '100%', minHeight: '80px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', color: 'white', padding: '0.8rem', borderRadius: 'var(--radius-sm)', resize: 'vertical', fontFamily: 'inherit', fontSize: '0.95rem' }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                        

                                    </div>
                                </div>

                                {/* 2. Social Media Presence */}
                                {result.socialMediaLinks?.length > 0 && (
                                    <div className="glass-panel">
                                        <h3 className="panel-title">🌐 Social Media Links</h3>
                                        <div className="social-icons-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', width: '100%', alignItems: 'start' }}>
                                            {(() => {
                                                // Group by platform
                                                const grouped = {
                                                    Facebook: [],
                                                    'Twitter/X': [],
                                                    Instagram: [],
                                                    LinkedIn: [],
                                                    YouTube: [],
                                                    Other: []
                                                };
                                                const icons = {
                                                    Facebook: <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z" /></svg>,
                                                    'Twitter/X': <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>,
                                                    Instagram: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>,
                                                    LinkedIn: <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" /></svg>,
                                                    YouTube: <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.541 12 3.541 12 3.541s-7.505 0-9.377.509A3.016 3.016 0 0 0 .501 6.186C0 8.07 0 12 0 12s0 3.93.501 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.377.505 9.377.505s7.505 0 9.377-.505a3.016 3.016 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" /></svg>,
                                                    Other: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                                                };

                                                result.socialMediaLinks.forEach(link => {
                                                    if (link.includes('facebook.com')) grouped.Facebook.push(link);
                                                    else if (link.includes('twitter.com') || link.includes('x.com')) grouped['Twitter/X'].push(link);
                                                    else if (link.includes('instagram.com')) grouped.Instagram.push(link);
                                                    else if (link.includes('linkedin.com')) grouped.LinkedIn.push(link);
                                                    else if (link.includes('youtube.com')) grouped.YouTube.push(link);
                                                    else grouped.Other.push(link);
                                                });

                                                return Object.entries(grouped)
                                                    .filter(([platform, links]) => links.length > 0)
                                                    .map(([platform, links], idx) => (
                                                        <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: 'var(--radius-md)', width: '100%' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', fontWeight: 'bold' }}>
                                                                    <span style={{ display: 'flex', alignItems: 'center', color: 'var(--text-color)' }}>{icons[platform]}</span>
                                                                    <span>{platform}</span>
                                                                    {links.length > 1 && (
                                                                        <span style={{ fontSize: '0.8rem', background: 'var(--surface-color)', padding: '0.2rem 0.5rem', borderRadius: 'var(--radius-sm)' }}>
                                                                            {links.length} accounts found
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                                                                {links.map((link, lIdx) => (
                                                                    <div key={lIdx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.05)', padding: '0.5rem 0.8rem', borderRadius: 'var(--radius-sm)' }}>
                                                                        <a href={link} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)', textDecoration: 'none', fontSize: '0.9rem', wordBreak: 'break-all', marginRight: '1rem' }}>
                                                                            {link}
                                                                        </a>
                                                                        <button
                                                                            onClick={(e) => {
                                                                                navigator.clipboard.writeText(link);
                                                                                const btn = e.currentTarget;
                                                                                btn.style.background = 'rgba(255, 152, 0, 0.2)';
                                                                                setTimeout(() => btn.style.background = 'var(--surface-color)', 200);
                                                                            }}
                                                                            style={{ background: 'var(--surface-color)', color: 'var(--primary)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '0.4rem', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.2s ease' }}
                                                                            title="Copy Link"
                                                                        >
                                                                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                                                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                                                            </svg>
                                                                        </button>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ));
                                            })()}
                                        </div>
                                    </div>
                                )}

                                {/* 3. Hero Images Grid */}
                                {result.featuredImages?.length > 0 && (
                                    <div className="glass-panel">
                                        <h3 className="panel-title">📸 Extracted Hero Images (640x640)</h3>
                                        <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>Images strictly scaled/outpainted using Google Vertex AI for perfect 1:1 aspect ratio.</p>
                                        <div className="hero-images-grid">
                                            {result.featuredImages.map((src, idx) => (
                                                <div key={idx} className="hero-image-card" style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
                                                    <div style={{ position: 'absolute', top: '10px', left: '10px', zIndex: 10, background: 'rgba(0,0,0,0.7)', padding: '0.4rem 0.6rem', borderRadius: 'var(--radius-sm)', backdropFilter: 'blur(4px)' }}>
                                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', margin: 0, fontWeight: 'bold', color: selectedImages.includes(src) ? 'var(--active-select)' : 'var(--text-secondary)' }}>
                                                            <input 
                                                                type="checkbox" 
                                                                checked={selectedImages.includes(src)}
                                                                onChange={(e) => {
                                                                    if (e.target.checked) setSelectedImages([...selectedImages, src]);
                                                                    else setSelectedImages(selectedImages.filter(img => img !== src));
                                                                }}
                                                                style={{ width: '18px', height: '18px', accentColor: 'var(--active-select)', cursor: 'pointer' }}
                                                            />
                                                            Select
                                                        </label>
                                                    </div>
                                                    <img src={src} alt="Hero Feature" />
                                                    <a
                                                        href={src}
                                                        onClick={(e) => handleForceDownload(e, src, `extracted_image_${idx}.jpg`)}
                                                        style={{ display: 'flex', alignItems: 'center', position: 'absolute', bottom: '16px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '0.4rem 1.2rem', borderRadius: '30px', textDecoration: 'none', fontWeight: '500', fontSize: '0.8rem', backdropFilter: 'blur(4px)', transition: 'all 0.2s ease', opacity: '0.85', whiteSpace: 'nowrap', cursor: 'pointer' }}
                                                        onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = 'rgba(0,0,0,0.7)'; }}
                                                        onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.85'; e.currentTarget.style.background = 'rgba(0,0,0,0.5)'; }}
                                                    >
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '0.5rem' }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                                                        Download
                                                    </a>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* 4. Button Style Details */}
                                {result.buttonStyles && result.buttonStyles.length > 0 && (
                                    <div className="glass-panel">
                                        <h3 className="panel-title">🎯 Button Styles & Interaction DNA</h3>
                                        {result.buttonStyles.map((btn, idx) => (
                                            <div key={idx} className="button-styles-layout" style={{ marginBottom: idx < result.buttonStyles.length - 1 ? '3rem' : '0', borderBottom: idx < result.buttonStyles.length - 1 ? '1px dashed var(--border-color)' : 'none', paddingBottom: idx < result.buttonStyles.length - 1 ? '3rem' : '0' }}>
                                                <div className="button-preview-area" style={{ display: 'flex', flexFlow: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '120px', position: 'relative' }}>
                                                    <label style={{ position: 'absolute', top: '10px', left: '10px', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', margin: 0, fontWeight: 'bold', color: selectedButtonStyle === btn ? 'var(--active-select)' : 'var(--text-secondary)' }}>
                                                        <input 
                                                            type="radio" 
                                                            name="buttonStyleSelection"
                                                            checked={selectedButtonStyle === btn}
                                                            onChange={() => setSelectedButtonStyle(btn)}
                                                            style={{ width: '18px', height: '18px', accentColor: 'var(--active-select)', cursor: 'pointer' }}
                                                        />
                                                        Select
                                                    </label>
                                                    <button style={{
                                                        backgroundColor: btn.backgroundColorHex || btn.backgroundColor,
                                                        color: btn.colorHex || btn.color,
                                                        borderRadius: btn.borderRadius,
                                                        fontFamily: btn.fontFamily,
                                                        padding: btn.padding !== '0px' && btn.padding?.trim() ? btn.padding : '12px 24px',
                                                        border: 'none',
                                                        fontSize: '1.05rem',
                                                        fontWeight: 'bold',
                                                        outline: 'none',
                                                        cursor: 'pointer'
                                                    }}>
                                                        {btn.text && btn.text.length < 25 ? btn.text : "Sample Button"}
                                                    </button>
                                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>Live Preview</span>
                                                </div>
                                                <div className="css-properties-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                                                    <div className="css-prop" style={{ gridColumn: 'span 1' }}>
                                                        <div className="css-prop-label">Border Radius</div>
                                                        <div className="css-prop-value">{btn.borderRadius || '0px'}</div>
                                                    </div>
                                                    <div className="css-prop" style={{ gridColumn: 'span 1' }}>
                                                        <div className="css-prop-label">Shape Class</div>
                                                        <div className="css-prop-value">{btn.shape || 'Square'}</div>
                                                    </div>
                                                    <div className="css-prop" style={{ gridColumn: 'span 1' }}>
                                                        <div className="css-prop-label">Background Hex</div>
                                                        <div className="css-prop-value">{btn.backgroundColorHex || btn.backgroundColor || 'N/A'}</div>
                                                    </div>
                                                    <div className="css-prop" style={{ gridColumn: 'span 1' }}>
                                                        <div className="css-prop-label">Text Hex</div>
                                                        <div className="css-prop-value">{btn.colorHex || btn.color || 'N/A'}</div>
                                                    </div>
                                                    <div className="css-prop" style={{ gridColumn: 'span 3' }}>
                                                        <div className="css-prop-label">Font Family</div>
                                                        <div className="css-prop-value">{btn.fontFamily || 'Inherit'}</div>
                                                    </div>
                                                    <div className="css-prop" style={{ gridColumn: 'span 1' }}>
                                                        <div className="css-prop-label">Padding</div>
                                                        <div className="css-prop-value">{btn.padding || '0px'}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* 4b. Extracted CTAs (Website & YouTube) */}
                                {((result.ctas && result.ctas.length > 0) || (result.data?.youtube_ctas && result.data.youtube_ctas.length > 0)) && (
                                    <div className="glass-panel" style={{ gridColumn: '1 / -1' }}>
                                        <h3 className="panel-title">🗣️ Calls to Action (CTAs)</h3>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                            
                                            {/* Website CTAs */}
                                            {result.ctas && result.ctas.length > 0 && (
                                                <div>
                                                    <h4 style={{ color: 'var(--text-secondary)', marginBottom: '1rem', marginTop: 0 }}>From Website</h4>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                                                        {result.ctas.map((cta, idx) => (
                                                            <div key={`web_${idx}`} style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', background: 'var(--surface-color)', padding: '0.5rem 1rem', borderRadius: 'var(--radius-sm)', border: selectedCtas.includes(cta) ? '1px solid var(--active-select)' : '1px solid var(--border-color)', cursor: 'pointer' }}
                                                                onClick={() => {
                                                                    if (selectedCtas.includes(cta)) setSelectedCtas(selectedCtas.filter(c => c !== cta));
                                                                    else setSelectedCtas([...selectedCtas, cta]);
                                                                }}>
                                                                <input 
                                                                    type="checkbox" 
                                                                    checked={selectedCtas.includes(cta)}
                                                                    readOnly
                                                                    style={{ width: '16px', height: '16px', accentColor: 'var(--active-select)' }}
                                                                />
                                                                <span style={{ fontWeight: '500', flex: 1, color: selectedCtas.includes(cta) ? 'var(--active-select)' : 'var(--text-secondary)', wordBreak: 'break-word' }}>{cta}</span>
                                                                <svg onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(cta); }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{cursor: 'pointer', color: 'var(--text-secondary)'}} onMouseEnter={(e)=>e.currentTarget.style.color='var(--primary)'} onMouseLeave={(e)=>e.currentTarget.style.color='var(--text-secondary)'} title="Copy to clipboard"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* YouTube CTAs prominently highlighted */}
                                            {result.data?.youtube_ctas && result.data.youtube_ctas.length > 0 && (
                                                <div style={{ background: 'rgba(0, 0, 0, 0.2)', border: '1px solid var(--border-color)', padding: '1.5rem', borderRadius: 'var(--radius-md)' }}>
                                                    <h4 style={{ color: '#ff4b4b', display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 0, marginBottom: '1rem' }}>
                                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.541 12 3.541 12 3.541s-7.505 0-9.377.509A3.016 3.016 0 0 0 .501 6.186C0 8.07 0 12 0 12s0 3.93.501 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.377.505 9.377.505s7.505 0 9.377-.505a3.016 3.016 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                                                        From YouTube Video Description
                                                    </h4>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                        {result.data.youtube_ctas.map((cta, idx) => {
                                                            // Match exactly since CTAs are now objects {button_name, url, context}
                                                            const isSelected = selectedCtas.some(c => c.url === cta.url && c.context === cta.context);
                                                            const displayButtonName = ctaEdits[cta.url] !== undefined ? ctaEdits[cta.url] : cta.button_name;
                                                            return (
                                                            <div key={`yt_${idx}`} style={{ display: 'flex', alignItems: 'stretch', gap: '1.5rem', background: 'rgba(0,0,0,0.4)', padding: '1rem', borderRadius: 'var(--radius-sm)', border: isSelected ? `1px solid ${showJsonPreview ? '#4caf50' : '#ff4b4b'}` : '1px solid transparent', transition: 'all 0.2s ease', minHeight: '80px' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }} onClick={() => {
                                                                    if (isSelected) setSelectedCtas(selectedCtas.filter(c => !(c.url === cta.url && c.context === cta.context)));
                                                                    else setSelectedCtas([...selectedCtas, cta]);
                                                                }}>
                                                                    <input 
                                                                        type="checkbox" 
                                                                        checked={isSelected}
                                                                        readOnly
                                                                        style={{ width: '20px', height: '20px', accentColor: showJsonPreview ? '#4caf50' : '#ff4b4b', cursor: 'pointer' }}
                                                                    />
                                                                </div>
                                                                <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem', alignItems: 'center' }}>
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', borderRight: '1px dashed rgba(255, 255, 255, 0.1)', paddingRight: '1.5rem' }}>
                                                                        <label style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 'bold' }}>EDITABLE BUTTON NAME (Steve Jobs Voice)</label>
                                                                        <input 
                                                                            type="text"
                                                                            value={displayButtonName}
                                                                            onChange={(e) => setCtaEdits({ ...ctaEdits, [cta.url]: e.target.value })}
                                                                            style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', color: 'white', padding: '0.6rem 0.8rem', borderRadius: 'var(--radius-sm)', fontSize: '0.95rem' }}
                                                                        />
                                                                    </div>
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', overflow: 'hidden' }}>
                                                                        <a href={cta.url} target="_blank" rel="noreferrer" style={{ color: isSelected ? 'var(--active-select)' : 'var(--text-secondary)', textDecoration: 'none', fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', transition: 'color 0.2s ease' }}>{cta.url}</a>
                                                                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>"{cta.context}"</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )})}
                                                    </div>
                                                </div>
                                            )}

                                        </div>
                                    </div>
                                )}

                                {/* 5. Brand Identity Palette */}
                                {(result.data?.background_color || result.data?.foreground_color || result.data?.background_app_bar_color) && (
                                    <div className="glass-panel">
                                        <h3 className="panel-title">🎨 Brand Identity Palette</h3>
                                        <div className="palette-grid">
                                            {[
                                                { label: 'Background Color', hex: result.data?.background_color },
                                                { label: 'Foreground Color', hex: result.data?.foreground_color },
                                                { label: 'App Bar Background', hex: result.data?.background_app_bar_color },
                                                { label: 'App Bar Text', hex: result.data?.foreground_app_bar_color },
                                                { label: 'Button Accent', hex: result.data?.icon_background_color_left }
                                            ].filter(c => c.hex).map((color, idx) => (
                                                <div key={idx} className="color-card" style={{ position: 'relative' }}>
                                                    <div style={{ position: 'absolute', top: '10px', left: '10px', zIndex: 10, background: 'rgba(0,0,0,0.7)', padding: '0.3rem 0.5rem', borderRadius: 'var(--radius-sm)', backdropFilter: 'blur(4px)' }}>
                                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', margin: 0, fontWeight: 'bold', color: selectedColors.includes(color.label) ? 'var(--active-select)' : 'var(--text-secondary)', fontSize: '0.8rem' }}>
                                                            <input 
                                                                type="checkbox" 
                                                                checked={selectedColors.includes(color.label)}
                                                                onChange={(e) => {
                                                                    if (e.target.checked) setSelectedColors([...selectedColors, color.label]);
                                                                    else setSelectedColors(selectedColors.filter(c => c !== color.label));
                                                                }}
                                                                style={{ width: '14px', height: '14px', accentColor: 'var(--active-select)', cursor: 'pointer' }}
                                                            />
                                                            Select
                                                        </label>
                                                    </div>
                                                    <div className="color-swatch" style={{ background: customPalettes[color.label] || color.hex || '#000' }}></div>
                                                    <div className="color-details" style={{ padding: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                                        <div className="color-details-label">{color.label}</div>
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                                                            <div className="color-details-hex" style={{ fontSize: '1rem' }}>{customPalettes[color.label] || color.hex || 'N/A'}</div>
                                                            <input 
                                                                type="color" 
                                                                value={customPalettes[color.label] || color.hex || '#000000'} 
                                                                onChange={(e) => setCustomPalettes({...customPalettes, [color.label]: e.target.value})}
                                                                style={{ width: '24px', height: '24px', padding: 0, border: 'none', cursor: 'pointer', background: 'transparent' }}
                                                                title="Override Color"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}



                                {/* 7. Full Page Screenshot */}
                                {result.screenshotUrl && (
                                    <div className="glass-panel" style={{ gridColumn: '1 / -1' }}>
                                        <h3 className="panel-title">🖥️ Full Page Rendered View</h3>
                                        <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>This is the exact full-scale canvas dimension captured by the headless Puppeteer extraction bot.</p>
                                        <div style={{ width: '100%', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                                            <img src={result.screenshotUrl} alt="Full Page Screenshot" style={{ width: '100%', height: 'auto', display: 'block' }} />
                                        </div>
                                    </div>
                                )}

                                {/* JSON BUILDER / SUBMISSION */}
                                <div className="glass-panel" style={{ gridColumn: '1 / -1', border: '1px solid var(--primary)', background: 'linear-gradient(145deg, rgba(162, 255, 0, 0.05) 0%, rgba(0,0,0,0.4) 100%)' }}>
                                    <h3 className="panel-title" style={{ color: 'var(--primary)' }}>🛠️ Build Final Payload</h3>
                                    <p style={{ color: 'var(--text-secondary)' }}>Review your selections above (Descriptions, Logos, Hero Images, CTAs) and generate the final payload.</p>
                                    
                                    <button 
                                        onClick={() => {
                                            setIsGeneratingJson(true);
                                            setTimeout(() => {
                                                setIsGeneratingJson(false);
                                                setShowJsonPreview(true);
                                            }, 1500);
                                        }}
                                        className="btn-extract" 
                                        style={{ marginTop: '1rem', padding: '1rem 2rem', fontSize: '1.1rem', maxWidth: '300px', display: 'flex', justifyContent: 'center' }}
                                        disabled={isGeneratingJson}
                                    >
                                        {isGeneratingJson ? <div className="loader" style={{width: '20px', height: '20px'}}></div> : 'Submit to Create JSON'}
                                    </button>
                                </div>

                                {/* 6. Campaign Configuration (JSON) */}
                                {showJsonPreview && (
                                    <div className="glass-panel" style={{ gridColumn: '1 / -1', animation: 'fadeIn 0.5s ease forwards' }}>
                                        <h3 className="panel-title">⚙️ Final Campaign JSON</h3>
                                        <div className="json-panel">
                                            <pre dangerouslySetInnerHTML={{
                                                __html: JSON.stringify({
                                                    name: result.data?.name || result.name,
                                                    description: summaryText[selectedSummaryType] || '',
                                                    ...(summaryText['raw_youtube'] ? { "YouTube Video Description used": summaryText['raw_youtube'] } : {}),
                                                    // Visuals
                                                    images: selectedImages,
                                                    brand_colors: {
                                                        background: customPalettes['Background Color'] || result.data?.background_color,
                                                        foreground: customPalettes['Foreground Color'] || result.data?.foreground_color,
                                                        accent: customPalettes['Button Accent'] || result.data?.icon_background_color_left
                                                    },
                                                    // Actionables
                                                    selected_ctas: selectedCtas.map(cta => {
                                                        if (typeof cta === 'object' && cta.url) {
                                                            return {
                                                                ...cta,
                                                                button_name: ctaEdits[cta.url] !== undefined ? ctaEdits[cta.url] : cta.button_name
                                                            };
                                                        }
                                                        return cta;
                                                    }),
                                                    social_links: result.socialMediaLinks || [],
                                                    // Extra fields
                                                    campaign_type: result.data?.campaign_type,
                                                    campaign_time_zone: result.data?.campaign_time_zone,
                                                    currency: result.data?.currency,
                                                    is_selling_item: result.data?.is_selling_item,
                                                    selling_item_details: result.data?.selling_item_details,
                                                    button_style: selectedButtonStyle,
                                                    selected_brand_colors: selectedColors
                                                }, null, 2)
                                                    .replace(/"(.*?)":/g, '<span class="json-key">"$1"</span>:')
                                                    .replace(/: "(.*?)"/g, ': <span class="json-string">"$1"</span>')
                                                    .replace(/: (true|false)/g, ': <span class="json-boolean">$1</span>')
                                                    .replace(/: ([0-9]+)/g, ': <span class="json-number">$1</span>')
                                            }}></pre>
                                        </div>

                                        {result.profilePayload && (
                                            <div style={{ marginTop: '3rem', paddingTop: '2rem', borderTop: '2px dashed var(--border-color)' }}>
                                                <h3 className="panel-title" style={{color: '#ff4b4b'}}>👤 Extracted Link-in-Bio Profile JSON</h3>
                                                <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>This separate configuration file maps identically to minfo properties strictly extrapolated from the Profile Page.</p>
                                                <div className="json-panel">
                                                    <pre dangerouslySetInnerHTML={{
                                                        __html: JSON.stringify({
                                                            name: result.profilePayload.data?.name || "Profile Config",
                                                            description: result.profilePayload.data?.campaign_description || "",
                                                            images: result.profilePayload.featuredImages || [],
                                                            brand_colors: {
                                                                background: result.profilePayload.data?.background_color,
                                                                foreground: result.profilePayload.data?.foreground_color,
                                                                accent: result.profilePayload.data?.icon_background_color_left
                                                            },
                                                            selected_ctas: result.profilePayload.ctas || [],
                                                            social_links: result.profilePayload.socialMediaLinks || [],
                                                            button_style: result.profilePayload.buttonStyles && result.profilePayload.buttonStyles.length > 0 ? result.profilePayload.buttonStyles[0] : null
                                                        }, null, 2)
                                                            .replace(/"(.*?)":/g, '<span class="json-key">"$1"</span>:')
                                                            .replace(/: "(.*?)"/g, ': <span class="json-string">"$1"</span>')
                                                            .replace(/: (true|false)/g, ': <span class="json-boolean">$1</span>')
                                                            .replace(/: ([0-9]+)/g, ': <span class="json-number">$1</span>')
                                                    }}></pre>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </>)}

                {activeTab === 'History' && (
                    <div className="input-card" style={{ marginBottom: 0 }}>
                        <h1 className="brand-font">Extraction History</h1>
                        <p>Previously extracted DNA profiles grouped by domain.</p>
                        <div className="history-grid" style={{
                            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', marginTop: '2rem'
                        }}>
                            {(() => {
                                if (!historyData || historyData.length === 0) return <p>No history available. Run an extraction first!</p>;
                                const grouped = historyData.reduce((acc, curr) => {
                                    let domain = curr.url;
                                    try { domain = new URL(curr.url).hostname; } catch (e) { }
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
                                                        <a href={latest.url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }} onClick={(e) => e.stopPropagation()}>
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
                                                {entries.map((entry, eIdx) => (
                                                    <div key={eIdx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-color)', padding: '0.8rem 1rem', borderRadius: 'var(--radius-sm)' }}>
                                                        <div style={{ fontSize: '0.9rem', color: 'var(--text-color)' }}>
                                                            {formatDate(entry.timestamp)}
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                            <button title="Delete record" onClick={() => handleDeleteExtraction(entry.timestamp)} style={{background: 'transparent', color: 'var(--primary)', border: 'none', padding: '0.4rem', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                                            </button>
                                                            <button
                                                            onClick={() => {
                                                                const verified = entry.payload.data || {};
                                                                setSummaryText({
                                                                    website: verified.website_summary || '',
                                                                    youtube: verified.youtube_summary || '',
                                                                    combined: verified.combined_summary || '',
                                                                    raw_youtube: entry.payload.youtubeData?.description || ''
                                                                });
                                                                setSelectedSummaryType('website');
                                                                setSelectedCtas([]);
                                                                setSelectedImages(verified.image ? [verified.image] : []);
                                                                
                                                                const histBtnStyles = entry.payload.data?.buttonStyles || entry.payload.buttonStyles || [];
                                                                setSelectedButtonStyle(histBtnStyles.length > 0 ? histBtnStyles[0] : null);

                                                                const histColorsToSelect = [
                                                                    { label: 'Background Color', hex: entry.payload.data?.background_color },
                                                                    { label: 'Foreground Color', hex: entry.payload.data?.foreground_color },
                                                                    { label: 'App Bar Background', hex: entry.payload.data?.background_app_bar_color },
                                                                    { label: 'App Bar Text', hex: entry.payload.data?.foreground_app_bar_color },
                                                                    { label: 'Button Accent', hex: entry.payload.data?.icon_background_color_left }
                                                                ];
                                                                setSelectedColors(histColorsToSelect.filter(c => c.hex).map(c => c.label));

                                                                setResult(entry.payload);
                                                                setShowJsonPreview(false);
                                                                setActiveTab('Dashboard');
                                                            }}
                                                            style={{
                                                                background: 'var(--primary)',
                                                                color: 'black',
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
                                                ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                });
                            })()}
                        </div>
                    </div>
                )}

                {activeTab === 'Settings' && (
                    <div className="input-card">
                        <h1 className="brand-font">Settings</h1>
                        <p>Configure extraction engine preferences.</p>
                        <div className="dashboard-grid">
                            <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
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
                )}
            </main>
        </div>
    );
}

export default App;
