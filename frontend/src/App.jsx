import { Suspense, lazy, useEffect, useState } from 'react';
import MarketingSite from './MarketingSite.jsx';
import './site.css';

const ToolApp = lazy(() => import('./ToolApp.jsx'));

function normalizePath(pathname) {
    if (!pathname || pathname === '/') return '/';
    return pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
}

function isToolRoute(pathname) {
    return normalizePath(pathname) === '/app';
}

function LoadingShell() {
    return (
        <div className="site-shell">
            <div className="site-loading">
                <p className="eyebrow">Loading workspace</p>
                <h1>Preparing the extractor interface.</h1>
            </div>
        </div>
    );
}

function App() {
    const [pathname, setPathname] = useState(() => normalizePath(window.location.pathname));

    useEffect(() => {
        const handlePopState = () => setPathname(normalizePath(window.location.pathname));
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    useEffect(() => {
        document.body.classList.remove('site-theme', 'tool-theme');
        document.body.classList.add(isToolRoute(pathname) ? 'tool-theme' : 'site-theme');
    }, [pathname]);

    const navigate = (href) => {
        if (!href) return;

        if (/^(https?:|mailto:)/i.test(href)) {
            window.location.assign(href);
            return;
        }

        const nextPath = normalizePath(href);
        if (nextPath === pathname) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }

        window.history.pushState({}, '', nextPath);
        setPathname(nextPath);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    if (isToolRoute(pathname)) {
        return (
            <Suspense fallback={<LoadingShell />}>
                <ToolApp />
            </Suspense>
        );
    }

    return <MarketingSite pathname={pathname} navigate={navigate} />;
}

export default App;
