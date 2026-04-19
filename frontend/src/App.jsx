import { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import './index.css';
import './loading.css';

// Dynamic environment fallback for Live deployments
// Forcing the URL explicitly because old environment variables in Netlify might be pointing to the wrong instance!
const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? '' : 'https://website-dna-extractor-4.onrender.com';

function App() {
    const [url, setUrl] = useState('');
    const [youtubeUrl, setYoutubeUrl] = useState('');
    const [profileUrl, setProfileUrl] = useState('');
    
    // Validation Overlays
    const [urlError, setUrlError] = useState(false);
    const [youtubeError, setYoutubeError] = useState(false);
    const [profileError, setProfileError] = useState(false);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('Dashboard');
    const [historyData, setHistoryData] = useState([]);
    const [isHistoryLoading, setIsHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState(null);
    const [loadingText, setLoadingText] = useState('Extracting Brand DNA & Outpainting Assets...');
    const [toast, setToast] = useState(null); // { message, type: 'success'|'info'|'warning' }
    const [jsonCopied, setJsonCopied] = useState(false);
    const abortControllerRef = { current: null };
    
    // Interactive Selection States
    const [selectedSummaryType, setSelectedSummaryType] = useState('website'); // website, youtube, combined
    const [summaryText, setSummaryText] = useState({ website: '', youtube: '', combined: '' });
    const [selectedCtas, setSelectedCtas] = useState([]);
    const [selectedImages, setSelectedImages] = useState([]);
    const [showJsonPreview, setShowJsonPreview] = useState(false);
    const [selectedButtonStyle, setSelectedButtonStyle] = useState(null);
    const [selectedColors, setSelectedColors] = useState([]);
    const [customPalettes, setCustomPalettes] = useState(
        () => { try { return JSON.parse(localStorage.getItem('dna_palettes') || '{}'); } catch { return {}; } }
    );
    const [ctaEdits, setCtaEdits] = useState({});
    const [expandedDomains, setExpandedDomains] = useState({});
    const [isGeneratingJson, setIsGeneratingJson] = useState(false);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [stageTimings, setStageTimings] = useState([]);   // per-stage timing from last extraction
    const [totalMs, setTotalMs] = useState(null);           // total extraction ms
    const [lastExtractionUrls, setLastExtractionUrls] = useState(null); // URLs used in last extraction
    // Image Scanner state (Imageye-clone)
    const [scanUrl, setScanUrl] = useState('');
    const [scanResults, setScanResults] = useState(null);   // { images, total, host }
    const [isScanning, setIsScanning] = useState(false);
    const [scanError, setScanError] = useState(null);
    const [scanFilter, setScanFilter] = useState('all');    // 'all' | 'jpg' | 'png' | 'gif' | 'webp' | 'svg'
    const [scanMinWidth, setScanMinWidth] = useState(0);    // min natural width filter (px)
    const [scanSelected, setScanSelected] = useState([]);   // selected image urls
    const [scanDims, setScanDims] = useState({});           // { url: { w, h } } populated on image load
    // Dashboard pre-scan state
    const [dashScanResults, setDashScanResults] = useState(null);
    const [isDashScanning, setIsDashScanning] = useState(false);
    const [dashScanError, setDashScanError] = useState(null);
    const [dashSelectedImages, setDashSelectedImages] = useState([]);
    const [dashScanDims, setDashScanDims] = useState({});
    
    const timerRef = useRef(null);

    const showToast = (message, type = 'success', duration = 4000) => {
        setToast({ message, type });
        setTimeout(() => setToast(null), duration);
    };

    const handleCancelExtract = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
    };

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

    // Timer: start counting when loading begins, stop when done
    useEffect(() => {
        if (loading) {
            setElapsedSeconds(0);
            timerRef.current = setInterval(() => {
                setElapsedSeconds(prev => prev + 1);
            }, 1000);
        } else {
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        }
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [loading]);

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

    // Auto-scan Website URL for Dashboard Images
    useEffect(() => {
        if (!url || !isValidDomain(url)) {
            setDashScanResults(null);
            setDashSelectedImages([]);
            return;
        }
        const timer = setTimeout(async () => {
            setIsDashScanning(true);
            setDashScanError(null);
            try {
                const API_BASE = import.meta.env.VITE_API_URL || '';
                const r = await fetch(`${API_BASE}/api/scan-images`, { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' }, 
                    body: JSON.stringify({ url: url.trim() }) 
                });
                const d = await r.json();
                if (!r.ok) throw new Error(d.error || 'Autoscan failed');
                if (d.images) d.images = d.images.slice(0, 100); // cap to 100
                setDashScanResults(d);
            } catch(e) {
                setDashScanError(e.message);
            }
            setIsDashScanning(false);
        }, 800); // 800ms debounce
        return () => clearTimeout(timer);
    }, [url]);

    const fetchHistory = async (isRetry = false) => {
        if (!isRetry) {
            setIsHistoryLoading(true);
            setHistoryError(null);
        }
        
        // Ping the server first to wake it up (fire-and-forget, no await)
        fetch(`${API_BASE_URL}/api/health`).catch(() => {});
        
        // Give the server up to 45s — enough to cover a full Render cold-start
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 45000);
        
        try {
            const res = await fetch(`${API_BASE_URL}/api/history`, {
                headers: { 'x-api-key': import.meta.env.VITE_ADMIN_API_KEY || import.meta.env.VITE_GEMINI_API_KEY || '' },
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (!res.ok) throw new Error(`Server returned ${res.status}`);
            const data = await res.json();
            setHistoryData(data || []);
            setHistoryError(null);
            setIsHistoryLoading(false); // ✅ Always clear spinner on success
        } catch (e) {
            clearTimeout(timeoutId);
            console.error('Failed to fetch history', e);
            if (!isRetry) {
                // First failure — server was likely cold-starting. Auto-retry once after 5s.
                console.log('[History] Retrying after cold-start delay...');
                setTimeout(() => fetchHistory(true), 5000);
                // Keep spinner showing while retrying — do NOT clear yet
            } else {
                // Second failure — show an actionable error, NOT "No history"
                setHistoryError('Could not reach the server. It may still be waking up — wait 30 seconds and try again.');
                setIsHistoryLoading(false); // ✅ Clear spinner on final failure
            }
        }
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
        // Persist custom palette overrides so they survive page refresh
        try { localStorage.setItem('dna_palettes', JSON.stringify(customPalettes)); } catch {}
    }, [customPalettes]);

    useEffect(() => {
        // Dynamic Theming: Update CSS root variables based on user overrides only (automatic extraction disabled)
        const accentColor = customPalettes['Button Accent'] || '#f99d32';
        
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

    const isValidDomain = (str) => {
        if (!str) return true;
        let testStr = str;
        if (!testStr.startsWith('http')) testStr = 'https://' + testStr;
        try {
            const u = new URL(testStr);
            if (!u.hostname.includes('.') || u.hostname.includes('www.www.')) return false;
            return true;
        } catch(e) { return false; }
    };

    const handleExtract = async () => {
        if (!url && !profileUrl && !youtubeUrl) return;

        // Immediate validation sequence
        let validationFailed = false;
        if (!isValidDomain(url)) { 
            setUrlError(true); validationFailed = true; 
        } else setUrlError(false);
        
        if (profileUrl) {
            const lcProfile = profileUrl.toLowerCase();
            if (!isValidDomain(lcProfile) || (!lcProfile.includes('linktr.ee') && !lcProfile.includes('beacon.ai') && !lcProfile.includes('bio.site') && !lcProfile.includes('bento.me') && !lcProfile.includes('lnk.bio'))) {
                setProfileError(true); validationFailed = true; 
            } else setProfileError(false);
        } else setProfileError(false);

        if (youtubeUrl) {
            const lcYoutube = youtubeUrl.toLowerCase();
            if (!lcYoutube.includes('youtu.be') && !lcYoutube.includes('youtube.com')) { 
                setYoutubeError(true); validationFailed = true; 
            } else setYoutubeError(false);
        } else setYoutubeError(false);

        if (validationFailed) {
            setError('⚠️ One or more URLs are invalid. Please check for typing mistakes (e.g. www.www.domain.com) and ensure the URL starts with http:// or https://.');
            return;
        }

        setLoading(true);
        setError(null);
        setResult(null);

        // AbortController: stores ref so cancel button can abort early
        const controller = new AbortController();
        abortControllerRef.current = controller;
        const timeoutId = setTimeout(() => controller.abort('timeout'), 300000); // 5-minute hard timeout

        const targetLabel = url || youtubeUrl || profileUrl;
        let lastKnownStage = 'init';
        let lastKnownSteps = [];
        let statusInterval;

        try {
            statusInterval = setInterval(async () => {
                try {
                    const stRes = await fetch(`${API_BASE_URL}/api/status?url=${encodeURIComponent(targetLabel)}`);
                    const stData = await stRes.json();
                    if (stData.stage) lastKnownStage = stData.stage;
                    if (Array.isArray(stData.steps)) lastKnownSteps = stData.steps;
                } catch(e) {}
            }, 3000);

            const response = await fetch(`${API_BASE_URL}/api/extract`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, youtubeUrl, profileUrl, selectedImages: dashSelectedImages }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            abortControllerRef.current = null;

            const rawText = await response.text();
            let data;
            try {
                data = JSON.parse(rawText);
            } catch (err) {
                if (response.status >= 500) {
                    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
                    const contextMsg = isLocalhost
                        ? `💥 Local backend crashed (HTTP ${response.status}). Check your terminal for the Node.js stack trace.\n\nRaw output: ${rawText.substring(0, 300)}`
                        : `💥 Server Error (HTTP ${response.status}): The backend may be restarting on Render — wait about 30 seconds and try again.\n\nRaw: ${rawText.substring(0, 80)}`;
                    throw new Error(contextMsg);
                }
                throw new Error(`❌ Invalid response (HTTP ${response.status}): Backend returned non-JSON.\n\n${rawText.substring(0, 150)}`);
            }

            if (response.status === 429) {
                // Rate limit — surface the server message verbatim as it is already friendly
                throw new Error(`🚦 Rate Limited: ${data.error || 'Too many requests. Please wait 1 minute before trying again.'}`);
            }

            if (!response.ok) {
                // Build a multi-line diagnostic from the structured server error
                const parts = [];
                const rawMsg = (data.error || 'Extraction failed').replace(/^Extraction Failed:\s*/i, '');
                
                const stepList = data.steps || lastKnownSteps || [];
                if (stepList.length > 0) {
                    parts.push('--- DIAGNOSTIC CHECKLIST ---');
                    parts.push(stepList.map(s => `✅ ${s}`).join('\n'));
                }
                
                parts.push(`❌ FAILED AT: ${data.stage || lastKnownStage || 'Unknown'} (Elapsed: ${data.elapsed || 0}s)\n`);
                parts.push(`Message: ${rawMsg}`);
                if (data.hint) parts.push(`\n💡 Hint: ${data.hint}`);
                
                throw new Error(parts.join('\n'));
            }

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

            // Auto-select featured 640×640 images only (min 2 pairs = 4 images: cleanA, taggedA, cleanB, taggedB).
            // Logo is NOT included here — it lives in campaign.image / brand.logo fields separately.
            // featuredImages ordering: [cleanA, taggedA, cleanB, taggedB, ...]
            const featured = data.featuredImages || [];
            const autoImages = featured
                .filter(Boolean)
                .filter((v, i, a) => a.indexOf(v) === i) // dedupe
                .slice(0, 4); // hard cap at 4 (2 pairs)
            setSelectedImages(autoImages);

            // Store timing data for Settings > Logs
            if (data.stageTimings) setStageTimings(data.stageTimings);
            if (data.totalMs) setTotalMs(data.totalMs);
            // Store the input URLs for the Settings log
            setLastExtractionUrls({ website: url, youtube: youtubeUrl, profile: profileUrl });

            // Warn (non-blocking) if YouTube was skipped
            if (data.youtubeWarning) {
                showToast(`⚠️ ${data.youtubeWarning}`, 'warning', 7000);
            }


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
                target_url: url,
                youtube_url: youtubeUrl,
                profile_url: profileUrl,
                timestamp: new Date().toISOString(),
                success: true,
                payload: data
            }, ...prev]);

            showToast(`✅ Extraction complete for ${new URL(targetLabel.startsWith('http') ? targetLabel : 'https://' + targetLabel).hostname}`, 'success');
            setActiveTab('Dashboard');

        } catch (err) {
            clearTimeout(timeoutId);
            clearInterval(statusInterval);
            abortControllerRef.current = null;

            if (err.name === 'AbortError' || err.message === 'timeout') {
                // Check if it was a user-initiated cancel vs auto-timeout
                if (err.message === 'timeout') {
                    let parts = ['⏱️ Extraction timed out after 5 minutes. The target website may be heavily protected or very slow.'];
                    if (lastKnownSteps.length > 0) {
                         parts.push('\n--- STAGES COMPLETED BEFORE TIMEOUT ---');
                         parts.push(lastKnownSteps.map(s => `✅ ${s}`).join('\n'));
                    }
                    parts.push(`\n❌ HUNG AT: ${lastKnownStage}\n\n💡 Try a simpler page URL, or check if the site is accessible in your browser.`);
                    setError(parts.join('\n'));
                } else {
                    // User hit Cancel button — clear error, just stop loading
                    setError(null);
                }
            } else if (err.message === 'Failed to fetch' || err.message?.includes('NetworkError') || err.message?.includes('net::') || err.message?.includes('ERR_CONNECTION')) {
                // Browser-level network failure — server never responded at all
                const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
                if (isLocalhost) {
                    setError(
                        '🔌 Cannot reach local backend (http://localhost:3001)\n\n' +
                        'The Node.js server is not running or crashed.\n\n' +
                        '💡 Fix: Open a terminal in the project folder and run:\n' +
                        '   npm run dev\n\n' +
                        'Then visit http://localhost:3001/api/health to confirm it is up.'
                    );
                } else {
                    setError(
                        '🔌 Cannot reach the extraction server\n\n' +
                        'The backend on Render.com is asleep and needs ~30 seconds to wake up.' +
                        ' This is normal after periods of inactivity.\n\n' +
                        '💡 What to do:\n' +
                        '  1. Wait 30 seconds, then click Extract Info again\n' +
                        '  2. If it still fails after 2 minutes, open the health link below to force a wake-up\n' +
                        '  3. Once the health page loads, come back here and try again'
                    );
                }
            } else {
                // Server responded with an error message — show full detail
                console.error("Extraction caught error:", err);
                const msg = err.message || (typeof err === 'string' ? err : JSON.stringify(err)) || 'Unknown Error';
                
                // If the error message does not already contain a checklist, append the polled stage
                let finalMsg = msg.replace('Error: ', '');
                if (!finalMsg.includes('DIAGNOSTIC CHECKLIST') && lastKnownSteps.length > 0) {
                     finalMsg = `--- TRUNCATED DIAGNOSTIC CHECKLIST ---\n${lastKnownSteps.map(s => `✅ ${s}`).join('\n')}\n❌ FAILED AT: ${lastKnownStage}\n\n` + finalMsg;
                }
                
                setError(`🚨 Extraction Terminated\n\n${finalMsg}`);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteDomain = async (domain) => {
        if (!window.confirm(`Are you sure you want to delete ALL extractions for ${domain}?`)) return;
        try {
            await fetch(`${API_BASE_URL}/api/history`, {
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
            await fetch(`${API_BASE_URL}/api/history`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ timestamp })
            });
            setHistoryData(prev => prev.filter(item => item.timestamp !== timestamp));
        } catch (error) {
            console.error('Failed to delete extraction history', error);
        }
    };

    // Helper: download any image — base64 data URIs, /outputs/ paths, or remote URLs
    const handleForceDownload = async (e, url, title) => {
        e.preventDefault();
        if (!url) return;

        try {
            // Case 1: Base64 data URI — decode in-browser, never touch the server
            if (url.startsWith('data:')) {
                const [header, b64] = url.split(',');
                const mime = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
                const ext  = mime.split('/')[1]?.replace('jpeg','jpg') || 'jpg';
                const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
                const blob  = new Blob([bytes], { type: mime });
                const link  = document.createElement('a');
                link.href   = URL.createObjectURL(blob);
                link.download = title.includes('.') ? title : `${title}.${ext}`;
                document.body.appendChild(link);
                link.click();
                link.remove();
                URL.revokeObjectURL(link.href);
                return;
            }

            // Case 2: Real remote URL or /outputs/ path — fetch as blob then save
            const fetchUrl = url.startsWith('http')
                ? `${API_BASE_URL}/api/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(title)}`
                : url; // relative /outputs/... path served directly
            const resp = await fetch(fetchUrl);
            if (!resp.ok) throw new Error(`Server returned ${resp.status}`);
            const blob = await resp.blob();
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = title;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(link.href);
        } catch (err) {
            console.error('Download failed:', err);
            showToast(`\u26a0\ufe0f Download failed: ${err.message}. Check console for details.`, 'warning', 6000);
        }
    };


    const getFinalPayloadStr = () => {
        if (!result) return "";

        // Strip Wayback Machine archive wrapper from scraped URLs
        const cleanUrl = (urlStr = '') => {
            const wayback = urlStr.match(/^https?:\/\/web\.archive\.org\/web\/\d+\*?\/(https?.+)$/i);
            return wayback ? wayback[1] : urlStr;
        };

        // Shorten a full page title to just the brand name (strip " | tagline", " - subtitle" etc.)
        const shortBrandName = (title = '') => {
            // Split on common separators and return the first meaningful segment
            const parts = title.split(/\s*[\|—–\-]\s*/);
            return (parts[0] || title).trim();
        };

        const rawName = result.data?.name || result.name || "Target Campaign";
        const baseName = shortBrandName(rawName);
        const descText = summaryText[selectedSummaryType] || '';
        const htmlDesc = descText ? `<p>${descText.replace(/\n/g, '<br>')}</p>` : '';
        
        const bgColor    = customPalettes['Background Color']   || result.data?.background_color         || '#FFFFFF';
        const fgColor    = customPalettes['Foreground Color']   || result.data?.foreground_color          || '#000000';
        const appBarBg   = customPalettes['App Bar Background'] || result.data?.background_app_bar_color  || '#000000';
        const appBarFg   = customPalettes['App Bar Text']       || result.data?.foreground_app_bar_color  || '#FFFFFF';
        const accentColor= customPalettes['Button Accent']      || result.data?.icon_background_color_left|| '#f99d32';

        const btnBg    = selectedButtonStyle?.backgroundColorHex || selectedButtonStyle?.backgroundColor || accentColor;
        const btnFg    = selectedButtonStyle?.colorHex           || selectedButtonStyle?.color           || '#FFFFFF';
        const btnShape = selectedButtonStyle?.shape              || 'Rounded';

        // Map CSS textAlign string → Minfo integer enum
        // 1 = Center (default), 2 = Left, 3 = Right
        const cssToAlignEnum = (cssVal = '') => {
            const v = cssVal.toLowerCase().trim();
            if (v === 'left' || v === 'start')  return 2;
            if (v === 'right' || v === 'end')   return 3;
            return 1; // center / anything else defaults to center
        };
        const btnTextAlignEnum = cssToAlignEnum(selectedButtonStyle?.textAlign);

        const inferButtonType = (urlStr) => {
            if (!urlStr) return 4;
            const str = urlStr.toLowerCase();
            if (str.startsWith('tel:')) return 2;
            if (str.startsWith('sms:'))  return 3;
            if (/facebook\.com\/sharer|twitter\.com\/intent|linkedin\.com\/sharing|t\.co\/share/i.test(str)) return 5;
            return 4; // 4 = URL type per Minfo schema
        };

        // Map buttonType to propertyDefinitionId per Minfo schema
        const inferPropertyDefId = (btnType) => {
            if (btnType === 2) return 21; // Phone
            if (btnType === 3) return 22; // SMS
            if (btnType === 5) return 23; // Share
            return 20; // 20 = URL (default)
        };

        // Map buttonType to propertyName per Minfo schema
        const inferPropertyName = (btnType) => {
            if (btnType === 2) return "Phone";
            if (btnType === 3) return "SMS";
            if (btnType === 5) return "Share";
            return "URL";
        };

        const campaignItemButtons = selectedCtas.map((cta, idx) => {
            let ctaUrl = "";
            let ctaName = "";
            if (typeof cta === 'object' && cta.url) {
                ctaUrl  = cleanUrl(cta.url);
                ctaName = ctaEdits[cta.url] !== undefined ? ctaEdits[cta.url] : cta.button_name;
            } else {
                ctaUrl  = cleanUrl(cta);
                ctaName = ctaEdits[cta] !== undefined ? ctaEdits[cta] : cta;
            }
            const btnType = inferButtonType(ctaUrl);

            // Per Minfo schema: shape/buttonAlign/textAlign are integers (1=default/center)
            return {
                name: ctaName,
                buttonType: btnType,
                modelorder: idx + 1,
                backgroundColor: btnBg,
                foregroundColor: btnFg,
                properties: [{
                    propertyDefinitionId: inferPropertyDefId(btnType),
                    propertyValue: ctaUrl,
                    propertyName: inferPropertyName(btnType)
                }],
                shape: 1,       // integer enum: 1 = default rounded
                buttonAlign: 1, // integer enum: 1 = center
                textAlign: btnTextAlignEnum, // mapped from extracted CSS textAlign value
                enabled: true
            };
        });

        // Infer the Minfo buttonCategoryId from social platform name
        const inferSocialCategoryId = (hostname = '') => {
            const h = hostname.toLowerCase();
            if (h.includes('facebook'))  return 1;
            if (h.includes('twitter') || h.includes('x.com')) return 2;
            if (h.includes('instagram')) return 3;
            if (h.includes('youtube'))   return 4;
            if (h.includes('linkedin'))  return 5;
            if (h.includes('tiktok'))    return 6;
            if (h.includes('pinterest')) return 7;
            return 8; // generic/other
        };

        // Derive a real favicon URL using Google's favicon service
        const faviconUrl = (link) => {
            try {
                const origin = new URL(link).origin;
                return `https://www.google.com/s2/favicons?domain=${origin}&sz=64`;
            } catch { return ""; }
        };

        const medialinks = (result.socialMediaLinks || []).map((link, idx) => {
            const realLink = cleanUrl(link);
            let name = "Social";
            let hostname = "";
            try {
                hostname = new URL(realLink).hostname;
                const base = hostname.replace(/^www\./, '').split('.')[0];
                name = base.charAt(0).toUpperCase() + base.slice(1);
            } catch(e) {}
            return {
                name: name,
                icon: faviconUrl(realLink),
                link_url: realLink,
                buttonCategoryId: inferSocialCategoryId(hostname),
                modelorder: idx + 1
            };
        });

        const processImage = (imgSrc) => imgSrc || "";

        // Logo is always the extracted/uploaded brand logo (from result.data.image)
        const logoImg = processImage(result.data?.image || result.mappedData?.image || "");

        // Warn if any image is a localhost URL (won't import into Minfo from external)
        const allImages = [logoImg, ...selectedImages].filter(Boolean);
        const hasLocalhost = allImages.some(u => u.includes('localhost'));
        if (hasLocalhost) console.warn('[DNA] ⚠️ Some image URLs use localhost — these will not be accessible by Minfo. Re-run extraction on the deployed Render server to get public Supabase URLs.');

        // Map selectedImages to Minfo productImages format.
        // Filter out base64 blobs AND localhost URLs — neither is publicly accessible by Minfo.
        const isPublicUrl = (u) => u && !u.startsWith('data:') && !u.includes('localhost') && !u.includes('127.0.0.1');
        const productImages = selectedImages
            .filter(isPublicUrl)
            .map((url, idx) => ({ image_url: url, modelorder: idx + 1 }));

        // Also guard the logo — if it's a localhost/base64 fallback, clear it to avoid a broken import
        const safeLogoImg = isPublicUrl(logoImg) ? logoImg : "";

        return JSON.stringify({
            campaign: {
                name: baseName,
                campaignDescription: htmlDesc,
                backgroundColor: bgColor,
                foregroundColor: fgColor,
                appbarBackgroundColor: appBarBg,
                appbarForegroundColor: appBarFg,
                backgroundImage: "",  // per Minfo schema: empty unless explicitly set
                image: safeLogoImg,        // campaign-level logo for display
                campaignType: 1,      // always 1 per Minfo import schema
                scanType: 0,
                displayInSearch: true,
                is_enable: true,
                is_elevator: false,
                startTimeUtc: new Date().toISOString(),
                endTimeUtc: new Date(Date.now() + 31536000000).toISOString(),
                brand: {
                    name: baseName,
                    logo: safeLogoImg,
                    website: cleanUrl(url || result.data?.website || "https://example.com")
                }
            },
            productGroups: [
                {
                    name: baseName,
                    modelorder: 1,
                    products: [
                        {
                            item_name: baseName,
                            description: descText,   // plain text, no HTML
                            modelorder: 1,
                            calories: 0,
                            ingredients: "",
                            item_type: "Product",
                            deliverable: false,
                            productImages: productImages,  // user-selected featured images
                            campaignItemButtons: campaignItemButtons,
                            medialinks: []
                        }
                    ]
                }
            ],
            medialinks: medialinks,
        }, null, 2);
    };

    const handleDownloadJson = () => {
        const payloadStr = getFinalPayloadStr();
        const payloadObj = JSON.parse(payloadStr);

        let safeName = "Target";
        const nameStr = payloadObj.campaign?.name || payloadObj.name || "";
        if (nameStr) {
            safeName = nameStr.replace(/[^a-zA-Z0-9_\-\ ]/g, '').trim().substring(0, 40).replace(/ /g, '_');
        }

        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(payloadStr);
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `Final_Campaign_${safeName}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    };

    const exportToExcel = () => {
        if (!result) return;
        const wb = XLSX.utils.book_new();

        // ── helpers ──────────────────────────────────────────────────────────

        const formatSheet = (ws, data, colOverrides = {}) => {
            if (!ws['!ref']) return;
            const range = XLSX.utils.decode_range(ws['!ref']);

            // Auto-fit columns with per-column minimum overrides
            const colWidths = [];
            for (let C = range.s.c; C <= range.e.c; C++) {
                let maxW = colOverrides[C] ?? 12;
                for (let R = range.s.r; R <= range.e.r; R++) {
                    const ref = XLSX.utils.encode_cell({ r: R, c: C });
                    const cell = ws[ref];
                    if (cell && cell.v !== undefined) maxW = Math.max(maxW, String(cell.v).length);
                }
                colWidths.push({ wch: Math.min(maxW + 2, 80) });
            }
            ws['!cols'] = colWidths;

            // Freeze header row
            ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };

            // Style cells: wrap + top-align; bold header row
            for (let R = range.s.r; R <= range.e.r; R++) {
                const isHeader = R === range.s.r;
                for (let C = range.s.c; C <= range.e.c; C++) {
                    const ref = XLSX.utils.encode_cell({ r: R, c: C });
                    if (!ws[ref]) ws[ref] = { v: '', t: 's' };
                    ws[ref].s = {
                        alignment: { wrapText: true, vertical: 'top' },
                        font: isHeader ? { bold: true, sz: 11 } : { sz: 11 },
                    };
                }
            }
        };

        // Infer a human-readable button type label from the URL scheme (Excel display only).
        // Renamed from inferButtonType to avoid confusion with the integer-returning version
        // used in getFinalPayloadStr above. Also uses stricter share URL matching.
        const getButtonTypeLabel = (urlStr = '') => {
            const s = urlStr.toLowerCase();
            if (s.startsWith('tel:')) return 'Phone';
            if (s.startsWith('sms:')) return 'SMS';
            if (/facebook\.com\/sharer|twitter\.com\/intent|linkedin\.com\/sharing|t\.co\/share/i.test(s)) return 'Share';
            return 'URL';
        };

        // Extract platform display name from a social URL
        const parsePlatform = (link = '') => {
            try {
                const hostname = new URL(link).hostname.replace(/^www\./, '');
                const name = hostname.split('.')[0];
                return name.charAt(0).toUpperCase() + name.slice(1);
            } catch { return 'Social'; }
        };

        // Return only the first font in a CSS font-family stack
        const shortFont = (fontStack = '') => {
            const first = fontStack.split(',')[0].trim().replace(/['"]/g, '');
            return first || fontStack;
        };

        // ── Safe filename ─────────────────────────────────────────────────────
        let safeName = 'Target';
        const brandName = result.data?.name || result.name || '';
        if (brandName) {
            safeName = brandName.replace(/[^a-zA-Z0-9_\-\ ]/g, '').trim().substring(0, 40).replace(/ /g, '_');
        }

        // ── Sheet 1: Descriptions ─────────────────────────────────────────────
        const targetUrl = url || result.data?.website || '';
        const ytUrl = youtubeUrl || result.youtubeData?.channelUrl || '';

        const metaData = [
            ['Label',               'Content'],
            ['Brand Name',          brandName],
            ['Website URL',         targetUrl],
            ['YouTube URL',         ytUrl],
            ['Website Summary',     summaryText.website || ''],
            ['YouTube Summary',     summaryText.youtube || ''],
            ['Combined Summary',    summaryText.combined || ''],
            ['YouTube Description', summaryText.raw_youtube || ''],
        ];
        const wsMeta = XLSX.utils.aoa_to_sheet(metaData);
        formatSheet(wsMeta, metaData, { 0: 22, 1: 60 });
        XLSX.utils.book_append_sheet(wb, wsMeta, 'Descriptions');

        // ── Sheet 2: CTAs ─────────────────────────────────────────────────────
        const ctaData = [['Source', 'Button Name', 'Button Type', 'URL', 'Context']];
        (result.ctas || []).forEach(cta => {
            if (typeof cta === 'object' && cta.url) {
                const label = ctaEdits[cta.url] !== undefined ? ctaEdits[cta.url] : cta.button_name;
                ctaData.push(['Website', label, getButtonTypeLabel(cta.url), cta.url, cta.context || '']);
            } else {
                const label = ctaEdits[cta] !== undefined ? ctaEdits[cta] : cta;
                ctaData.push(['Website', label, 'URL', cta || '', '']);
            }
        });
        (result.data?.youtube_ctas || []).forEach(cta => {
            const label = ctaEdits[cta.url] !== undefined ? ctaEdits[cta.url] : cta.button_name;
            ctaData.push(['YouTube', label, getButtonTypeLabel(cta.url), cta.url || '', cta.context || '']);
        });
        const wsCtas = XLSX.utils.aoa_to_sheet(ctaData);
        formatSheet(wsCtas, ctaData, { 1: 24, 3: 50, 4: 30 });
        XLSX.utils.book_append_sheet(wb, wsCtas, 'CTAs');

        // ── Sheet 3: Social Links ─────────────────────────────────────────────
        const socialData = [['Platform', 'URL']];
        (result.socialMediaLinks || []).forEach(link => {
            socialData.push([parsePlatform(link), link]);
        });
        const wsSocial = XLSX.utils.aoa_to_sheet(socialData);
        formatSheet(wsSocial, socialData, { 0: 16, 1: 50 });
        XLSX.utils.book_append_sheet(wb, wsSocial, 'Social Links');

        // ── Sheet 4: Palette ──────────────────────────────────────────────────
        const bg   = customPalettes['Background Color']   || result.data?.background_color          || '';
        const fg   = customPalettes['Foreground Color']   || result.data?.foreground_color           || '';
        const abBg = customPalettes['App Bar Background'] || result.data?.background_app_bar_color   || '';
        const abFg = customPalettes['App Bar Text']       || result.data?.foreground_app_bar_color   || '';
        const acc  = customPalettes['Button Accent']      || result.data?.icon_background_color_left || '';

        const paletteData = [
            ['Label',              'Hex Value', 'Role / Purpose'],
            ['Background Color',   bg,   'Main page / screen background'],
            ['Foreground Color',   fg,   'Primary text and icon color'],
            ['App Bar Background', abBg, 'Top navigation bar fill'],
            ['App Bar Text',       abFg, 'Icons and text on the app bar'],
            ['Button Accent',      acc,  'Primary CTA button fill color'],
        ];
        const wsColors = XLSX.utils.aoa_to_sheet(paletteData);
        formatSheet(wsColors, paletteData, { 0: 22, 1: 14, 2: 38 });
        XLSX.utils.book_append_sheet(wb, wsColors, 'Palette');

        // ── Sheet 5: Button Styles ────────────────────────────────────────────
        const btnData = [['Shape', 'Border Radius', 'Background Color', 'Text Color', 'Border Color', 'Font (Primary)', 'Padding']];
        (result.buttonStyles || result.data?.buttonStyles || []).forEach(btn => {
            btnData.push([
                btn.shape        || '',
                btn.borderRadius || '',
                btn.backgroundColorHex || btn.backgroundColor || '',
                btn.colorHex     || btn.color || '',
                btn.borderColor  || btn.borderColorHex || 'transparent',
                shortFont(btn.fontFamily || ''),
                btn.padding      || '',
            ]);
        });
        const wsBtn = XLSX.utils.aoa_to_sheet(btnData);
        formatSheet(wsBtn, btnData, { 0: 12, 5: 24 });
        XLSX.utils.book_append_sheet(wb, wsBtn, 'Button Styles');

        // ── Sheet 6: Images ───────────────────────────────────────────────────
        const processImg = (imgSrc) => imgSrc || "";
        const logoImg = processImg(result.data?.image || result.mappedData?.image || "");
        
        // Filter exactly like JSON payload does
        const isPublicUrl = (u) => u && !u.startsWith('data:') && !u.includes('localhost') && !u.includes('127.0.0.1');
        const productImages = selectedImages.filter(isPublicUrl);
        const safeLogoImg = isPublicUrl(logoImg) ? logoImg : "";

        const imgData = [['Image Type', 'URL']];
        if (safeLogoImg) imgData.push(['Brand Logo', safeLogoImg]);
        productImages.forEach((imgUrl, idx) => {
            imgData.push(['Featured Image ' + (idx + 1), imgUrl]);
        });

        const wsImages = XLSX.utils.aoa_to_sheet(imgData);
        formatSheet(wsImages, imgData, { 0: 20, 1: 80 });
        XLSX.utils.book_append_sheet(wb, wsImages, 'Images');

        XLSX.writeFile(wb, `WebsiteDNA_${safeName}.xlsx`);
    };

    return (
        <div className="layout-wrapper">
            {/* Global toast notification */}
            {toast && (
                <div style={{
                    position: 'fixed', top: '1.5rem', right: '1.5rem', zIndex: 9999,
                    background: toast.type === 'success' ? 'rgba(76,175,80,0.95)' : toast.type === 'warning' ? 'rgba(255,152,0,0.95)' : 'rgba(33,150,243,0.95)',
                    color: '#fff', padding: '0.85rem 1.4rem', borderRadius: '10px',
                    fontWeight: '600', fontSize: '0.95rem', maxWidth: '380px',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                    backdropFilter: 'blur(12px)',
                    animation: 'slideInRight 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                    display: 'flex', alignItems: 'center', gap: '0.6rem'
                }}>
                    <span>{toast.message}</span>
                    <button onClick={() => setToast(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', cursor: 'pointer', fontSize: '1.1rem', padding: 0, marginLeft: 'auto', lineHeight: 1 }}>✕</button>
                </div>
            )}
            <aside className="sidebar">
                <div className="brand-logo">
                    <span>🧬</span> DNA Extractor
                </div>
                <nav className="nav-menu">
                    <div className={`nav-item ${activeTab === 'Dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('Dashboard')}>Dashboard</div>
                    <div className={`nav-item ${activeTab === 'History' ? 'active' : ''}`} onClick={() => setActiveTab('History')}>History</div>
                    <div className={`nav-item ${activeTab === 'Scanner' ? 'active' : ''}`} onClick={() => setActiveTab('Scanner')}>🔍 Scanner</div>
                    <div className={`nav-item ${activeTab === 'Settings' ? 'active' : ''}`} onClick={() => setActiveTab('Settings')}>Settings</div>
                </nav>
                <div style={{ marginTop: 'auto', paddingBottom: '1rem', fontSize: '0.8rem', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.5px' }}>
                    v1.3.1
                </div>
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
                                        <div style={{ position: 'relative', flex: 1, height: '100%' }}>
                                            <div style={{ position: 'absolute', left: '1.2rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', display: 'flex', pointerEvents: 'none', zIndex: 1 }}>
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                                            </div>
                                            <input
                                                type="url"
                                                className="url-input"
                                                placeholder="Website URL (e.g. https://example.com)"
                                                style={{ width: '100%', height: '100%', padding: '0 1.2rem 0 3.2rem', background: 'rgba(0,0,0,0.4)', border: `1px solid ${urlError ? '#ff4444' : 'var(--border-color)'}`, borderRadius: 'var(--radius-sm)' }}
                                                value={url}
                                                onChange={(e) => setUrl(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && handleExtract()}
                                                disabled={loading}
                                            />
                                        </div>
                                        {url && (
                                            <button 
                                                onClick={(e) => { e.preventDefault(); navigator.clipboard.writeText(url).then(() => showToast('✓ URL copied!', 'info', 2000)); }}
                                                style={{ width: '54px', height: '54px', background: 'transparent', color: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: 'var(--radius-sm)', padding: 0, cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', transition: 'all 0.2s', flexShrink: 0 }}
                                                onMouseEnter={(e)=>e.currentTarget.style.background='rgba(249, 157, 50, 0.1)'}
                                                onMouseLeave={(e)=>e.currentTarget.style.background='transparent'}
                                                title="Copy URL"
                                            >
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                            </button>
                                        )}
                                        <button 
                                            onClick={async () => { try { const text = await navigator.clipboard.readText(); setUrl(text); showToast('Pasted!', 'info', 1500); } catch (e) { showToast('⚠️ Clipboard access denied — use Ctrl+V directly in the input field.', 'warning', 4000); } }}
                                            style={{ width: '54px', height: '54px', background: 'transparent', color: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: 'var(--radius-sm)', padding: 0, cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', transition: 'all 0.2s', flexShrink: 0 }}
                                            onMouseEnter={(e)=>e.currentTarget.style.background='rgba(249, 157, 50, 0.1)'}
                                            onMouseLeave={(e)=>e.currentTarget.style.background='transparent'}
                                            title="Paste from Clipboard"
                                        >
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
                                        </button>
                                    </div>
                                    <div style={{ display: 'flex', gap: '1rem', height: '54px' }}>
                                        <div style={{ position: 'relative', flex: 1, height: '100%' }}>
                                            <div style={{ position: 'absolute', left: '1.2rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', display: 'flex', pointerEvents: 'none', zIndex: 1 }}>
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.541 12 3.541 12 3.541s-7.505 0-9.377.509A3.016 3.016 0 0 0 .501 6.186C0 8.07 0 12 0 12s0 3.93.501 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.377.505 9.377.505s7.505 0 9.377-.505a3.016 3.016 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" /></svg>
                                            </div>
                                            <input
                                                type="url"
                                                className="url-input"
                                                placeholder="YouTube Video URL (Optional)"
                                                style={{ width: '100%', height: '100%', padding: '0 1.2rem 0 3.2rem', background: 'rgba(0,0,0,0.4)', border: `1px solid ${youtubeError ? '#ff4444' : 'var(--border-color)'}`, borderRadius: 'var(--radius-sm)' }}
                                                value={youtubeUrl}
                                                onChange={(e) => setYoutubeUrl(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && handleExtract()}
                                                disabled={loading}
                                            />
                                        </div>
                                        {youtubeUrl && (
                                            <button 
                                                onClick={(e) => { e.preventDefault(); navigator.clipboard.writeText(youtubeUrl); }}
                                                style={{ width: '54px', height: '54px', background: 'transparent', color: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: 'var(--radius-sm)', padding: 0, cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', transition: 'all 0.2s', flexShrink: 0 }}
                                                onMouseEnter={(e)=>e.currentTarget.style.background='rgba(249, 157, 50, 0.1)'}
                                                onMouseLeave={(e)=>e.currentTarget.style.background='transparent'}
                                                onMouseDown={(e)=>{e.currentTarget.style.color='#4caf50'; e.currentTarget.style.borderColor='#4caf50';}}
                                                onMouseUp={(e)=>{const cur = e.currentTarget; setTimeout(() => {cur.style.color='var(--primary)'; cur.style.borderColor='var(--primary)';}, 1000);}}
                                                title="Copy to Clipboard"
                                            >
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                            </button>
                                        )}
                                        <button 
                                            onClick={async () => { try { const text = await navigator.clipboard.readText(); setYoutubeUrl(text); showToast('Pasted!', 'info', 1500); } catch (e) { showToast('⚠️ Clipboard access denied — use Ctrl+V directly in the input field.', 'warning', 4000); } }}
                                            style={{ width: '54px', height: '54px', background: 'transparent', color: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: 'var(--radius-sm)', padding: 0, cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', transition: 'all 0.2s', flexShrink: 0 }}
                                            onMouseEnter={(e)=>e.currentTarget.style.background='rgba(249, 157, 50, 0.1)'}
                                            onMouseLeave={(e)=>e.currentTarget.style.background='transparent'}
                                            title="Paste from Clipboard"
                                        >
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
                                        </button>
                                    </div>
                                    <div style={{ display: 'flex', gap: '1rem', height: '54px' }}>
                                        <div style={{ position: 'relative', flex: 1, height: '100%' }}>
                                            <div style={{ position: 'absolute', left: '1.2rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', display: 'flex', pointerEvents: 'none', zIndex: 1 }}>
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                                            </div>
                                            <input
                                                type="url"
                                                className="url-input"
                                                placeholder="Link-in-Bio / Profile Page URL (Optional)"
                                                style={{ width: '100%', height: '100%', padding: '0 1.2rem 0 3.2rem', background: 'rgba(0,0,0,0.4)', border: `1px solid ${profileError ? '#ff4444' : 'var(--border-color)'}`, borderRadius: 'var(--radius-sm)' }}
                                                value={profileUrl}
                                                onChange={(e) => setProfileUrl(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && handleExtract()}
                                                disabled={loading}
                                            />
                                        </div>
                                        {profileUrl && (
                                            <button 
                                                onClick={(e) => { e.preventDefault(); navigator.clipboard.writeText(profileUrl); }}
                                                style={{ width: '54px', height: '54px', background: 'transparent', color: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: 'var(--radius-sm)', padding: 0, cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', transition: 'all 0.2s', flexShrink: 0 }}
                                                onMouseEnter={(e)=>e.currentTarget.style.background='rgba(249, 157, 50, 0.1)'}
                                                onMouseLeave={(e)=>e.currentTarget.style.background='transparent'}
                                                onMouseDown={(e)=>{e.currentTarget.style.color='#4caf50'; e.currentTarget.style.borderColor='#4caf50';}}
                                                onMouseUp={(e)=>{const cur = e.currentTarget; setTimeout(() => {cur.style.color='var(--primary)'; cur.style.borderColor='var(--primary)';}, 1000);}}
                                                title="Copy to Clipboard"
                                            >
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                            </button>
                                        )}
                                        <button 
                                            onClick={async () => { try { const text = await navigator.clipboard.readText(); setProfileUrl(text); showToast('Pasted!', 'info', 1500); } catch (e) { showToast('⚠️ Clipboard access denied — use Ctrl+V directly in the input field.', 'warning', 4000); } }}
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
                                    {loading && (
                                        <button
                                            onClick={handleCancelExtract}
                                            title="Cancel extraction"
                                            style={{ width: '54px', height: '54px', background: 'transparent', color: '#ff6b6b', border: '1px solid #ff6b6b', borderRadius: '12px', padding: 0, cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', flexShrink: 0, transition: 'all 0.2s' }}
                                            onMouseEnter={(e) => e.currentTarget.style.background='rgba(255,107,107,0.12)'}
                                            onMouseLeave={(e) => e.currentTarget.style.background='transparent'}
                                        >
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                        </button>
                                    )}
                                </div>
                                </div>
                            </div>

                            {/* Dashboard Image Auto-Scanner */}
                            {dashScanResults && dashScanResults.images.length > 0 && (
                                <div style={{ marginTop: '1.5rem', marginBottom: '2.5rem', background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                        <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--primary)' }}>Select Base Images (Optional)</h3>
                                        <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)' }}>{dashScanResults.images.length} images found • Select preferred images to process for 1:1 640x640</span>
                                    </div>
                                    <div className="scanner-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '1rem', maxHeight: '400px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                                        {dashScanResults.images.map((img) => {
                                            const isSel = dashSelectedImages.includes(img.url);
                                            const dim = dashScanDims[img.url];
                                            const ext = (img.url.split('.').pop().split('?')[0] || '?').toUpperCase();
                                            return (
                                                <div key={img.url} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                    <div
                                                        onClick={() => setDashSelectedImages(prev => isSel ? prev.filter(s => s !== img.url) : [...prev, img.url])}
                                                        title={img.url}
                                                        style={{ position: 'relative', aspectRatio: '1', borderRadius: '8px', overflow: 'hidden', cursor: 'pointer', border: isSel ? '2px solid var(--primary)' : '2px solid rgba(255,255,255,0.07)', transition: 'all 0.15s', boxShadow: isSel ? '0 0 0 1px var(--primary), 0 4px 16px rgba(0,0,0,0.5)' : '0 2px 6px rgba(0,0,0,0.3)', transform: isSel ? 'scale(0.97)' : 'scale(1)', background: '#111' }}
                                                    >
                                                        <img
                                                            src={img.url}
                                                            alt=""
                                                            loading="lazy"
                                                            style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}
                                                            onLoad={e => { const el = e.target; setDashScanDims(prev => ({ ...prev, [img.url]: { w: el.naturalWidth, h: el.naturalHeight } })); }}
                                                            onError={e => { e.target.closest('div[style]').style.display = 'none'; }}
                                                        />
                                                        <div style={{ position:'absolute', inset:0, background: isSel ? 'rgba(249,157,50,0.15)' : 'transparent', transition:'background 0.15s', pointerEvents:'none' }} />
                                                        <div style={{ position:'absolute', top:'5px', left:'5px', width:'18px', height:'18px', borderRadius:'4px', background: isSel ? 'var(--primary)' : 'rgba(0,0,0,0.6)', border: isSel ? '2px solid var(--primary)' : '2px solid rgba(255,255,255,0.35)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'10px', fontWeight:'900', color:'#000', pointerEvents:'none' }}>
                                                            {isSel && '✓'}
                                                        </div>
                                                        {img.context === 'og' && <div style={{ position:'absolute', top:'5px', right:'5px', background:'rgba(74,222,128,0.8)', borderRadius:'3px', fontSize:'0.55rem', padding:'1px 3px', color:'#000', fontWeight:'700', pointerEvents:'none' }}>OG</div>}
                                                    </div>
                                                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.7rem', color:'rgba(255,255,255,0.6)', fontFamily:'monospace', padding: '0 2px' }}>
                                                        <span>{ext.length > 4 ? ext.substring(0,4) : ext}</span>
                                                        <span>{dim ? `${dim.w}×${dim.h}` : 'Loading...'}</span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                        <span style={{ fontSize: '0.85rem', color: dashSelectedImages.length > 0 ? 'var(--primary)' : 'rgba(255,255,255,0.4)', fontWeight: dashSelectedImages.length > 0 ? '600' : 'normal' }}>
                                            {dashSelectedImages.length > 0 ? `${dashSelectedImages.length} images selected for extraction editing.` : 'No images selected. Extraction will auto-select the best images.'}
                                        </span>
                                        {dashSelectedImages.length > 0 && <button onClick={() => setDashSelectedImages([])} style={{ background: 'none', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.7)', borderRadius: '4px', padding: '0.2rem 0.6rem', fontSize: '0.75rem', cursor: 'pointer' }}>Clear Selection</button>}
                                    </div>
                                </div>
                            )}
                            
                            {error && (() => {
                                const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
                                const healthUrl = isLocalhost
                                    ? 'http://localhost:3001/api/health'
                                    : 'https://website-dna-extractor-4.onrender.com/api/health';
                                const isNetworkError = error.includes('Cannot reach') || error.includes('Failed to fetch') || error.includes('NetworkError');
                                const isTimeout = error.includes('timed out') || error.includes('Timed Out') || error.includes('timed out after') || error.includes('Process timed out');
                                const errorTitle = isNetworkError ? 'Server Unreachable' : isTimeout ? 'Request Timed Out' : 'Extraction Failed';
                                const errorIcon = isNetworkError ? '🔌' : isTimeout ? '⏱️' : '⚠️';
                                return (
                                <div className="error-box" style={{ maxWidth: '850px', margin: '1rem auto 0 auto', textAlign: 'left', padding: '1.2rem 1.5rem', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: '0.6rem', border: `1px solid ${isNetworkError ? 'rgba(255,152,0,0.5)' : 'rgba(255,107,107,0.4)'}`, background: isNetworkError ? 'rgba(255,152,0,0.07)' : 'rgba(255,60,60,0.08)', backdropFilter: 'blur(8px)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontWeight: 'bold', fontSize: '1rem' }}>
                                        <span style={{ fontSize: '1.2rem' }}>{errorIcon}</span>
                                        <span style={{ color: isNetworkError ? '#ffb347' : '#ff8080' }}>{errorTitle}</span>
                                        <span style={{ marginLeft: 'auto', fontSize: '0.72rem', opacity: 0.55, fontWeight: 'normal' }}>{new Date().toLocaleTimeString()}</span>
                                    </div>
                                    <div style={{ fontSize: '0.88rem', whiteSpace: 'pre-wrap', lineHeight: '1.8', color: 'rgba(255,255,255,0.9)', fontFamily: "'DM Sans', sans-serif", background: 'rgba(0,0,0,0.25)', padding: '0.75rem 1rem', borderRadius: '6px' }}>
                                        {error}
                                    </div>
                                    <div style={{ marginTop: '0.2rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                        {(isNetworkError || isTimeout) && (
                                            <button
                                                onClick={() => { setError(null); handleExtract(); }}
                                                style={{ fontSize: '0.9rem', background: 'var(--primary)', color: '#000', border: 'none', borderRadius: '6px', padding: '0.4rem 1rem', cursor: 'pointer', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '0.4rem', transition: 'all 0.2s' }}
                                                onMouseEnter={(e) => e.currentTarget.style.opacity='0.85'}
                                                onMouseLeave={(e) => e.currentTarget.style.opacity='1'}
                                            >
                                                ↺ Try Again
                                            </button>
                                        )}
                                        <a href={healthUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.8rem', color: isNetworkError ? '#ffb347' : 'var(--primary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.3rem', fontWeight: '600' }}>
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                                            {isNetworkError ? 'Wake up server →' : 'Check backend health'}
                                        </a>
                                        <button onClick={() => setError(null)} style={{ fontSize: '0.8rem', background: 'none', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', color: '#aaa', cursor: 'pointer', padding: '0.25rem 0.6rem', transition: 'all 0.2s' }}
                                            onMouseEnter={(e) => e.currentTarget.style.color='white'}
                                            onMouseLeave={(e) => e.currentTarget.style.color='#aaa'}
                                        >
                                            ✕ Dismiss
                                        </button>
                                    </div>
                                </div>
                                );
                            })()}


                            {loading && (
                                <div className="loading-container" style={{ maxWidth: '850px', width: '100%', margin: '1rem auto 0 auto' }}>
                                    <div className="progress-bar-wrapper">
                                        <div className="progress-bar-fill"></div>
                                    </div>
                                    <div className="loading-status-text" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <span className="pulsing-dot"></span> {loadingText}
                                        </span>
                                        <span style={{
                                            fontVariantNumeric: 'tabular-nums',
                                            fontFamily: 'monospace',
                                            fontSize: '0.95rem',
                                            color: 'var(--primary)',
                                            fontWeight: '700',
                                            letterSpacing: '0.05em',
                                            flexShrink: 0,
                                            marginLeft: '1rem'
                                        }}>
                                            ⏱ {String(Math.floor(elapsedSeconds / 60)).padStart(2, '0')}:{String(elapsedSeconds % 60).padStart(2, '0')}
                                        </span>
                                    </div>
                                </div>
                            )}
                        {result && (
                            <div className="dashboard-grid" style={{ '--active-select': showJsonPreview ? '#4caf50' : 'var(--primary)' }}>

                                {/* Total extraction time badge */}
                                {totalMs && (
                                    <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: '1.5rem', padding: '0.6rem 1.2rem', background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 'var(--radius-sm)', fontSize: '0.9rem' }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#4ade80', fontWeight: '700', fontFamily: 'monospace', fontSize: '1rem' }}>
                                            ⏱ {(totalMs / 1000).toFixed(1)}s
                                        </span>
                                        <span style={{ color: 'rgba(255,255,255,0.5)' }}>Total extraction time</span>
                                        {result.youtubeWarning && (
                                            <span style={{ marginLeft: 'auto', color: '#fbbf24', fontSize: '0.8rem' }}>⚠️ YouTube skipped</span>
                                        )}
                                        <button onClick={() => setActiveTab('Settings')} style={{ marginLeft: result.youtubeWarning ? '0.5rem' : 'auto', background: 'none', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.5)', padding: '0.2rem 0.6rem', borderRadius: '20px', cursor: 'pointer', fontSize: '0.75rem' }}>
                                            View stage breakdown →
                                        </button>
                                    </div>
                                )}

                                {result.data?.isWaybackFallback && (
                                    <div style={{ gridColumn: '1 / -1', background: 'rgba(255, 165, 0, 0.1)', border: '1px solid orange', color: 'orange', padding: '0.5rem 1rem', borderRadius: 'var(--radius-sm)', textAlign: 'center', fontWeight: '500' }}>
                                        <strong>🏛️ Historical Archive Fallback:</strong> The live site actively blocked our agents, so this visual data and screenshot was safely extracted from the Wayback Machine. Date of capture may vary.
                                    </div>
                                )}

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

                                {/* 3. Hero Images Grid */}
                                {result.featuredImages?.length > 0 && (() => {
                                    // Deduplicate by URL on the frontend as a safety net
                                    const uniqueFeatured = [...new Map(result.featuredImages.map(s => [s, s])).values()];
                                    return (
                                    <div className="glass-panel">
                                        <h3 className="panel-title">📸 Generated 640×640 Image Variants</h3>
                                        <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>Each variant pair: <strong style={{color:'var(--primary)'}}>Clean</strong> (no text) + <strong style={{color:'var(--primary)'}}>Tagged</strong> (with AI tagline overlay). Tick to include in JSON export.</p>
                                        <div className="hero-images-grid">
                                            {uniqueFeatured.map((src, idx) => (
                                                <div key={src} className="hero-image-card" style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
                                                    <div style={{ position: 'absolute', top: '10px', left: '10px', zIndex: 10, background: 'rgba(0,0,0,0.7)', padding: '0.4rem 0.6rem', borderRadius: 'var(--radius-sm)', backdropFilter: 'blur(4px)' }}>
                                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', margin: 0, fontWeight: 'bold', color: selectedImages.includes(src) ? 'var(--active-select)' : 'var(--text-secondary)' }}>
                                                            <input 
                                                                type="checkbox" 
                                                                checked={selectedImages.includes(src)}
                                                                onChange={(e) => {
                                                                    if (e.target.checked) setSelectedImages(prev => prev.includes(src) ? prev : [...prev, src]);
                                                                    else setSelectedImages(prev => prev.filter(img => img !== src));
                                                                }}
                                                                style={{ width: '18px', height: '18px', accentColor: 'var(--active-select)', cursor: 'pointer' }}
                                                            />
                                                            Select
                                                        </label>
                                                    </div>
                                                    <div style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 10, background: 'rgba(0,0,0,0.6)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.7rem', color: '#aaa' }}>
                                                        {idx % 2 === 0 ? '🖼 Clean' : '✍️ Tagged'}
                                                    </div>
                                                    <img src={src} alt="Hero Feature" />
                                                    <a
                                                        href={src}
                                                        onClick={(e) => handleForceDownload(e, src, `variant_${idx % 2 === 0 ? 'clean' : 'tagged'}_${Math.floor(idx/2)+1}.jpg`)}
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
                                    );
                                })()}

                                {/* 3b. Imageye-style Image Picker — all images scraped from the page */}
                                {result.rawExtractedImages?.length > 0 && (() => {
                                    const rawImgs = [...new Set(result.rawExtractedImages.filter(s => s && s.startsWith('http')))];
                                    if (rawImgs.length === 0) return null;
                                    const pickerSelected = rawImgs.filter(s => selectedImages.includes(s));
                                    const selectAll = () => setSelectedImages(prev => [...new Set([...prev, ...rawImgs])]);
                                    const clearAll = () => setSelectedImages(prev => prev.filter(s => !rawImgs.includes(s)));
                                    return (
                                    <div className="glass-panel">
                                        {/* Header bar */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
                                                <span style={{ fontSize: '1.2rem' }}>🔍</span>
                                                <h3 className="panel-title" style={{ margin: 0 }}>Image Picker</h3>
                                                <span style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', padding: '0.1rem 0.6rem', borderRadius: '20px', fontSize: '0.8rem', fontWeight: '600' }}>
                                                    {rawImgs.length} images found
                                                </span>
                                                {pickerSelected.length > 0 && (
                                                    <span style={{ background: 'rgba(var(--primary-rgb),0.2)', color: 'var(--primary)', padding: '0.1rem 0.6rem', borderRadius: '20px', fontSize: '0.8rem', fontWeight: '700' }}>
                                                        {pickerSelected.length} selected
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                <button
                                                    onClick={selectAll}
                                                    style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.8)', padding: '0.3rem 0.8rem', borderRadius: '20px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600', transition: 'all 0.2s' }}
                                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                                                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                                                >
                                                    ☑ Select All
                                                </button>
                                                <button
                                                    onClick={clearAll}
                                                    style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.8)', padding: '0.3rem 0.8rem', borderRadius: '20px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600', transition: 'all 0.2s' }}
                                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                                                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                                                >
                                                    ✕ Clear
                                                </button>
                                            </div>
                                        </div>
                                        <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem', fontSize: '0.85rem' }}>
                                            All images scraped from the website via Puppeteer. Tick any image to include it in the JSON export as a product image.
                                        </p>
                                        {/* Image grid */}
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.6rem' }}>
                                            {rawImgs.map((src, idx) => {
                                                const isSelected = selectedImages.includes(src);
                                                return (
                                                    <div
                                                        key={src}
                                                        onClick={() => {
                                                            if (isSelected) setSelectedImages(prev => prev.filter(s => s !== src));
                                                            else setSelectedImages(prev => [...prev, src]);
                                                        }}
                                                        style={{
                                                            position: 'relative',
                                                            aspectRatio: '1',
                                                            borderRadius: '8px',
                                                            overflow: 'hidden',
                                                            cursor: 'pointer',
                                                            border: isSelected ? '2px solid var(--primary)' : '2px solid transparent',
                                                            transition: 'border 0.15s, transform 0.15s, box-shadow 0.15s',
                                                            boxShadow: isSelected ? '0 0 0 1px var(--primary), 0 4px 16px rgba(0,0,0,0.4)' : '0 2px 8px rgba(0,0,0,0.3)',
                                                            transform: isSelected ? 'scale(0.97)' : 'scale(1)',
                                                        }}
                                                    >
                                                        <img
                                                            src={src}
                                                            alt={`Site image ${idx + 1}`}
                                                            style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#1a1a2e', display: 'block' }}
                                                            onError={e => { e.currentTarget.closest('div[style]').style.display = 'none'; }}
                                                        />
                                                        {/* Selection overlay */}
                                                        <div style={{
                                                            position: 'absolute', inset: 0,
                                                            background: isSelected ? 'rgba(var(--primary-rgb, 249,157,50),0.18)' : 'transparent',
                                                            transition: 'background 0.15s'
                                                        }} />
                                                        {/* Checkbox tick */}
                                                        <div style={{
                                                            position: 'absolute', top: '6px', left: '6px',
                                                            width: '20px', height: '20px',
                                                            borderRadius: '4px',
                                                            background: isSelected ? 'var(--primary)' : 'rgba(0,0,0,0.55)',
                                                            border: isSelected ? '2px solid var(--primary)' : '2px solid rgba(255,255,255,0.4)',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            fontSize: '12px', transition: 'all 0.15s'
                                                        }}>
                                                            {isSelected && '✓'}
                                                        </div>
                                                        {/* Image number badge */}
                                                        <div style={{ position: 'absolute', bottom: '4px', right: '6px', fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>
                                                            #{idx + 1}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    );
                                })()}



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
                                                     <div className="css-prop" style={{ gridColumn: 'span 2' }}>
                                                        <div className="css-prop-label">Font Family</div>
                                                        <div className="css-prop-value">{btn.fontFamily || 'Inherit'}</div>
                                                    </div>
                                                    <div className="css-prop" style={{ gridColumn: 'span 1' }}>
                                                        <div className="css-prop-label">Padding</div>
                                                        <div className="css-prop-value">{btn.padding || '0px'}</div>
                                                    </div>
                                                    <div className="css-prop" style={{ gridColumn: 'span 1' }}>
                                                        <div className="css-prop-label">Text Align</div>
                                                        <div className="css-prop-value">{btn.textAlign || 'center'}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* 2. Social Media Presence */}
                                {result.socialMediaLinks?.length > 0 && (
                                    <div className="glass-panel" style={{ gridColumn: '1 / -1' }}>
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
                                                    TikTok: [],
                                                    Other: []
                                                };
                                                const icons = {
                                                    Facebook: <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z" /></svg>,
                                                    'Twitter/X': <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>,
                                                    Instagram: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>,
                                                    LinkedIn: <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" /></svg>,
                                                    YouTube: <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.541 12 3.541 12 3.541s-7.505 0-9.377.509A3.016 3.016 0 0 0 .501 6.186C0 8.07 0 12 0 12s0 3.93.501 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.377.505 9.377.505s7.505 0 9.377-.505a3.016 3.016 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" /></svg>,
                                                    TikTok: <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93v7.2c0 1.96-.52 3.94-1.61 5.54-1.12 1.64-2.84 2.8-4.82 3.09-1.92.29-3.95.03-5.69-.9-1.62-.87-2.91-2.28-3.56-4.01-.65-1.74-.6-3.72.13-5.39.75-1.72 2.21-3.08 3.94-3.71 1.68-.61 3.57-.6 5.17.15v4.14c-1.04-.3-2.16-.14-3.08.38-.93.53-1.58 1.48-1.71 2.56-.13 1.05.21 2.13.91 2.91.73.81 1.83 1.18 2.9 1.05 1.1-.13 2.08-.85 2.52-1.85.45-.98.47-2.13.43-3.21V.02z" /></svg>,
                                                    Other: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                                                };

                                                const uniqueLinksMap = new Map();

                                                result.socialMediaLinks.forEach(link => {
                                                    try {
                                                        const urlObj = new URL(link);
                                                        let hostname = urlObj.hostname.toLowerCase().replace(/^www\./, '');
                                                        let pathname = urlObj.pathname.toLowerCase().replace(/\/$/, '');
                                                        // Force Twitter to X for deduplication comparison
                                                        if (hostname === 'twitter.com') hostname = 'x.com';
                                                        
                                                        const normalizedKey = `${hostname}${pathname}`;
                                                        
                                                        if (!uniqueLinksMap.has(normalizedKey)) {
                                                            // For display, clean the URL but keep original case of the path, forcing https
                                                            let cleanDisplayUrl = `https://${urlObj.hostname.replace(/^www\./, '')}${urlObj.pathname.replace(/\/$/, '')}`;
                                                            uniqueLinksMap.set(normalizedKey, cleanDisplayUrl);
                                                        }
                                                    } catch (e) {
                                                        // Fallback safely if it's somehow completely unparseable
                                                        uniqueLinksMap.set(link.toLowerCase(), link);
                                                    }
                                                });
                                                
                                                Array.from(uniqueLinksMap.values()).forEach(link => {
                                                    const cleanLink = link.toLowerCase();
                                                    if (cleanLink.includes('facebook.com')) grouped.Facebook.push(link);
                                                    else if (cleanLink.includes('twitter.com') || cleanLink.includes('x.com')) grouped['Twitter/X'].push(link);
                                                    else if (cleanLink.includes('instagram.com')) grouped.Instagram.push(link);
                                                    else if (cleanLink.includes('linkedin.com')) grouped.LinkedIn.push(link);
                                                    else if (cleanLink.includes('youtube.com')) grouped.YouTube.push(link);
                                                    else if (cleanLink.includes('tiktok.com')) grouped.TikTok.push(link);
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

                                {/* 4b. Extracted CTAs (Website & YouTube) */}
                                {((result.ctas && result.ctas.length > 0) || (result.data?.youtube_ctas && result.data.youtube_ctas.length > 0)) && (
                                    <div className="glass-panel" style={{ gridColumn: '1 / -1' }}>
                                        <h3 className="panel-title">🗣️ Calls to Action (CTAs)</h3>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                            
                                            {/* Website CTAs */}
                                            {result.ctas && result.ctas.length > 0 && (
                                                <div>
                                                    <h4 style={{ color: 'var(--text-secondary)', marginBottom: '1rem', marginTop: 0 }}>From Website</h4>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                        {result.ctas.map((cta, idx) => {
                                                            const isComplexCta = typeof cta === 'object' && cta.url;
                                                            // For backwards compatibility with old history (strings) vs new extractions (objects)
                                                            const isSelected = isComplexCta ? selectedCtas.some(c => c.url === cta.url && c.context === cta.context) : selectedCtas.includes(cta);
                                                            const originalDisplay = isComplexCta ? cta.button_name : cta;
                                                            const ctaKey = isComplexCta ? cta.url : cta;
                                                            const displayValue = ctaEdits[ctaKey] !== undefined ? ctaEdits[ctaKey] : originalDisplay;
                                                            
                                                            if (isComplexCta) {
                                                                return (
                                                                <div key={`web_${idx}`} style={{ display: 'flex', alignItems: 'stretch', gap: '1.5rem', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: 'var(--radius-sm)', border: isSelected ? `1px solid var(--active-select)` : '1px solid transparent', transition: 'all 0.2s ease', minHeight: '80px' }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }} onClick={() => {
                                                                        if (isSelected) setSelectedCtas(selectedCtas.filter(c => !(c.url === cta.url && c.context === cta.context)));
                                                                        else setSelectedCtas([...selectedCtas, cta]);
                                                                    }}>
                                                                        <input 
                                                                            type="checkbox" 
                                                                            checked={isSelected}
                                                                            readOnly
                                                                            style={{ width: '20px', height: '20px', accentColor: 'var(--active-select)', cursor: 'pointer' }}
                                                                        />
                                                                    </div>
                                                                    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem', alignItems: 'center' }}>
                                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', borderRight: '1px dashed rgba(255, 255, 255, 0.1)', paddingRight: '1.5rem' }}>
                                                                            <label style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 'bold' }}>EDITABLE CTA NAME</label>
                                                                            <input 
                                                                                type="text"
                                                                                value={displayValue}
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
                                                                );
                                                            } else {
                                                                return (
                                                                <div key={`web_${idx}`} style={{ flexDirection: 'column', gap: '0.8rem', background: 'var(--surface-color)', padding: '0.8rem 1rem', borderRadius: 'var(--radius-sm)', border: isSelected ? '1px solid var(--active-select)' : '1px solid var(--border-color)', maxWidth: '300px', flex: '1 1 auto', display: 'inline-flex' }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', cursor: 'pointer' }}
                                                                        onClick={() => {
                                                                            if (isSelected) setSelectedCtas(selectedCtas.filter(c => c !== cta));
                                                                            else setSelectedCtas([...selectedCtas, cta]);
                                                                        }}>
                                                                        <input 
                                                                            type="checkbox" 
                                                                            checked={isSelected}
                                                                            readOnly
                                                                            style={{ width: '16px', height: '16px', accentColor: 'var(--active-select)', cursor: 'pointer' }}
                                                                        />
                                                                        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                                                                            <span style={{ fontWeight: '500', color: isSelected ? 'var(--active-select)' : 'var(--text-secondary)', fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Original Name:</span>
                                                                            <em style={{ fontWeight: '500', color: isSelected ? 'var(--active-select)' : 'var(--text-secondary)', fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', opacity: 0.8 }}>{cta}</em>
                                                                        </div>
                                                                        <svg onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(cta); }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{cursor: 'pointer', color: 'var(--text-secondary)'}} onMouseEnter={(e)=>e.currentTarget.style.color='var(--primary)'} onMouseLeave={(e)=>e.currentTarget.style.color='var(--text-secondary)'} title="Copy Original Text"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                                                    </div>
                                                                    {isSelected && (
                                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '0.5rem', marginTop: '0.2rem' }}>
                                                                            <label style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 'bold' }}>EDITABLE CTA NAME</label>
                                                                            <input 
                                                                                type="text"
                                                                                value={displayValue}
                                                                                onClick={(e) => e.stopPropagation()}
                                                                                onChange={(e) => setCtaEdits({ ...ctaEdits, [cta]: e.target.value })}
                                                                                style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', color: 'white', padding: '0.5rem 0.6rem', borderRadius: 'var(--radius-sm)', fontSize: '0.9rem' }}
                                                                            />
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                );
                                                            }
                                                        })}
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
                                    
                                    <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', alignItems: 'center' }}>
                                        <button 
                                            onClick={() => {
                                                setIsGeneratingJson(true);
                                                setTimeout(() => {
                                                    setIsGeneratingJson(false);
                                                    setShowJsonPreview(true);
                                                    // smooth scroll to json preview
                                                    setTimeout(() => {
                                                        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
                                                    }, 100);
                                                }, 1500);
                                            }}
                                            className="btn-extract" 
                                            style={{ padding: '0.8rem 1.5rem', fontSize: '1rem', flex: 1,  maxWidth: '220px', display: 'flex', justifyContent: 'center' }}
                                            disabled={isGeneratingJson}
                                        >
                                            {isGeneratingJson ? <div className="loader" style={{width: '20px', height: '20px'}}></div> : 'Export to JSON'}
                                        </button>
                                        <button 
                                            onClick={exportToExcel}
                                            className="btn-extract-custom" 
                                            style={{ padding: '0.8rem 1.5rem', fontSize: '1rem', flex: 1, maxWidth: '220px', display: 'flex', gap: '0.5rem', alignItems: 'center', justifyContent: 'center', background: '#217346', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', transition: 'all 0.2s ease' }}
                                            onMouseEnter={(e)=>{e.currentTarget.style.transform='scale(1.02)'; e.currentTarget.style.filter='brightness(1.1)';}}
                                            onMouseLeave={(e)=>{e.currentTarget.style.transform='scale(1)'; e.currentTarget.style.filter='brightness(1)';}}
                                        >
                                           <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>
                                           Export to CSV
                                        </button>

                                        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
                                            <button 
                                                title={!showJsonPreview ? "Export to JSON to access" : "Copy JSON to clipboard"}
                                                disabled={!showJsonPreview}
                                                onClick={(e) => { 
                                                    navigator.clipboard.writeText(getFinalPayloadStr()); 
                                                    e.currentTarget.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"></polyline></svg> Copied!'; 
                                                    e.currentTarget.style.background = '#4caf50'; 
                                                    e.currentTarget.style.color = 'white'; 
                                                    e.currentTarget.style.borderColor = '#4caf50';
                                                    setTimeout(() => { 
                                                        if (e.currentTarget) { 
                                                            e.currentTarget.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg> Copy JSON'; 
                                                            e.currentTarget.style.background = 'transparent'; 
                                                            e.currentTarget.style.color = 'var(--primary)'; 
                                                            e.currentTarget.style.borderColor = 'var(--primary)'; 
                                                        } 
                                                    }, 2000); 
                                                }}
                                                style={{ 
                                                    display: 'flex', alignItems: 'center', gap: '0.4rem', 
                                                    background: 'transparent', color: 'var(--primary)', 
                                                    border: '1px solid var(--primary)', borderRadius: 'var(--radius-sm)', 
                                                    padding: '0.4rem 0.8rem', fontSize: '0.9rem', transition: 'all 0.2s',
                                                    opacity: !showJsonPreview ? 0.3 : 1,
                                                    cursor: !showJsonPreview ? 'not-allowed' : 'pointer'
                                                }}
                                                onMouseEnter={(e)=>{if(showJsonPreview && e.currentTarget.style.background === 'transparent') e.currentTarget.style.background='rgba(249, 157, 50, 0.1)'}}
                                                onMouseLeave={(e)=>{if(showJsonPreview && e.currentTarget.style.background !== 'rgb(76, 175, 80)' && e.currentTarget.style.background !== '#4caf50') e.currentTarget.style.background='transparent'}}
                                            >
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                                Copy JSON
                                            </button>
                                            <button 
                                                title={!showJsonPreview ? "Export to JSON to access" : "Download JSON file"}
                                                disabled={!showJsonPreview}
                                                onClick={handleDownloadJson}
                                                style={{ 
                                                    display: 'flex', alignItems: 'center', gap: '0.4rem', 
                                                    background: 'var(--primary)', color: 'black', 
                                                    border: 'none', borderRadius: 'var(--radius-sm)', 
                                                    padding: '0.4rem 0.8rem', fontSize: '0.9rem', fontWeight: 'bold', transition: 'all 0.2s',
                                                    opacity: !showJsonPreview ? 0.3 : 1,
                                                    cursor: !showJsonPreview ? 'not-allowed' : 'pointer'
                                                }}
                                                onMouseEnter={(e)=>{if(showJsonPreview) e.currentTarget.style.transform='scale(1.05)'}}
                                                onMouseLeave={(e)=>{if(showJsonPreview) e.currentTarget.style.transform='scale(1)'}}
                                            >
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                                                Download JSON
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* 6. Campaign Configuration (JSON) */}
                                {showJsonPreview && (
                                    <div className="glass-panel" style={{ gridColumn: '1 / -1', animation: 'fadeIn 0.5s ease forwards' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                            <h3 className="panel-title" style={{ margin: 0 }}>⚙️ Final Campaign JSON</h3>
                                        </div>
                                        <div className="json-panel">
                                            <pre dangerouslySetInnerHTML={{
                                                __html: (() => {
                                                    let str = getFinalPayloadStr();
                                                    
                                                    // Ensure strict XSS protection before rendering HTML markup!
                                                    str = str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                                                    
                                                    return str.replace(/"(.*?)":/g, '<span class="json-key">"$1"</span>:')
                                                        .replace(/: "(.*?)"/g, ': <span class="json-string">"$1"</span>')
                                                        .replace(/: (true|false)/g, ': <span class="json-boolean">$1</span>')
                                                        .replace(/: ([0-9]+)/g, ': <span class="json-number">$1</span>');
                                                })()
                                            }}></pre>
                                        </div>

                                        {result.profilePayload && (
                                            <div style={{ marginTop: '3rem', paddingTop: '2rem', borderTop: '2px dashed var(--border-color)' }}>
                                                <h3 className="panel-title" style={{color: '#ff4b4b'}}>👤 Extracted Link-in-Bio Profile JSON</h3>
                                                <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>This separate configuration file maps identically to minfo properties strictly extrapolated from the Profile Page.</p>
                                                <div className="json-panel">
                                                    <pre dangerouslySetInnerHTML={{
                                                        __html: (() => {
                                                            let str = JSON.stringify({
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
                                                            }, null, 2);

                                                            // Ensure strict XSS protection before rendering HTML markup!
                                                            str = str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                                                            
                                                            return str.replace(/"(.*?)":/g, '<span class="json-key">"$1"</span>:')
                                                                .replace(/: "(.*?)"/g, ': <span class="json-string">"$1"</span>')
                                                                .replace(/: (true|false)/g, ': <span class="json-boolean">$1</span>')
                                                                .replace(/: ([0-9]+)/g, ': <span class="json-number">$1</span>');
                                                        })()
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
                                                                    const verified = entry.payload.data || {};
                                                                    setSummaryText({
                                                                        website: verified.website_summary || '',
                                                                        youtube: verified.youtube_summary || '',
                                                                        combined: verified.combined_summary || '',
                                                                        raw_youtube: entry.payload.youtubeData?.description || ''
                                                                    });
                                                                    setSelectedSummaryType('website');
                                                                    setSelectedCtas([
                                                                        ...(verified.youtube_ctas || []),
                                                                        ...(entry.payload.ctas || [])
                                                                    ]);
                                                                    setCtaEdits({});
                                                                    const heroes = entry.payload.featuredImages || [];
                                                                    if (heroes.length > 0) {
                                                                        setSelectedImages(heroes);
                                                                    } else if (verified.image || entry.payload.mappedData?.image) {
                                                                        setSelectedImages([verified.image || entry.payload.mappedData?.image].filter(Boolean));
                                                                    } else {
                                                                        setSelectedImages([]);
                                                                    }
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
                                                                    setUrl(entry.target_url || entry.url || '');
                                                                    setYoutubeUrl(entry.youtube_url || '');
                                                                    setProfileUrl(entry.profile_url || '');
                                                                    setResult(entry.payload);
                                                                    setShowJsonPreview(false);
                                                                    setActiveTab('Dashboard');
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
                )}

                {activeTab === 'Scanner' && (() => {
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
                        return d ? d.w >= scanMinWidth : true; // keep unresolved images until we know
                    };
                    const filtered = scanResults ? scanResults.images.filter(img => passesType(img.url) && passesSize(img.url)) : [];
                    const filterSelected = filtered.filter(img => scanSelected.includes(img.url));

                    const handleScan = async () => {
                        if (!scanUrl.trim()) return;
                        setIsScanning(true); setScanError(null); setScanResults(null); setScanSelected([]); setScanDims({});
                        try {
                            const r = await fetch(`${API_BASE}/api/scan-images`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: scanUrl.trim() }) });
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
                                            {/* Dimension badge moved below image */}
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
                })()}

                {activeTab === 'Settings' && (
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
                )}
            </main>
        </div>
    );
}

export default App;
