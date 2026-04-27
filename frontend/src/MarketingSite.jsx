import { useEffect, useMemo, useState } from 'react';

const SITE_NAME = 'Brand Content Studio';
const SITE_TAGLINE = 'Turn any website into a reusable brand system for campaigns, social assets, and launch-ready creative.';
const DEFAULT_DESCRIPTION = 'An editorial landing site for an AI brand-content tool that analyzes a website, builds a Business DNA profile, and explains how on-brand marketing assets are generated.';
const SOCIAL_IMAGE = '/social-card.svg';

const TOPIC_CARDS = [
    {
        title: 'What it is',
        description: 'Plain-language overview of the Business DNA workflow and what the product actually produces.',
        href: '/what-is-it',
        badge: 'Start here',
    },
    {
        title: 'How to use it',
        description: 'The 3-step flow: enter a URL, review the profile, generate campaign assets.',
        href: '/how-to-use',
        badge: 'Workflow',
    },
    {
        title: 'Troubleshooting',
        description: 'Answers for blocked access, weak scans, brand mismatches, and export issues.',
        href: '/troubleshooting',
        badge: 'Support',
    },
    {
        title: 'Regions & access',
        description: 'Availability notes, beta gating, and fallback paths when a region is unsupported.',
        href: '/regions',
        badge: 'Availability',
    },
    {
        title: 'Is it free?',
        description: 'Understand free exploration, gated launches, and when a signup step appears.',
        href: '/is-it-free',
        badge: 'Pricing',
    },
    {
        title: 'Compare options',
        description: 'See how website-based brand extraction differs from template-first design tools.',
        href: '/compare/design-suite',
        badge: 'Comparison',
    },
    {
        title: 'Feature updates',
        description: 'Track image generation, animation, product-photo workflows, and campaign upgrades.',
        href: '/roadmap',
        badge: 'What’s new',
    },
    {
        title: 'Guides & tutorials',
        description: 'Beginner walkthroughs, prompt recipes, editing tips, and export guidance.',
        href: '/guides',
        badge: 'Learn',
    },
];

const FEATURE_CARDS = [
    {
        title: 'Website-first brand extraction',
        summary: 'Start with a live URL and automatically surface palette, typography, imagery, logo cues, and tone.',
        accent: 'Brand capture',
    },
    {
        title: 'Editable Business DNA',
        summary: 'Review the extracted profile before generation so teams can refine positioning, color choices, and voice.',
        accent: 'Human review',
    },
    {
        title: 'Campaign-ready asset generation',
        summary: 'Use the profile to create multiple concepts for ads, social posts, email banners, and thumbnail variants.',
        accent: 'Multi-format',
    },
    {
        title: 'Natural-language refinement',
        summary: 'Adjust headlines, backgrounds, product emphasis, and pacing with short text instructions instead of manual design work.',
        accent: 'Prompt editing',
    },
    {
        title: 'Educational growth loop',
        summary: 'Support discovery with guides, comparisons, troubleshooting pages, and release notes that match search intent.',
        accent: 'SEO engine',
    },
];

const WORKFLOW_STEPS = [
    {
        step: '01',
        title: 'Enter a website URL',
        userAction: 'Paste the site you want to analyze.',
        systemAction: 'The platform crawls public pages, styling, images, and messaging cues.',
        outcome: 'A raw brand profile is created.',
    },
    {
        step: '02',
        title: 'Review the Business DNA',
        userAction: 'Check colors, fonts, imagery patterns, and descriptors.',
        systemAction: 'The profile is organized into editable brand traits and positioning notes.',
        outcome: 'You get a reusable brand system instead of a one-off scan.',
    },
    {
        step: '03',
        title: 'Generate branded campaigns',
        userAction: 'Choose a use case or write a custom prompt.',
        systemAction: 'The product produces multiple asset variants across formats and aspect ratios.',
        outcome: 'Downloadable creative that stays consistent with the source brand.',
    },
];

const GUIDE_ARTICLES = [
    {
        title: 'Beginner guide to website-based brand analysis',
        slug: 'beginner-guide',
        href: '/guides/beginner-guide',
        excerpt: 'Learn what gets extracted from a URL and how to review the output before generating assets.',
        readTime: '6 min read',
        category: 'Guide',
        body: [
            'Website-based brand analysis works best when the source site already reflects the business clearly. Start with a homepage or product page that shows the most complete version of the brand.',
            'After the scan, review colors, typography, sample imagery, business descriptors, and tone cues before moving into campaign generation. This review step is what keeps the workflow on-brand rather than purely automated.',
            'If a brand has seasonal landing pages or inconsistent subdomains, run the URL that best represents the intended campaign direction and adjust the extracted profile before generating deliverables.',
        ],
    },
    {
        title: 'Create your first campaign from a Business DNA profile',
        slug: 'first-campaign',
        href: '/guides/first-campaign',
        excerpt: 'Use the extracted profile to generate a first set of campaign ideas and asset variants.',
        readTime: '5 min read',
        category: 'Tutorial',
        body: [
            'Start with one clear campaign outcome, such as a seasonal promotion, product launch, or lead-generation ad. Keep the prompt anchored to that business goal.',
            'Generate several concepts rather than looking for a perfect first result. The workflow is strongest when teams compare directions, pick the most promising one, then refine copy, background treatment, or emphasis.',
            'For channel-specific exports, create a master idea first and then request variants for social posts, display placements, and email banners so the campaign remains visually unified.',
        ],
    },
    {
        title: 'Best prompts for refining generated creative',
        slug: 'best-prompts',
        href: '/guides/best-prompts',
        excerpt: 'Prompt patterns for cleaner headlines, stronger product focus, and more useful variants.',
        readTime: '4 min read',
        category: 'Prompting',
        body: [
            'Use direct editing instructions such as “increase headline contrast,” “use a lighter background,” or “make the product photo feel studio-lit.” Small concrete changes work better than vague requests for improvement.',
            'When a brand voice feels off, reference the Business DNA explicitly. Ask for copy that sounds more premium, more local, or more educational depending on the extracted tone.',
            'If you need usable exports across channels, mention the format in the prompt and request two or three alternative layouts so the system explores more than one visual hierarchy.',
        ],
    },
    {
        title: 'Exporting assets for different channels',
        slug: 'exporting-assets',
        href: '/guides/exporting-assets',
        excerpt: 'Map generated creative into common placements without losing brand consistency.',
        readTime: '5 min read',
        category: 'Distribution',
        body: [
            'Different channels reward different hierarchy. Social assets need immediate impact, while email banners often need clearer CTA and breathing room around copy.',
            'Use one campaign prompt to create several aspect ratios in the same visual family. That helps teams move faster while keeping the campaign recognizable across touchpoints.',
            'Before exporting, check that logos, product crops, and CTA language still fit the intended platform and audience context.',
        ],
    },
];

const FEATURE_PAGES = [
    {
        title: 'Image generation',
        href: '/features/image-generation',
        eyebrow: 'Capability',
        intro: 'Generate fresh visuals that inherit the Business DNA rather than defaulting to generic AI styling.',
        bullets: [
            'Create new supporting imagery that matches the extracted palette and visual mood.',
            'Use uploaded products or reference URLs to ground the results.',
            'Iterate with short refinement prompts for cleaner scenes and sharper messaging.',
        ],
    },
    {
        title: 'Animation and video variants',
        href: '/features/animation',
        eyebrow: 'Capability',
        intro: 'Extend static concepts into motion-friendly variants for ads, reels, and lightweight product storytelling.',
        bullets: [
            'Turn campaign directions into short-form animated variants.',
            'Keep text, color, and pacing aligned with the underlying brand profile.',
            'Prototype motion ideas without building a full editing workflow first.',
        ],
    },
    {
        title: 'Product-photo workflows',
        href: '/features/product-photos',
        eyebrow: 'Capability',
        intro: 'Create studio-style or contextual product scenes while keeping the brand world coherent.',
        bullets: [
            'Generate product imagery for launches, feature highlights, or seasonal campaigns.',
            'Adjust environment, crop, and styling through prompt-based edits.',
            'Use the same Business DNA profile to keep photography and ad creative aligned.',
        ],
    },
];

const ROADMAP_ITEMS = [
    {
        name: 'Campaign grounding',
        status: 'Rolling out',
        releaseDate: 'April 2026',
        shortDescription: 'Anchor campaigns with uploaded references, product URLs, and stronger scene context.',
    },
    {
        name: 'Image generation refresh',
        status: 'Recently updated',
        releaseDate: 'March 2026',
        shortDescription: 'Cleaner subject handling, stronger style fidelity, and better prompt responsiveness.',
    },
    {
        name: 'Animation variants',
        status: 'In preview',
        releaseDate: 'Q2 2026',
        shortDescription: 'Short-form motion outputs for social storytelling and paid creative testing.',
    },
    {
        name: 'Product-photo studio mode',
        status: 'Expanding',
        releaseDate: 'Q2 2026',
        shortDescription: 'Faster studio-style scenes and branded product backdrops from a single product reference.',
    },
];

const CASE_STUDIES = [
    {
        title: 'A local retailer turned its homepage into a seasonal campaign kit',
        result: 'Reduced time from brief to export by standardizing the Business DNA review step.',
        summary: 'The team used one storefront URL to establish color, tone, and product-photo direction before creating assets for social, display, and email placements.',
    },
    {
        title: 'A consultant packaged client brand systems into repeatable creative prompts',
        result: 'Created reusable prompt templates for multiple small-business clients.',
        summary: 'Instead of rebuilding positioning from scratch for each campaign, the consultant anchored prompts to each client’s extracted brand profile and saved iteration cycles.',
    },
    {
        title: 'A creator used product-photo generation to launch a new offer faster',
        result: 'Built launch visuals without scheduling a full custom shoot.',
        summary: 'The workflow combined brand extraction, headline refinement, and product-scene generation to produce a cohesive launch set.',
    },
];

const FAQ_ITEMS = [
    {
        id: 'what-is-business-dna',
        question: 'What is a Business DNA generator?',
        answer: 'It is an AI workflow that analyzes a public website, extracts brand traits such as color, typography, imagery, and tone, then uses that profile to generate marketing assets that stay visually and verbally aligned.',
        showOnHome: true,
    },
    {
        id: 'how-does-it-work',
        question: 'How does the workflow work?',
        answer: 'The experience is designed around three steps: enter a website URL, review the extracted brand profile, and generate campaign assets or prompts from that Business DNA.',
        showOnHome: true,
    },
    {
        id: 'is-it-free',
        question: 'Is the product free to use?',
        answer: 'This site can describe both free exploration and gated access. A common pattern is free educational content with launch access depending on region, beta status, or signup availability.',
        showOnHome: true,
    },
    {
        id: 'what-can-it-create',
        question: 'What kinds of assets can it create?',
        answer: 'Typical outputs include social posts, display ads, email banners, thumbnails, product visuals, campaign concepts, and increasingly motion-friendly or animated variants.',
        showOnHome: true,
    },
    {
        id: 'how-is-it-different',
        question: 'How is this different from template-based design tools?',
        answer: 'The main difference is that brand extraction starts from the website itself. Instead of choosing a template first, the workflow builds a usable brand profile and then generates content from that source material.',
        showOnHome: true,
    },
    {
        id: 'where-is-it-available',
        question: 'Where is it available?',
        answer: 'Availability can vary by rollout phase, language support, or geography. This site should make those limits explicit and provide fallback paths when access is restricted.',
        showOnHome: true,
    },
    {
        id: 'can-i-edit-results',
        question: 'Can I edit the generated results?',
        answer: 'Yes. The ideal workflow lets users refine copy, text size, background treatment, product emphasis, and other visual choices using short natural-language instructions.',
        showOnHome: false,
    },
    {
        id: 'does-it-support-new-capabilities',
        question: 'Does it support image, animation, and product-photo workflows?',
        answer: 'That is a key part of the roadmap. The site should highlight feature updates for image generation, animation variants, campaign grounding, and product-scene creation as they ship.',
        showOnHome: false,
    },
];

const NAV_ITEMS = [
    { label: 'What it is', href: '/what-is-it' },
    { label: 'How it works', href: '/how-to-use' },
    { label: 'Guides', href: '/guides' },
    { label: 'Comparisons', href: '/compare/design-suite' },
    { label: 'FAQ', href: '/faq' },
    { label: 'Community', href: '/community' },
];

const FOOTER_LINKS = [
    { label: 'Home', href: '/' },
    { label: 'What it is', href: '/what-is-it' },
    { label: 'How it works', href: '/how-to-use' },
    { label: 'Guides', href: '/guides' },
    { label: 'Roadmap', href: '/roadmap' },
    { label: 'Troubleshooting', href: '/troubleshooting' },
    { label: 'FAQ', href: '/faq' },
    { label: 'Launch app', href: '/app' },
];

function setMetaTag(attribute, key, content) {
    let tag = document.head.querySelector(`meta[${attribute}="${key}"]`);
    if (!tag) {
        tag = document.createElement('meta');
        tag.setAttribute(attribute, key);
        document.head.appendChild(tag);
    }
    tag.setAttribute('content', content);
}

function setLinkTag(rel, href) {
    let tag = document.head.querySelector(`link[rel="${rel}"]`);
    if (!tag) {
        tag = document.createElement('link');
        tag.setAttribute('rel', rel);
        document.head.appendChild(tag);
    }
    tag.setAttribute('href', href);
}

function slugify(value) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function trackEvent(eventName, payload = {}) {
    if (Array.isArray(window.dataLayer)) {
        window.dataLayer.push({ event: eventName, ...payload });
    }
    window.dispatchEvent(new CustomEvent('brand-content-analytics', { detail: { eventName, payload } }));
}

function useSeo({ title, description, pathname, schema }) {
    useEffect(() => {
        const fullTitle = title ? `${title} | ${SITE_NAME}` : SITE_NAME;
        const canonicalUrl = `${window.location.origin}${pathname}`;

        document.title = fullTitle;
        setMetaTag('name', 'description', description);
        setMetaTag('property', 'og:title', fullTitle);
        setMetaTag('property', 'og:description', description);
        setMetaTag('property', 'og:type', 'website');
        setMetaTag('property', 'og:url', canonicalUrl);
        setMetaTag('property', 'og:image', `${window.location.origin}${SOCIAL_IMAGE}`);
        setMetaTag('name', 'twitter:card', 'summary_large_image');
        setMetaTag('name', 'twitter:title', fullTitle);
        setMetaTag('name', 'twitter:description', description);
        setMetaTag('name', 'twitter:image', `${window.location.origin}${SOCIAL_IMAGE}`);
        setLinkTag('canonical', canonicalUrl);

        document.querySelectorAll('script[data-schema="brand-content"]').forEach((node) => node.remove());
        schema.forEach((entry) => {
            const script = document.createElement('script');
            script.type = 'application/ld+json';
            script.dataset.schema = 'brand-content';
            script.textContent = JSON.stringify(entry);
            document.head.appendChild(script);
        });

        return () => {
            document.querySelectorAll('script[data-schema="brand-content"]').forEach((node) => node.remove());
        };
    }, [description, pathname, schema, title]);
}

function useFaqHash(pathname, setOpenId) {
    useEffect(() => {
        const hash = window.location.hash.replace('#', '');
        if (pathname === '/faq' && hash) {
            setOpenId(hash);
            const element = document.getElementById(hash);
            if (element) {
                setTimeout(() => element.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
            }
        }
    }, [pathname, setOpenId]);
}

function buildBreadcrumbSchema(pathname, crumbs) {
    return {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: crumbs.map((crumb, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: crumb.label,
            item: `${window.location.origin}${crumb.href}`,
        })),
    };
}

function buildFaqSchema(items) {
    return {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: items.map((item) => ({
            '@type': 'Question',
            name: item.question,
            acceptedAnswer: {
                '@type': 'Answer',
                text: item.answer,
            },
        })),
    };
}

function buildArticleSchema(article, pathname) {
    return {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: article.title,
        description: article.excerpt,
        author: {
            '@type': 'Organization',
            name: SITE_NAME,
        },
        publisher: {
            '@type': 'Organization',
            name: SITE_NAME,
        },
        datePublished: '2026-04-27',
        mainEntityOfPage: `${window.location.origin}${pathname}`,
    };
}

function buildSharedSchemas() {
    return [
        {
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: SITE_NAME,
            url: window.location.origin,
            logo: `${window.location.origin}/favicon.svg`,
            description: DEFAULT_DESCRIPTION,
        },
        {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: SITE_NAME,
            url: window.location.origin,
            description: DEFAULT_DESCRIPTION,
        },
    ];
}

function LinkButton({ href, navigate, children, className = '', eventName, payload, secondary = false }) {
    return (
        <a
            className={`${secondary ? 'button secondary' : 'button'} ${className}`.trim()}
            href={href}
            onClick={(event) => {
                if (eventName) trackEvent(eventName, payload);
                if (/^(https?:|mailto:)/i.test(href)) return;
                event.preventDefault();
                navigate(href);
            }}
        >
            {children}
        </a>
    );
}

function NavLink({ href, label, navigate }) {
    return (
        <a
            href={href}
            onClick={(event) => {
                event.preventDefault();
                navigate(href);
            }}
        >
            {label}
        </a>
    );
}

function AnnouncementBar({ navigate }) {
    return (
        <div className="announcement-bar">
            <p>
                Beta update: roadmap pages now cover campaign grounding, animation variants, and product-scene generation.
            </p>
            <button type="button" onClick={() => navigate('/roadmap')}>
                View updates
            </button>
        </div>
    );
}

function SiteHeader({ navigate, pathname, theme, setTheme }) {
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    useEffect(() => {
        setIsMenuOpen(false);
    }, [pathname]);

    return (
        <header className="site-header">
            <div className="shell header-row">
                <button type="button" className="brand-mark" onClick={() => navigate('/')}>
                    <span>BC</span>
                    <div>
                        <strong>{SITE_NAME}</strong>
                        <small>Business DNA marketing system</small>
                    </div>
                </button>

                <nav className={`main-nav ${isMenuOpen ? 'open' : ''}`} aria-label="Primary">
                    {NAV_ITEMS.map((item) => (
                        <NavLink key={item.href} href={item.href} label={item.label} navigate={navigate} />
                    ))}
                </nav>

                <div className="header-actions">
                    <button
                        type="button"
                        className="theme-toggle"
                        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                        aria-label="Toggle color mode"
                    >
                        {theme === 'dark' ? 'Light mode' : 'Dark mode'}
                    </button>
                    <LinkButton href="/app" navigate={navigate} eventName="launch_app_clicked">
                        Launch app
                    </LinkButton>
                    <button
                        type="button"
                        className="menu-toggle"
                        onClick={() => setIsMenuOpen((open) => !open)}
                        aria-expanded={isMenuOpen}
                        aria-label="Open menu"
                    >
                        Menu
                    </button>
                </div>
            </div>
        </header>
    );
}

function HeroSection({ navigate }) {
    const [demoState, setDemoState] = useState(0);
    const demoStates = [
        'Analyzing palette and typography',
        'Drafting Business DNA profile',
        'Generating campaign variants',
    ];

    useEffect(() => {
        const timer = window.setInterval(() => {
            setDemoState((state) => (state + 1) % demoStates.length);
        }, 2200);
        return () => window.clearInterval(timer);
    }, [demoStates.length]);

    return (
        <section className="hero-section shell" data-section-id="hero">
            <div className="hero-copy">
                <p className="eyebrow">SEO-first product site</p>
                <h1>Generate on-brand marketing assets from a website URL.</h1>
                <p className="hero-summary">
                    Explain the value in seconds: analyze a site, build a Business DNA profile, and turn it into branded campaign creative across formats.
                </p>
                <div className="hero-actions">
                    <LinkButton
                        href="/app"
                        navigate={navigate}
                        eventName="cta_primary_clicked"
                        payload={{ placement: 'hero' }}
                    >
                        Launch app
                    </LinkButton>
                    <LinkButton
                        href="/guides/first-campaign"
                        navigate={navigate}
                        secondary
                        eventName="article_cta_clicked"
                        payload={{ placement: 'hero', article: 'first-campaign' }}
                    >
                        Read the guide
                    </LinkButton>
                    <LinkButton href="/community" navigate={navigate} secondary>
                        Join community
                    </LinkButton>
                </div>
                <div className="hero-metrics">
                    <div>
                        <strong>3-step flow</strong>
                        <span>URL, DNA review, asset generation</span>
                    </div>
                    <div>
                        <strong>Multi-format output</strong>
                        <span>Social, display, email, thumbnail, motion</span>
                    </div>
                    <div>
                        <strong>Search-intent content</strong>
                        <span>Guides, comparisons, troubleshooting, updates</span>
                    </div>
                </div>
            </div>

            <div className="hero-demo" aria-label="Business DNA preview">
                <div className="demo-input">
                    <label htmlFor="demo-url">Website URL</label>
                    <div className="demo-input-row">
                        <input id="demo-url" value="https://example-brand.com" readOnly />
                        <span>{demoStates[demoState]}</span>
                    </div>
                </div>
                <div className="demo-grid">
                    <article className="demo-card demo-profile">
                        <p>Business DNA</p>
                        <h3>Modern retail brand with warm neutrals and editorial photography.</h3>
                        <ul>
                            <li>Palette: sand, ink, cedar</li>
                            <li>Tone: clear, premium, practical</li>
                            <li>Fonts: serif display + clean sans</li>
                        </ul>
                    </article>
                    <article className="demo-card">
                        <p>Suggested outputs</p>
                        <div className="chip-row">
                            <span>Launch ad</span>
                            <span>Email banner</span>
                            <span>Social carousel</span>
                            <span>Product scene</span>
                        </div>
                    </article>
                    <article className="demo-card">
                        <p>Refinement prompts</p>
                        <div className="prompt-stack">
                            <span>Increase headline contrast</span>
                            <span>Use a lighter studio background</span>
                            <span>Create a square social variant</span>
                        </div>
                    </article>
                </div>
            </div>
        </section>
    );
}

function TopicGrid({ navigate }) {
    return (
        <section className="shell section-block" data-section-id="popular-topics">
            <div className="section-heading">
                <p className="eyebrow">Popular topics</p>
                <h2>Give informational visitors a fast path before they bounce.</h2>
                <p>
                    These cards surface the highest-intent questions early: what the tool is, how it works, what it costs, where it is available, and how it compares.
                </p>
            </div>
            <div className="topic-grid">
                {TOPIC_CARDS.map((card) => (
                    <a
                        key={card.href}
                        className="topic-card"
                        href={card.href}
                        onClick={(event) => {
                            event.preventDefault();
                            trackEvent('topic_card_clicked', { topic: card.title, href: card.href });
                            navigate(card.href);
                        }}
                    >
                        <span className="topic-badge">{card.badge}</span>
                        <h3>{card.title}</h3>
                        <p>{card.description}</p>
                    </a>
                ))}
            </div>
        </section>
    );
}

function FeatureSection({ navigate }) {
    return (
        <section className="shell section-block" data-section-id="value-proposition">
            <div className="section-heading">
                <p className="eyebrow">Value proposition</p>
                <h2>Position the product around brand consistency, speed, and clarity.</h2>
            </div>
            <div className="feature-grid">
                {FEATURE_CARDS.map((feature) => (
                    <article className="feature-card" key={feature.title}>
                        <p className="feature-accent">{feature.accent}</p>
                        <h3>{feature.title}</h3>
                        <p>{feature.summary}</p>
                    </article>
                ))}
            </div>
            <div className="inline-cta">
                <LinkButton href="/what-is-it" navigate={navigate} secondary>
                    See the Business DNA explainer
                </LinkButton>
                <LinkButton href="/app" navigate={navigate} eventName="cta_primary_clicked" payload={{ placement: 'after-features' }}>
                    Try the workflow
                </LinkButton>
            </div>
        </section>
    );
}

function WorkflowSection({ navigate, compact = false }) {
    return (
        <section className={`shell section-block ${compact ? 'compact-section' : ''}`} data-section-id="workflow">
            <div className="section-heading">
                <p className="eyebrow">How it works</p>
                <h2>Keep the story to three steps.</h2>
            </div>
            <div className="workflow-grid">
                {WORKFLOW_STEPS.map((step) => (
                    <article key={step.step} className="workflow-card">
                        <div className="workflow-step">{step.step}</div>
                        <h3>{step.title}</h3>
                        <dl>
                            <div>
                                <dt>User action</dt>
                                <dd>{step.userAction}</dd>
                            </div>
                            <div>
                                <dt>System action</dt>
                                <dd>{step.systemAction}</dd>
                            </div>
                            <div>
                                <dt>Outcome</dt>
                                <dd>{step.outcome}</dd>
                            </div>
                        </dl>
                    </article>
                ))}
            </div>
            {!compact && (
                <div className="editor-note">
                    <p>
                        Refinement matters after generation too. The product story should show that users can adjust text size, background treatment, product emphasis, and copy using short natural-language changes.
                    </p>
                    <LinkButton href="/how-to-use" navigate={navigate} secondary>
                        Read the full workflow page
                    </LinkButton>
                </div>
            )}
        </section>
    );
}

function ResourceSection({ navigate }) {
    return (
        <section className="shell section-block" data-section-id="resource-hub">
            <div className="section-heading">
                <p className="eyebrow">Resource hub</p>
                <h2>Turn education and comparison pages into your discovery engine.</h2>
            </div>
            <div className="resource-grid">
                {GUIDE_ARTICLES.map((article) => (
                    <article key={article.slug} className="resource-card">
                        <p className="resource-meta">
                            <span>{article.category}</span>
                            <span>{article.readTime}</span>
                        </p>
                        <h3>{article.title}</h3>
                        <p>{article.excerpt}</p>
                        <a
                            href={article.href}
                            onClick={(event) => {
                                event.preventDefault();
                                trackEvent('article_cta_clicked', { article: article.slug, placement: 'resource-grid' });
                                navigate(article.href);
                            }}
                        >
                            Read article
                        </a>
                    </article>
                ))}
            </div>
            <div className="teaser-grid">
                <article className="teaser-card">
                    <p className="eyebrow">Comparison</p>
                    <h3>Template-first tools vs. website-first brand extraction</h3>
                    <p>Explain the difference in setup speed, automation, editing flow, and output consistency.</p>
                    <LinkButton href="/compare/design-suite" navigate={navigate} secondary eventName="comparison_clicked">
                        View comparison
                    </LinkButton>
                </article>
                <article className="teaser-card">
                    <p className="eyebrow">What’s new</p>
                    <h3>Highlight feature launches without cluttering the homepage.</h3>
                    <p>Use release cards for image generation, product scenes, animation, and campaign grounding.</p>
                    <LinkButton href="/roadmap" navigate={navigate} secondary>
                        Browse updates
                    </LinkButton>
                </article>
            </div>
            <div className="inline-cta">
                <LinkButton href="/guides" navigate={navigate} secondary>
                    Explore all guides
                </LinkButton>
                <LinkButton href="/app" navigate={navigate} eventName="cta_primary_clicked" payload={{ placement: 'after-resources' }}>
                    Launch the app
                </LinkButton>
            </div>
        </section>
    );
}

function CapabilitySection({ navigate }) {
    return (
        <section className="shell section-block capability-layout" data-section-id="capabilities">
            <div className="section-heading">
                <p className="eyebrow">Expanding capabilities</p>
                <h2>Show the product growing beyond static ad generation.</h2>
            </div>
            <div className="capability-grid">
                {FEATURE_PAGES.map((feature) => (
                    <article className="capability-card" key={feature.href}>
                        <p className="feature-accent">{feature.eyebrow}</p>
                        <h3>{feature.title}</h3>
                        <p>{feature.intro}</p>
                        <ul>
                            {feature.bullets.map((bullet) => (
                                <li key={bullet}>{bullet}</li>
                            ))}
                        </ul>
                        <a
                            href={feature.href}
                            onClick={(event) => {
                                event.preventDefault();
                                navigate(feature.href);
                            }}
                        >
                            View feature page
                        </a>
                    </article>
                ))}
            </div>
        </section>
    );
}

function FaqSection({ navigate, homeOnly = false, pathname = '/faq' }) {
    const items = homeOnly ? FAQ_ITEMS.filter((item) => item.showOnHome) : FAQ_ITEMS;
    const [openId, setOpenId] = useState(items[0]?.id || '');

    useFaqHash(pathname, setOpenId);

    return (
        <section className="shell section-block" data-section-id="faq">
            <div className="section-heading">
                <p className="eyebrow">FAQ</p>
                <h2>Answer the objections that block conversion.</h2>
            </div>
            <div className="faq-list">
                {items.map((item) => (
                    <article key={item.id} className={`faq-item ${openId === item.id ? 'open' : ''}`} id={item.id}>
                        <button
                            type="button"
                            className="faq-trigger"
                            aria-expanded={openId === item.id}
                            aria-controls={`${item.id}-answer`}
                            onClick={() => {
                                const nextId = openId === item.id ? '' : item.id;
                                setOpenId(nextId);
                                if (nextId) {
                                    trackEvent('faq_opened', { questionId: item.id });
                                    if (!homeOnly) {
                                        window.history.replaceState({}, '', `${pathname}#${item.id}`);
                                    }
                                }
                            }}
                        >
                            <span>{item.question}</span>
                            <span>{openId === item.id ? '−' : '+'}</span>
                        </button>
                        <div id={`${item.id}-answer`} className="faq-answer">
                            <p>{item.answer}</p>
                        </div>
                    </article>
                ))}
            </div>
            {homeOnly && (
                <div className="inline-cta">
                    <LinkButton href="/faq" navigate={navigate} secondary>
                        Browse all FAQ topics
                    </LinkButton>
                </div>
            )}
        </section>
    );
}

function CtaBand({ navigate }) {
    return (
        <section className="shell section-block" data-section-id="final-cta">
            <div className="cta-band">
                <div>
                    <p className="eyebrow">Primary action</p>
                    <h2>Route visitors toward the app after they understand the workflow.</h2>
                    <p>
                        Keep the final call to action simple: launch the app, read a starter guide, or join the community if they need more context first.
                    </p>
                </div>
                <div className="cta-band-actions">
                    <LinkButton href="/app" navigate={navigate} eventName="launch_app_clicked">
                        Launch app
                    </LinkButton>
                    <LinkButton href="/guides/first-campaign" navigate={navigate} secondary>
                        Read guide
                    </LinkButton>
                    <LinkButton href="/community" navigate={navigate} secondary>
                        Join community
                    </LinkButton>
                </div>
            </div>
        </section>
    );
}

function Footer({ navigate }) {
    return (
        <footer className="site-footer">
            <div className="shell footer-grid">
                <div>
                    <p className="eyebrow">Brand Content Studio</p>
                    <p className="footer-summary">
                        A content-led front door for an AI marketing workflow built around website-based brand analysis and repeated CTA paths.
                    </p>
                </div>
                <div className="footer-links">
                    {FOOTER_LINKS.map((link) => (
                        <a
                            key={link.href}
                            href={link.href}
                            onClick={(event) => {
                                event.preventDefault();
                                navigate(link.href);
                            }}
                        >
                            {link.label}
                        </a>
                    ))}
                </div>
            </div>
        </footer>
    );
}

function Breadcrumbs({ crumbs, navigate }) {
    if (crumbs.length <= 1) return null;

    return (
        <nav className="breadcrumbs shell" aria-label="Breadcrumb">
            {crumbs.map((crumb, index) => (
                <span key={crumb.href}>
                    {index > 0 ? <span className="crumb-separator">/</span> : null}
                    {index === crumbs.length - 1 ? (
                        <strong>{crumb.label}</strong>
                    ) : (
                        <a
                            href={crumb.href}
                            onClick={(event) => {
                                event.preventDefault();
                                navigate(crumb.href);
                            }}
                        >
                            {crumb.label}
                        </a>
                    )}
                </span>
            ))}
        </nav>
    );
}

function PageHero({ eyebrow, title, summary, actions, meta }) {
    return (
        <section className="shell page-hero">
            <div className="page-hero-copy">
                {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
                <h1>{title}</h1>
                <p>{summary}</p>
                {actions ? <div className="hero-actions">{actions}</div> : null}
            </div>
            {meta ? <div className="page-hero-meta">{meta}</div> : null}
        </section>
    );
}

function ProseSection({ title, paragraphs, children }) {
    return (
        <section className="shell prose-section" data-section-id={slugify(title)}>
            <h2>{title}</h2>
            <div className="prose-block">
                {paragraphs?.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                ))}
                {children}
            </div>
        </section>
    );
}

function RelatedArticles({ navigate, currentHref }) {
    const related = GUIDE_ARTICLES.filter((article) => article.href !== currentHref).slice(0, 3);
    return (
        <section className="shell section-block">
            <div className="section-heading">
                <p className="eyebrow">Related articles</p>
                <h2>Keep the internal linking loop working.</h2>
            </div>
            <div className="resource-grid">
                {related.map((article) => (
                    <article key={article.slug} className="resource-card">
                        <p className="resource-meta">
                            <span>{article.category}</span>
                            <span>{article.readTime}</span>
                        </p>
                        <h3>{article.title}</h3>
                        <p>{article.excerpt}</p>
                        <a
                            href={article.href}
                            onClick={(event) => {
                                event.preventDefault();
                                navigate(article.href);
                            }}
                        >
                            Read article
                        </a>
                    </article>
                ))}
            </div>
        </section>
    );
}

function HomePage({ navigate }) {
    return (
        <>
            <HeroSection navigate={navigate} />
            <TopicGrid navigate={navigate} />
            <FeatureSection navigate={navigate} />
            <WorkflowSection navigate={navigate} />
            <ResourceSection navigate={navigate} />
            <CapabilitySection navigate={navigate} />
            <FaqSection navigate={navigate} homeOnly pathname="/" />
            <CtaBand navigate={navigate} />
        </>
    );
}

function WhatIsItPage({ navigate }) {
    return (
        <>
            <PageHero
                eyebrow="What it is"
                title="A website-first AI marketing workflow."
                summary="Describe the product as an AI assistant that scans a public website, extracts brand identity traits, and uses them to generate consistent marketing assets."
                actions={
                    <>
                        <LinkButton href="/app" navigate={navigate} eventName="cta_primary_clicked" payload={{ placement: 'what-is-it' }}>
                            Launch app
                        </LinkButton>
                        <LinkButton href="/how-to-use" navigate={navigate} secondary>
                            See the workflow
                        </LinkButton>
                    </>
                }
                meta={
                    <div className="page-stat-grid">
                        <div><strong>Inputs</strong><span>Website URL, prompts, references</span></div>
                        <div><strong>Extracted traits</strong><span>Colors, fonts, imagery, tone, logo cues</span></div>
                        <div><strong>Outputs</strong><span>Ads, social, banners, thumbnails, scenes</span></div>
                    </div>
                }
            />
            <ProseSection
                title="What gets extracted"
                paragraphs={[
                    'The Business DNA concept makes the scan legible. Rather than telling users that the system is doing generic analysis, explain that it is building an editable brand profile from visible website cues.',
                    'That profile should clearly show palette, typography, imagery, tone of voice, logo references, and business descriptors so people can understand why the generated results look the way they do.',
                ]}
            >
                <div className="signal-grid">
                    {['Color palette', 'Typography pairing', 'Imagery patterns', 'Tone of voice', 'Logo references', 'Business overview tags'].map((item) => (
                        <div key={item} className="signal-card">{item}</div>
                    ))}
                </div>
            </ProseSection>
            <ProseSection
                title="Why this positioning works"
                paragraphs={[
                    'The strongest positioning is not “AI that makes graphics.” It is “AI that understands the brand before it generates.” That is the distinction most comparison pages and high-intent search traffic will care about.',
                    'This also gives the site a clear educational structure: explain the scan, show the profile, then connect that profile to campaign creation.',
                ]}
            />
            <CtaBand navigate={navigate} />
        </>
    );
}

function HowItWorksPage({ navigate }) {
    return (
        <>
            <PageHero
                eyebrow="How it works"
                title="URL in, Business DNA out, campaigns next."
                summary="Keep the product story operational: users enter a site, review the extracted brand profile, then generate and refine campaign assets."
            />
            <WorkflowSection navigate={navigate} compact />
            <ProseSection
                title="Refinement loop"
                paragraphs={[
                    'The workflow does not end after the first generation pass. Show that users can adjust headlines, text size, product emphasis, background treatment, and layout feel with short natural-language instructions.',
                    'That refinement story is important because it reassures visitors that the system is not a black box. The scan is automatic, but the outcome is still steerable.',
                ]}
            >
                <div className="prompt-stack prompt-panel">
                    <span>Make the headline feel more premium</span>
                    <span>Use a softer background with higher text contrast</span>
                    <span>Create horizontal and square versions for paid social</span>
                </div>
            </ProseSection>
            <CapabilitySection navigate={navigate} />
            <CtaBand navigate={navigate} />
        </>
    );
}

function TroubleshootingPage({ navigate }) {
    const troubleshootingCards = [
        'Website blocked or partially accessible',
        'Brand profile pulled weak or inconsistent signals',
        'Images did not match the original brand look',
        'Generated copy felt generic or off-tone',
        'Unsupported browser or region limitations',
        'Need a fallback CTA when access is gated',
    ];

    return (
        <>
            <PageHero
                eyebrow="Troubleshooting"
                title="Answer the access and quality questions before support gets buried."
                summary="This content cluster should capture region issues, blocked scans, browser friction, and weak generation results while still routing users to a clear next step."
            />
            <ProseSection
                title="Priority troubleshooting topics"
                paragraphs={[
                    'Access and availability questions are some of the highest-intent support searches, so they deserve first-class pages rather than being buried inside a generic help center.',
                    'Each page should end with a practical next action: retry with a different source page, review the Business DNA profile, join the community, or use a fallback link while access is gated.',
                ]}
            >
                <div className="signal-grid">
                    {troubleshootingCards.map((item) => (
                        <div key={item} className="signal-card">{item}</div>
                    ))}
                </div>
            </ProseSection>
            <div className="shell info-banner">
                <p>Recommended fallback: if region access is limited, offer a guide-first path and a community route instead of a dead-end CTA.</p>
                <LinkButton href="/community" navigate={navigate} secondary>
                    Open community page
                </LinkButton>
            </div>
        </>
    );
}

function RegionsPage({ navigate }) {
    return (
        <>
            <PageHero
                eyebrow="Regions and availability"
                title="Make access status easy to understand."
                summary="Use this page for beta notes, supported regions, language limitations, and waitlist messaging so users can self-qualify without friction."
            />
            <div className="shell stat-band">
                <article><strong>Availability status</strong><p>Public, beta, waitlist, or invite-only.</p></article>
                <article><strong>Language support</strong><p>Call out any English-first or region-limited experiences.</p></article>
                <article><strong>Fallback action</strong><p>Offer guides or community if launch access is restricted.</p></article>
            </div>
            <CtaBand navigate={navigate} />
        </>
    );
}

function PricingPage({ navigate }) {
    return (
        <>
            <PageHero
                eyebrow="Pricing and free access"
                title="Explain free exploration without overpromising."
                summary="Visitors searching for cost want a clear answer. Use this page to separate educational content, beta access, and any gated launch flow."
            />
            <ProseSection
                title="What to clarify"
                paragraphs={[
                    'A good pricing page for this kind of product does not need complex plans to be useful. It needs to clarify whether visitors can try the workflow immediately, whether access is gated, and what the best fallback path is if launch access is not open yet.',
                    'It should also explain that the public website is an informational front door, while the asset-generation workflow may live behind a separate launch or signup step.',
                ]}
            />
            <div className="shell info-banner">
                <p>Suggested CTA pattern: Launch app, read the beginner guide, or join the community for access updates.</p>
                <LinkButton href="/app" navigate={navigate}>Launch app</LinkButton>
            </div>
        </>
    );
}

function ComparisonPage({ navigate }) {
    const rows = [
        ['Brand setup', 'Extracted from a live website', 'Usually manual brand kit or template selection'],
        ['Starting point', 'Business DNA profile', 'Canvas or preset layout'],
        ['Editing model', 'Prompt-based refinement plus profile review', 'Mostly manual layout changes'],
        ['Campaign output', 'Multi-variant concepts tied to brand signals', 'Depends on template reuse'],
        ['Best fit', 'Small teams who need faster brand-consistent marketing assets', 'Teams comfortable designing from a blank or templated canvas'],
    ];

    return (
        <>
            <PageHero
                eyebrow="Comparison"
                title="Website-first brand extraction versus template-first design."
                summary="Comparison pages should focus on setup friction, automation depth, editing flow, and how reliably each workflow stays on-brand."
            />
            <section className="shell comparison-table-wrap">
                <table className="comparison-table">
                    <thead>
                        <tr>
                            <th>Criteria</th>
                            <th>Brand Content Studio</th>
                            <th>Manual design suite</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => (
                            <tr key={row[0]}>
                                <td>{row[0]}</td>
                                <td>{row[1]}</td>
                                <td>{row[2]}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>
            <div className="shell info-banner">
                <p>The differentiator is not “more AI.” It is automatic brand extraction from the website before generation begins.</p>
                <LinkButton href="/what-is-it" navigate={navigate} secondary>
                    Review the explainer
                </LinkButton>
            </div>
        </>
    );
}

function RoadmapPage({ navigate }) {
    return (
        <>
            <PageHero
                eyebrow="Feature updates"
                title="Use release notes to keep the product story fresh."
                summary="This page should carry the newer capability narrative: image generation improvements, campaign grounding, animation, and product-scene workflows."
            />
            <section className="shell roadmap-grid">
                {ROADMAP_ITEMS.map((item) => (
                    <article key={item.name} className="roadmap-card">
                        <p className="resource-meta">
                            <span>{item.status}</span>
                            <span>{item.releaseDate}</span>
                        </p>
                        <h3>{item.name}</h3>
                        <p>{item.shortDescription}</p>
                    </article>
                ))}
            </section>
            <CtaBand navigate={navigate} />
        </>
    );
}

function GuidesIndexPage({ navigate }) {
    return (
        <>
            <PageHero
                eyebrow="Guides"
                title="Create the educational layer that search traffic expects."
                summary="Use tutorial templates for first campaigns, prompt patterns, editing tips, exporting, and troubleshooting."
            />
            <ResourceSection navigate={navigate} />
        </>
    );
}

function GuideArticlePage({ navigate, article }) {
    return (
        <>
            <PageHero
                eyebrow={article.category}
                title={article.title}
                summary={article.excerpt}
                meta={
                    <div className="page-stat-grid">
                        <div><strong>Read time</strong><span>{article.readTime}</span></div>
                        <div><strong>Published</strong><span>April 27, 2026</span></div>
                        <div><strong>Use case</strong><span>SEO education and CTA routing</span></div>
                    </div>
                }
            />
            <ProseSection title="Article" paragraphs={article.body} />
            <div className="shell info-banner">
                <p>Every guide should end with a product CTA, a comparison link, and another article to keep internal linking strong.</p>
                <LinkButton href="/app" navigate={navigate} eventName="article_cta_clicked" payload={{ article: article.slug, placement: 'guide-bottom' }}>
                    Launch app
                </LinkButton>
            </div>
            <RelatedArticles navigate={navigate} currentHref={article.href} />
        </>
    );
}

function FeaturePage({ navigate, feature }) {
    return (
        <>
            <PageHero
                eyebrow={feature.eyebrow}
                title={feature.title}
                summary={feature.intro}
            />
            <ProseSection
                title="What this page should communicate"
                paragraphs={[
                    'Capability pages help the site rank for specific feature searches while also expanding the main product story beyond the core URL-to-brand workflow.',
                    'Each page should explain what the capability does, when to use it, and how it stays anchored to the Business DNA profile instead of drifting into generic output.',
                ]}
            >
                <ul className="bullet-list">
                    {feature.bullets.map((bullet) => (
                        <li key={bullet}>{bullet}</li>
                    ))}
                </ul>
            </ProseSection>
            <CtaBand navigate={navigate} />
        </>
    );
}

function CaseStudiesPage() {
    return (
        <>
            <PageHero
                eyebrow="Case studies"
                title="Use examples to make the workflow feel concrete."
                summary="Even short case-study cards help visitors picture how a website scan turns into a repeatable content system."
            />
            <section className="shell roadmap-grid">
                {CASE_STUDIES.map((study) => (
                    <article className="roadmap-card" key={study.title}>
                        <h3>{study.title}</h3>
                        <p>{study.summary}</p>
                        <strong>{study.result}</strong>
                    </article>
                ))}
            </section>
        </>
    );
}

function CommunityPage({ navigate }) {
    return (
        <>
            <PageHero
                eyebrow="Community"
                title="Give visitors a lower-friction path when they are not ready to launch."
                summary="A community page supports beta updates, prompt sharing, troubleshooting, and product feedback without forcing every visitor into the same CTA."
            />
            <ProseSection
                title="What belongs here"
                paragraphs={[
                    'Use this page to explain what members get: access updates, campaign walkthroughs, prompt ideas, troubleshooting help, and early feature notes.',
                    'The community route is especially helpful when launch access depends on beta status or geography, because it replaces a dead end with a useful next step.',
                ]}
            />
            <div className="shell info-banner">
                <p>Suggested modules: discussion prompts, onboarding resources, office-hour notes, and launch announcements.</p>
                <LinkButton href="/guides" navigate={navigate} secondary>
                    Browse resources first
                </LinkButton>
            </div>
        </>
    );
}

function NotFoundPage({ navigate }) {
    return (
        <>
            <PageHero
                eyebrow="Not found"
                title="This page does not exist yet."
                summary="The route is missing, but the core product pages, guides, FAQ, roadmap, and app handoff are available."
                actions={<LinkButton href="/" navigate={navigate}>Go home</LinkButton>}
            />
        </>
    );
}

function buildPageModel(pathname) {
    if (pathname === '/') {
        return {
            title: 'AI brand-content site for website-based marketing generation',
            description: DEFAULT_DESCRIPTION,
            crumbs: [{ label: 'Home', href: '/' }],
            schema: [...buildSharedSchemas(), buildFaqSchema(FAQ_ITEMS.filter((item) => item.showOnHome))],
            render: (navigate) => <HomePage navigate={navigate} />,
        };
    }

    if (pathname === '/what-is-it') {
        const crumbs = [{ label: 'Home', href: '/' }, { label: 'What it is', href: pathname }];
        return {
            title: 'What an AI brand-content tool is',
            description: 'Understand how a website-based brand analysis workflow builds an editable Business DNA profile before generating marketing assets.',
            crumbs,
            schema: [...buildSharedSchemas(), buildBreadcrumbSchema(pathname, crumbs)],
            render: (navigate) => <WhatIsItPage navigate={navigate} />,
        };
    }

    if (pathname === '/how-to-use') {
        const crumbs = [{ label: 'Home', href: '/' }, { label: 'How it works', href: pathname }];
        return {
            title: 'How the Business DNA workflow works',
            description: 'Follow the 3-step path from website URL to brand profile to campaign generation and refinement.',
            crumbs,
            schema: [...buildSharedSchemas(), buildBreadcrumbSchema(pathname, crumbs)],
            render: (navigate) => <HowItWorksPage navigate={navigate} />,
        };
    }

    if (pathname === '/troubleshooting') {
        const crumbs = [{ label: 'Home', href: '/' }, { label: 'Troubleshooting', href: pathname }];
        return {
            title: 'Troubleshooting website-based brand analysis',
            description: 'Support content for access issues, weak scans, brand mismatch problems, and gated availability.',
            crumbs,
            schema: [...buildSharedSchemas(), buildBreadcrumbSchema(pathname, crumbs)],
            render: (navigate) => <TroubleshootingPage navigate={navigate} />,
        };
    }

    if (pathname === '/regions') {
        const crumbs = [{ label: 'Home', href: '/' }, { label: 'Regions', href: pathname }];
        return {
            title: 'Regions and availability',
            description: 'Clarify where the product is available, how beta access works, and what to do if a region is unsupported.',
            crumbs,
            schema: [...buildSharedSchemas(), buildBreadcrumbSchema(pathname, crumbs)],
            render: (navigate) => <RegionsPage navigate={navigate} />,
        };
    }

    if (pathname === '/is-it-free') {
        const crumbs = [{ label: 'Home', href: '/' }, { label: 'Is it free', href: pathname }];
        return {
            title: 'Pricing and free access',
            description: 'Explain launch access, free exploration, and fallback paths for a gated AI brand-content workflow.',
            crumbs,
            schema: [...buildSharedSchemas(), buildBreadcrumbSchema(pathname, crumbs)],
            render: (navigate) => <PricingPage navigate={navigate} />,
        };
    }

    if (pathname === '/compare/design-suite') {
        const crumbs = [
            { label: 'Home', href: '/' },
            { label: 'Comparisons', href: '/compare/design-suite' },
            { label: 'Design suite comparison', href: pathname },
        ];
        return {
            title: 'Website-first brand extraction vs design suites',
            description: 'Compare website-based brand extraction to manual design-suite workflows for setup, editing, and output consistency.',
            crumbs,
            schema: [...buildSharedSchemas(), buildBreadcrumbSchema(pathname, crumbs)],
            render: (navigate) => <ComparisonPage navigate={navigate} />,
        };
    }

    if (pathname === '/roadmap') {
        const crumbs = [{ label: 'Home', href: '/' }, { label: 'Feature updates', href: pathname }];
        return {
            title: 'Feature updates and roadmap',
            description: 'Track updates for image generation, animation variants, product-photo workflows, and campaign grounding.',
            crumbs,
            schema: [...buildSharedSchemas(), buildBreadcrumbSchema(pathname, crumbs)],
            render: (navigate) => <RoadmapPage navigate={navigate} />,
        };
    }

    if (pathname === '/guides') {
        const crumbs = [{ label: 'Home', href: '/' }, { label: 'Guides', href: pathname }];
        return {
            title: 'Guides and tutorials',
            description: 'Educational content for first campaigns, prompt tips, exporting, and troubleshooting a Business DNA workflow.',
            crumbs,
            schema: [...buildSharedSchemas(), buildBreadcrumbSchema(pathname, crumbs)],
            render: (navigate) => <GuidesIndexPage navigate={navigate} />,
        };
    }

    if (pathname === '/faq') {
        const crumbs = [{ label: 'Home', href: '/' }, { label: 'FAQ', href: pathname }];
        return {
            title: 'Frequently asked questions',
            description: 'FAQ coverage for what the product is, how it works, whether it is free, where it is available, and what it can create.',
            crumbs,
            schema: [...buildSharedSchemas(), buildFaqSchema(FAQ_ITEMS), buildBreadcrumbSchema(pathname, crumbs)],
            render: (navigate) => <FaqSection navigate={navigate} pathname={pathname} />,
        };
    }

    if (pathname === '/case-studies') {
        const crumbs = [{ label: 'Home', href: '/' }, { label: 'Case studies', href: pathname }];
        return {
            title: 'Case studies and examples',
            description: 'Example use cases for turning website analysis into a repeatable brand-content workflow.',
            crumbs,
            schema: [...buildSharedSchemas(), buildBreadcrumbSchema(pathname, crumbs)],
            render: () => <CaseStudiesPage />,
        };
    }

    if (pathname === '/community') {
        const crumbs = [{ label: 'Home', href: '/' }, { label: 'Community', href: pathname }];
        return {
            title: 'Community and support hub',
            description: 'A community path for access updates, prompt sharing, troubleshooting, and onboarding resources.',
            crumbs,
            schema: [...buildSharedSchemas(), buildBreadcrumbSchema(pathname, crumbs)],
            render: (navigate) => <CommunityPage navigate={navigate} />,
        };
    }

    const article = GUIDE_ARTICLES.find((entry) => entry.href === pathname);
    if (article) {
        const crumbs = [
            { label: 'Home', href: '/' },
            { label: 'Guides', href: '/guides' },
            { label: article.title, href: pathname },
        ];
        return {
            title: article.title,
            description: article.excerpt,
            crumbs,
            schema: [...buildSharedSchemas(), buildArticleSchema(article, pathname), buildBreadcrumbSchema(pathname, crumbs)],
            render: (navigate) => <GuideArticlePage navigate={navigate} article={article} />,
        };
    }

    const feature = FEATURE_PAGES.find((entry) => entry.href === pathname);
    if (feature) {
        const crumbs = [
            { label: 'Home', href: '/' },
            { label: 'Features', href: feature.href },
            { label: feature.title, href: pathname },
        ];
        return {
            title: feature.title,
            description: feature.intro,
            crumbs,
            schema: [...buildSharedSchemas(), buildBreadcrumbSchema(pathname, crumbs)],
            render: (navigate) => <FeaturePage navigate={navigate} feature={feature} />,
        };
    }

    return {
        title: 'Page not found',
        description: DEFAULT_DESCRIPTION,
        crumbs: [{ label: 'Home', href: '/' }, { label: 'Not found', href: pathname }],
        schema: [...buildSharedSchemas()],
        render: (navigate) => <NotFoundPage navigate={navigate} />,
    };
}

function MarketingSite({ pathname, navigate }) {
    const [theme, setTheme] = useState(() => {
        const savedTheme = localStorage.getItem('brand-content-theme');
        if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    });

    useEffect(() => {
        document.documentElement.dataset.theme = theme;
        localStorage.setItem('brand-content-theme', theme);
    }, [theme]);

    const pageModel = useMemo(() => buildPageModel(pathname), [pathname]);

    useSeo({
        title: pageModel.title,
        description: pageModel.description,
        pathname,
        schema: pageModel.schema,
    });

    useEffect(() => {
        const sections = Array.from(document.querySelectorAll('[data-section-id]'));
        if (!sections.length) return undefined;

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        trackEvent('scroll_depth_section', { section: entry.target.getAttribute('data-section-id') });
                    }
                });
            },
            { threshold: 0.55 }
        );

        sections.forEach((section) => observer.observe(section));
        return () => observer.disconnect();
    }, [pathname]);

    return (
        <div className="site-shell">
            <AnnouncementBar navigate={navigate} />
            <SiteHeader navigate={navigate} pathname={pathname} theme={theme} setTheme={setTheme} />
            <main>
                <Breadcrumbs crumbs={pageModel.crumbs} navigate={navigate} />
                <div data-section-id={slugify(pageModel.title)}>
                    {pageModel.render(navigate)}
                </div>
            </main>
            <Footer navigate={navigate} />
        </div>
    );
}

export default MarketingSite;
