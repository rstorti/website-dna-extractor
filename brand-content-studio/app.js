const siteName = 'Brand Content Studio';
const defaultDescription = 'A standalone product website for an AI brand-content tool that turns a website into an editable Business DNA profile and on-brand marketing assets.';
const socialImage = './social-card.svg';
const canonicalBase = 'http://127.0.0.1:4173/';

const navItems = [
    ['Analyze', '#/analyze'],
    ['What it is', '#/what-is-it'],
    ['How it works', '#/how-to-use'],
    ['Guides', '#/guides'],
    ['Comparisons', '#/compare/design-suite'],
    ['FAQ', '#/faq'],
    ['Community', '#/community'],
];

const topicCards = [
    ['Analyze a site', 'Start with a live URL and build its Business DNA profile.', '#/analyze', 'Core flow'],
    ['What it is', 'Define the Business DNA workflow in plain language.', '#/what-is-it', 'Start here'],
    ['How to use it', 'Show the 3-step flow from URL to campaign output.', '#/how-to-use', 'Workflow'],
    ['Troubleshooting', 'Help with access, weak scans, edits, and exports.', '#/troubleshooting', 'Support'],
    ['Regions and access', 'Clarify beta rollout, language support, and geography.', '#/regions', 'Availability'],
    ['Compare options', 'Explain the difference from template-first design tools.', '#/compare/design-suite', 'Comparison'],
    ['Feature updates', 'Track image generation, animation, and product scenes.', '#/roadmap', 'What is new'],
    ['Guides and tutorials', 'Build an SEO library of tutorials and use cases.', '#/guides', 'Learn'],
];

const features = [
    ['Website-first brand extraction', 'Start with a live URL and pull brand colors, fonts, imagery, and tone into one reusable profile.', 'Brand capture'],
    ['Editable Business DNA', 'Let users review and refine the profile before generating assets so the output stays aligned.', 'Human review'],
    ['Campaign-ready asset generation', 'Support social posts, display ads, email banners, thumbnails, and branded launch visuals.', 'Multi-format'],
    ['Natural-language refinement', 'Allow short instructions to adjust copy, backgrounds, emphasis, and layout without design tooling.', 'Prompt editing'],
    ['Educational growth engine', 'Use guides, comparisons, troubleshooting, and release notes as a search and conversion loop.', 'SEO engine'],
];

const workflowSteps = [
    ['01', 'Enter a website URL', 'Paste the site you want to analyze.', 'The system reads visible styling, imagery, and messaging signals.', 'A raw brand profile is created.'],
    ['02', 'Review the Business DNA', 'Check colors, fonts, imagery patterns, and descriptors.', 'The extracted traits are organized into an editable brand profile.', 'You get a reusable system instead of a one-off scan.'],
    ['03', 'Generate branded campaigns', 'Choose a use case or write a prompt.', 'The product creates multiple concepts across formats and aspect ratios.', 'Downloadable creative stays visually and verbally aligned.'],
];

const guides = [
    {
        slug: 'beginner-guide',
        title: 'Beginner guide to website-based brand analysis',
        category: 'Guide',
        readTime: '6 min read',
        excerpt: 'Learn what gets extracted from a URL and how to review the Business DNA before generating assets.',
        body: [
            'Website-based brand analysis works best when the source site already represents the business clearly. Start with a homepage or product page that shows the most complete version of the brand.',
            'After the scan, review colors, typography, sample imagery, business descriptors, and tone cues before moving into campaign generation. This review step is what keeps the workflow on-brand rather than generic.',
            'If a brand has seasonal pages or uneven subdomains, use the source that best reflects the campaign you want to create and refine the profile before generation.',
        ],
    },
    {
        slug: 'first-campaign',
        title: 'Create your first campaign from a Business DNA profile',
        category: 'Tutorial',
        readTime: '5 min read',
        excerpt: 'Use the extracted profile to generate campaign ideas and asset variants without rebuilding the brand from scratch.',
        body: [
            'Start with one concrete campaign goal, such as a promotion, launch, or lead-generation angle. The clearer the use case, the better the first set of outputs.',
            'Generate more than one concept. The strongest workflow compares directions, chooses the most promising one, and then refines copy, composition, or background style.',
            'For distribution, build a master concept first and then request square, portrait, and horizontal variants so the campaign remains consistent across channels.',
        ],
    },
    {
        slug: 'best-prompts',
        title: 'Best prompts for refining generated creative',
        category: 'Prompting',
        readTime: '4 min read',
        excerpt: 'Prompt patterns for stronger headlines, better product emphasis, and cleaner variants.',
        body: [
            'Use direct editing prompts such as "increase headline contrast," "use a lighter background," or "make the product feel studio-lit." Small concrete changes work better than vague requests.',
            'When the voice feels off, refer back to the Business DNA. Ask for copy that sounds more educational, more premium, or more locally grounded depending on the extracted tone.',
            'If you need several exports, mention the format in the prompt and request two or three layout options to explore hierarchy instead of just restyling one idea.',
        ],
    },
    {
        slug: 'exporting-assets',
        title: 'Exporting assets for different channels',
        category: 'Distribution',
        readTime: '5 min read',
        excerpt: 'Map generated creative into common placements without losing brand consistency.',
        body: [
            'Different channels reward different hierarchy. Social assets need immediate visual impact, while email banners often need clearer CTA and more whitespace.',
            'Use one campaign direction to produce multiple aspect ratios in the same visual family. That keeps the campaign recognizable as it moves across touchpoints.',
            'Before exporting, check that logos, product crops, and CTA language still fit the platform context and the audience you want to reach.',
        ],
    },
];

const featuresPages = [
    {
        slug: 'image-generation',
        title: 'Image generation',
        intro: 'Generate fresh visuals that inherit the Business DNA rather than defaulting to generic AI style.',
        bullets: [
            'Create visuals that follow the extracted palette and visual mood.',
            'Use product references or URLs to ground the results.',
            'Refine scenes with short instructions for cleaner outcomes.',
        ],
    },
    {
        slug: 'animation',
        title: 'Animation and video variants',
        intro: 'Extend static concepts into motion-friendly formats for lightweight storytelling and ad testing.',
        bullets: [
            'Turn campaign concepts into short-form animated variants.',
            'Keep pacing, text, and styling tied to the brand profile.',
            'Prototype motion before moving into full production.',
        ],
    },
    {
        slug: 'product-photos',
        title: 'Product-photo workflows',
        intro: 'Create studio-style or contextual product scenes while keeping the overall brand world coherent.',
        bullets: [
            'Generate product scenes for launches and seasonal campaigns.',
            'Adjust environment and styling with prompt-based edits.',
            'Keep photography and ad creative aligned through the same profile.',
        ],
    },
];

const faqItems = [
    ['what-is-business-dna', 'What is a Business DNA generator?', 'It is an AI workflow that analyzes a public website, extracts brand traits such as color, typography, imagery, and tone, then uses that profile to generate marketing assets that stay visually and verbally aligned.'],
    ['how-does-it-work', 'How does the workflow work?', 'The experience follows three steps: enter a website URL, review the extracted brand profile, and generate campaign assets or prompts from that Business DNA.'],
    ['is-it-free', 'Is the product free to use?', 'This site can describe free educational access separately from product access. Launch access may still depend on region, beta status, or signup flow.'],
    ['what-can-it-create', 'What kinds of assets can it create?', 'Typical outputs include social posts, display ads, email banners, thumbnails, product visuals, campaign concepts, and motion-friendly variants.'],
    ['how-is-it-different', 'How is this different from template-based design tools?', 'The key difference is that generation starts from website-based brand extraction rather than a blank canvas or a template library.'],
    ['where-is-it-available', 'Where is it available?', 'Availability can vary by geography, rollout phase, or language support. A strong informational site should make those limits explicit and offer fallback paths.'],
    ['can-i-edit-results', 'Can I edit the generated results?', 'Yes. The ideal workflow lets users refine copy, emphasis, text scale, and background treatment using short natural-language instructions.'],
    ['does-it-support-new-capabilities', 'Does it support image, animation, and product-photo workflows?', 'That is a major part of the roadmap story. Feature pages and updates should cover image generation, motion variants, campaign grounding, and product-scene creation.'],
];

const roadmapItems = [
    ['Campaign grounding', 'Rolling out', 'April 2026', 'Anchor campaigns with uploaded references, product URLs, and stronger scene context.'],
    ['Image generation refresh', 'Recently updated', 'March 2026', 'Improve subject handling, style fidelity, and prompt responsiveness.'],
    ['Animation variants', 'In preview', 'Q2 2026', 'Support short-form motion outputs for social storytelling and creative testing.'],
    ['Product-photo studio mode', 'Expanding', 'Q2 2026', 'Speed up studio-style scenes and branded product backdrops from one product reference.'],
];

const caseStudies = [
    ['A local retailer turned its homepage into a seasonal campaign kit', 'The team used one storefront URL to establish tone, product-photo direction, and CTA language before creating social, display, and email assets.', 'Reduced time from brief to export by standardizing the Business DNA review step.'],
    ['A consultant packaged client brand systems into repeatable prompts', 'Instead of rebuilding strategy from scratch for every engagement, the consultant tied prompt templates to each client\'s extracted brand profile.', 'Created reusable prompt libraries for multiple small-business clients.'],
    ['A creator used product-scene generation to launch faster', 'The workflow combined brand extraction, headline refinement, and product-scene generation to create a coherent launch set without a traditional shoot.', 'Built launch-ready visuals without scheduling a full custom photoshoot.'],
];

const footerLinks = [
    ['Analyze', '#/analyze'],
    ['Home', '#/'],
    ['What it is', '#/what-is-it'],
    ['How it works', '#/how-to-use'],
    ['Guides', '#/guides'],
    ['Roadmap', '#/roadmap'],
    ['Troubleshooting', '#/troubleshooting'],
    ['FAQ', '#/faq'],
];

const palettes = [
    {
        name: 'Minfo Signal',
        chips: ['#F99D32', '#7C5270', '#54485B'],
        labels: ['Primary CTA', 'Brand Plum', 'Dark Plum'],
    },
    {
        name: 'Editorial Warmth',
        chips: ['#F07B53', '#AB5A75', '#3A3A3C'],
        labels: ['Tangerine', 'Rose', 'Dark Grey'],
    },
    {
        name: 'Studio Contrast',
        chips: ['#F99D32', '#D4656A', '#17181B'],
        labels: ['Orange', 'Coral', 'Ink'],
    },
    {
        name: 'Retail Precision',
        chips: ['#F99D32', '#54485B', '#CFC4B5'],
        labels: ['Launch Orange', 'Muted Plum', 'Stone'],
    },
];

const typographyPairs = [
    'Space Grotesk headlines with DM Sans body copy',
    'Structured sans headlines with editorial supporting copy',
    'Geometric display type with compact product details',
    'Confident display headings with utility-first body text',
];

const toneProfiles = [
    'clear and premium',
    'helpful and direct',
    'confident and promotional',
    'practical and educational',
];

const imageryProfiles = [
    'studio-lit product scenes',
    'editorial lifestyle photography',
    'high-contrast cutout visuals',
    'clean category-led merchandising',
];

const verticalProfiles = [
    'consumer retail',
    'health and wellness',
    'creator commerce',
    'service-led local business',
    'modern SaaS',
];

const campaignFormats = [
    'Paid social',
    'Display ads',
    'Email banners',
    'Launch hero graphics',
    'Product spotlight cards',
    'Short-form motion variants',
];

function parseRoute() {
    const rawHash = window.location.hash.replace(/^#/, '') || '/';
    const [pathPart, queryPart = ''] = rawHash.split('?');
    return {
        path: pathPart || '/',
        params: new URLSearchParams(queryPart),
        hash: rawHash,
    };
}

function normalizeUrl(value) {
    const trimmed = value.trim();
    if (!trimmed) return null;

    let normalized = trimmed;
    if (!/^https?:\/\//i.test(normalized)) {
        normalized = `https://${normalized}`;
    }

    try {
        const parsed = new URL(normalized);
        if (!parsed.hostname.includes('.')) return null;
        return parsed.toString();
    } catch {
        return null;
    }
}

function hashCode(value) {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
        hash = ((hash << 5) - hash) + value.charCodeAt(index);
        hash |= 0;
    }
    return Math.abs(hash);
}

function titleCase(value) {
    return value
        .split(/[\s-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function brandNameFromHost(hostname) {
    const trimmed = hostname.replace(/^www\./i, '');
    const parts = trimmed.split('.').slice(0, -1).join(' ').split(/[-_]/);
    const words = parts.filter(Boolean);
    return words.length ? titleCase(words.join(' ')) : titleCase(trimmed);
}

function buildAnalysis(url, prompt = '') {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^www\./i, '');
    const seed = hashCode(hostname);
    const palette = palettes[seed % palettes.length];
    const typography = typographyPairs[seed % typographyPairs.length];
    const tone = toneProfiles[seed % toneProfiles.length];
    const imagery = imageryProfiles[seed % imageryProfiles.length];
    const vertical = verticalProfiles[seed % verticalProfiles.length];
    const brandName = brandNameFromHost(parsed.hostname);
    const shortHost = hostname.split('.')[0];
    const focusPrompt = prompt.trim();
    const promptLine = focusPrompt ? `Refined for: ${focusPrompt}.` : 'No extra refinement prompt applied yet.';
    const headlineBase = `${brandName} brand system ready for campaign generation`;
    const descriptor = `${brandName} presents like a ${vertical} brand with ${tone} messaging and ${imagery}.`;
    const ctaLabel = `Launch ${brandName} campaign`;
    const assetFocus = campaignFormats.slice(seed % 3, (seed % 3) + 3);
    const missingFocus = seed % 2 === 0 ? 'headline hierarchy on mobile' : 'stronger product-callout contrast';

    return {
        url,
        hostname,
        brandName,
        palette,
        typography,
        tone,
        imagery,
        vertical,
        descriptor,
        promptLine,
        ctaLabel,
        assetFocus,
        missingFocus,
        summary: `${brandName} should emphasize ${tone} positioning with visuals that feel like ${imagery}.`,
        dnaBullets: [
            `Brand promise: turn ${brandName} traffic into reusable campaign systems.`,
            `Visual mood: ${imagery}.`,
            `Voice profile: ${tone}.`,
            `Formatting priority: preserve brand cues across multiple export sizes.`,
        ],
        recommendedPrompts: [
            `Generate a ${brandName} spring launch campaign with stronger product emphasis.`,
            `Create a square paid-social variant using ${palette.labels[0].toLowerCase()} as the main accent.`,
            `Refine the headline hierarchy so mobile text feels clearer and more premium.`,
        ],
        campaignCards: [
            {
                name: 'Launch campaign',
                detail: `${brandName} hero concept for homepage, paid social, and email banner rollout.`,
            },
            {
                name: 'Product scene set',
                detail: `Use ${imagery} with ${tone} copy for a cleaner product showcase series.`,
            },
            {
                name: 'Evergreen acquisition ads',
                detail: `Build ${assetFocus.join(', ').toLowerCase()} from the same Business DNA profile.`,
            },
        ],
        jsonPreview: {
            source_url: url,
            brand_name: brandName,
            vertical,
            tone,
            typography,
            palette: palette.chips,
            campaign_focus: assetFocus,
            refinement_prompt: focusPrompt || null,
        },
        steps: [
            'Source URL normalized and validated',
            'Brand colors, typography, and tone grouped into a Business DNA profile',
            `Suggested next iteration: improve ${missingFocus}`,
        ],
    };
}

function updateSeo({ title, description, path, schema }) {
    document.title = title ? `${title} | ${siteName}` : siteName;
    document.querySelector('meta[name="description"]').setAttribute('content', description);
    document.querySelector('meta[property="og:title"]').setAttribute('content', title ? `${title} | ${siteName}` : siteName);
    document.querySelector('meta[property="og:description"]').setAttribute('content', description);
    document.querySelector('meta[property="og:image"]').setAttribute('content', socialImage);
    document.querySelector('meta[name="twitter:title"]').setAttribute('content', title ? `${title} | ${siteName}` : siteName);
    document.querySelector('meta[name="twitter:description"]').setAttribute('content', description);
    document.querySelector('link[rel="canonical"]').setAttribute('href', `${canonicalBase}${path === '/' ? '' : `#${path}`}`);

    document.querySelectorAll('script[data-schema="brand-content"]').forEach((script) => script.remove());
    schema.forEach((item) => {
        const script = document.createElement('script');
        script.type = 'application/ld+json';
        script.dataset.schema = 'brand-content';
        script.textContent = JSON.stringify(item);
        document.head.appendChild(script);
    });
}

function sharedSchemas() {
    return [
        {
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: siteName,
            url: canonicalBase,
            logo: `${canonicalBase}favicon.svg`,
            description: defaultDescription,
        },
        {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: siteName,
            url: canonicalBase,
            description: defaultDescription,
        },
    ];
}

function breadcrumbSchema(crumbs) {
    return {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: crumbs.map((crumb, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: crumb[0],
            item: `${canonicalBase}${crumb[1] === '/' ? '' : `#${crumb[1]}`}`,
        })),
    };
}

function faqSchema(items) {
    return {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: items.map((item) => ({
            '@type': 'Question',
            name: item[1],
            acceptedAnswer: {
                '@type': 'Answer',
                text: item[2],
            },
        })),
    };
}

function articleSchema(article) {
    return {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: article.title,
        description: article.excerpt,
        author: { '@type': 'Organization', name: siteName },
        publisher: { '@type': 'Organization', name: siteName },
        datePublished: '2026-04-27',
        mainEntityOfPage: `${canonicalBase}#/guides/${article.slug}`,
    };
}

function scanForm(options = {}) {
    const {
        inputValue = '',
        promptValue = '',
        compact = false,
        title = 'Analyze any website',
        subtitle = 'Paste a website URL to build its Business DNA profile.',
        buttonLabel = 'Analyze site',
        showPrompt = false,
        includeExamples = true,
        formClass = '',
    } = options;

    scanForm.count = (scanForm.count || 0) + 1;
    const inputId = `site-url-input-${scanForm.count}`;
    const promptId = `site-prompt-input-${scanForm.count}`;

    return `
        <section class="${compact ? 'scan-bar' : 'scan-surface'}${formClass ? ` ${formClass}` : ''}">
            <div class="scan-copy">
                <div class="eyebrow">Business DNA input</div>
                <h2>${title}</h2>
                <p>${subtitle}</p>
            </div>
            <form class="scan-form" data-scan-form>
                <div class="scan-main">
                    <label class="sr-only" for="${inputId}">Website URL</label>
                    <input
                        id="${inputId}"
                        class="scan-input"
                        name="url"
                        type="text"
                        inputmode="url"
                        autocomplete="off"
                        spellcheck="false"
                        placeholder="https://example.com"
                        value="${inputValue}"
                        data-site-input
                    />
                    <button class="button scan-submit" type="submit">${buttonLabel}</button>
                </div>
                ${showPrompt ? `
                    <div class="scan-refine-row">
                        <label class="sr-only" for="${promptId}">Refinement prompt</label>
                        <input
                            id="${promptId}"
                            class="scan-input scan-refine-input"
                            name="prompt"
                            type="text"
                            autocomplete="off"
                            spellcheck="false"
                            placeholder="Optional refinement prompt"
                            value="${promptValue}"
                            data-refine-input
                        />
                    </div>
                ` : ''}
                <p class="scan-error" data-form-error></p>
                ${includeExamples ? `
                    <div class="scan-examples">
                        <span>Try:</span>
                        <button type="button" class="chip-button" data-example-url="https://allbirds.com">allbirds.com</button>
                        <button type="button" class="chip-button" data-example-url="https://notion.so">notion.so</button>
                        <button type="button" class="chip-button" data-example-url="https://glossier.com">glossier.com</button>
                    </div>
                ` : ''}
            </form>
        </section>
    `;
}

function topicGridHtml() {
    return topicCards.map(([title, description, href, badge]) => `
        <a class="topic-card" href="${href}">
            <div class="topic-badge">${badge}</div>
            <h3>${title}</h3>
            <p>${description}</p>
        </a>
    `).join('');
}

function featureGridHtml() {
    return features.map(([title, description, label]) => `
        <article class="feature-card">
            <div class="feature-label">${label}</div>
            <h3>${title}</h3>
            <p>${description}</p>
        </article>
    `).join('');
}

function workflowHtml() {
    return workflowSteps.map(([step, title, userAction, systemAction, outcome]) => `
        <article class="workflow-card">
            <div class="workflow-step">${step}</div>
            <h3>${title}</h3>
            <dl>
                <div><dt>User action</dt><dd>${userAction}</dd></div>
                <div><dt>System action</dt><dd>${systemAction}</dd></div>
                <div><dt>Outcome</dt><dd>${outcome}</dd></div>
            </dl>
        </article>
    `).join('');
}

function guidesHtml(items = guides) {
    return items.map((guide) => `
        <a class="resource-card" href="#/guides/${guide.slug}">
            <div class="resource-meta">${guide.category} · ${guide.readTime}</div>
            <h3>${guide.title}</h3>
            <p>${guide.excerpt}</p>
        </a>
    `).join('');
}

function faqHtml(items = faqItems) {
    return items.map(([id, question, answer], index) => `
        <article class="faq-item ${index === 0 ? 'open' : ''}" id="${id}">
            <button class="faq-trigger" type="button" data-faq="${id}">
                <span>${question}</span>
                <span>${index === 0 ? '-' : '+'}</span>
            </button>
            <div class="faq-answer">
                <p>${answer}</p>
            </div>
        </article>
    `).join('');
}

function capabilitiesHtml() {
    return featuresPages.map((feature) => `
        <a class="capability-card" href="#/features/${feature.slug}">
            <div class="feature-label">Capability</div>
            <h3>${feature.title}</h3>
            <p>${feature.intro}</p>
        </a>
    `).join('');
}

function ctaBand() {
    return `
        <section class="cta-band">
            <div>
                <div class="eyebrow">Analyze another site</div>
                <h2>Use the input, then turn the Business DNA into campaign-ready direction.</h2>
                <p>Keep the main action tied to entering a website URL. Everything else should branch from that input.</p>
            </div>
            <div class="cta-band-form">
                ${scanForm({
                    compact: true,
                    title: 'Analyze another website',
                    subtitle: 'Paste a URL to generate a fresh Business DNA profile.',
                    buttonLabel: 'Run analysis',
                    includeExamples: false,
                    formClass: 'cta-scan-form',
                })}
            </div>
        </section>
    `;
}

function pageHero(eyebrow, title, lead, meta = '') {
    return `
        <section class="page-hero">
            <div class="eyebrow">${eyebrow}</div>
            <h1>${title}</h1>
            <p class="lead">${lead}</p>
            ${meta}
        </section>
    `;
}

function homePage() {
    return `
        <section class="hero">
            <div class="hero-copy">
                <div class="eyebrow">Website-first analyzer</div>
                <h1>Enter a website URL and generate its Business DNA.</h1>
                <p class="lead">The app starts with the URL. Analyze a site, extract brand colors, typography, imagery, and tone, then use that profile to create on-brand marketing assets.</p>
                ${scanForm({
                    inputValue: '',
                    title: 'Analyze a website now',
                    subtitle: 'Paste a live site and move directly into its Business DNA profile.',
                    buttonLabel: 'Build Business DNA',
                    includeExamples: true,
                    formClass: 'hero-scan-form',
                })}
                <div class="hero-metrics">
                    <article class="meta-card"><strong>Input-first flow</strong><p>Website URL, then Business DNA review</p></article>
                    <article class="meta-card"><strong>Editable output</strong><p>Refine profile and campaign direction with prompts</p></article>
                    <article class="meta-card"><strong>Multi-format generation</strong><p>Social, display, email, product scenes, motion</p></article>
                </div>
            </div>
            <div class="hero-demo">
                <div class="demo-input">
                    <label for="demo-url">Live analysis preview</label>
                    <input id="demo-url" value="https://example-brand.com" readonly />
                    <div class="demo-status" id="demo-status">Analyzing palette and typography</div>
                </div>
                <div class="demo-panels">
                    <article class="demo-panel">
                        <div class="feature-label">Business DNA</div>
                        <h3>Modern retail brand with warm neutrals and editorial product imagery.</h3>
                        <div class="signal-list">
                            <span>Palette: sand, ink, cedar</span>
                            <span>Tone: clear, premium, practical</span>
                            <span>Fonts: serif display + clean sans</span>
                        </div>
                    </article>
                    <article class="demo-panel">
                        <div class="feature-label">Suggested outputs</div>
                        <div class="pill-row">
                            <span>Launch ad</span>
                            <span>Email banner</span>
                            <span>Social carousel</span>
                            <span>Product scene</span>
                        </div>
                    </article>
                    <article class="demo-panel">
                        <div class="feature-label">Refinement prompts</div>
                        <div class="prompt-row">
                            <span>Increase headline contrast</span>
                            <span>Use a lighter studio background</span>
                            <span>Create a square social variant</span>
                        </div>
                    </article>
                </div>
            </div>
        </section>

        <section class="section">
            <div class="section-header">
                <div class="eyebrow">Popular topics</div>
                <h2>Give informational visitors a fast path after the URL input is obvious.</h2>
                <p>Once the main analyzer is clear, visitors can self-route into onboarding, troubleshooting, comparisons, and updates.</p>
            </div>
            <div class="topic-grid">${topicGridHtml()}</div>
        </section>

        <section class="section">
            <div class="section-header">
                <div class="eyebrow">Value proposition</div>
                <h2>Position the product around brand consistency, speed, and clarity.</h2>
            </div>
            <div class="feature-grid">${featureGridHtml()}</div>
        </section>

        <section class="section">
            <div class="section-header">
                <div class="eyebrow">How it works</div>
                <h2>Keep the core experience to three steps.</h2>
            </div>
            <div class="workflow-grid">${workflowHtml()}</div>
        </section>

        <section class="section">
            <div class="section-header">
                <div class="eyebrow">Resource hub</div>
                <h2>Use guides, comparisons, and updates as a growth loop.</h2>
            </div>
            <div class="resource-grid">${guidesHtml(guides.slice(0, 4))}</div>
        </section>

        <section class="section">
            <div class="section-header">
                <div class="eyebrow">Expanding capabilities</div>
                <h2>Show the product growing beyond static ad generation.</h2>
            </div>
            <div class="capability-grid">${capabilitiesHtml()}</div>
        </section>

        <section class="section">
            <div class="section-header">
                <div class="eyebrow">FAQ</div>
                <h2>Answer the objections that block conversion.</h2>
            </div>
            <div class="faq-list">${faqHtml(faqItems.slice(0, 6))}</div>
        </section>

        ${ctaBand()}
    `;
}

function simplePage({ eyebrow, title, lead, body, extra = '', meta = '' }) {
    return `
        ${pageHero(eyebrow, title, lead, meta)}
        <section class="prose">
            ${body.map((paragraph) => `<p>${paragraph}</p>`).join('')}
            ${extra}
        </section>
        ${ctaBand()}
    `;
}

function analysisPage(params) {
    const rawUrl = params.get('url') || '';
    const prompt = params.get('prompt') || '';
    const normalized = normalizeUrl(rawUrl);

    if (!normalized) {
        return {
            title: 'Analyze a website',
            description: 'Enter a website URL to build its Business DNA profile.',
            crumbs: [['Home', '/'], ['Analyze', '/analyze']],
            schema: [...sharedSchemas(), breadcrumbSchema([['Home', '/'], ['Analyze', '/analyze']])],
            html: `
                ${pageHero('Analyze', 'Enter a website to build its Business DNA.', 'Paste a live URL to generate a brand profile with palette, tone, typography, and campaign directions.')}
                ${scanForm({
                    title: 'Analyze any website',
                    subtitle: 'Paste a URL to generate a standalone Business DNA profile.',
                    buttonLabel: 'Analyze site',
                    showPrompt: true,
                    includeExamples: true,
                    formClass: 'analyze-page-form',
                })}
                <section class="empty-state surface">
                    <p>No website URL has been entered yet. Start with a live domain to generate the analysis view.</p>
                </section>
            `,
        };
    }

    const analysis = buildAnalysis(normalized, prompt);

    return {
        title: `Business DNA for ${analysis.brandName}`,
        description: `Review the generated Business DNA profile for ${analysis.brandName}, including palette, tone, typography, and campaign recommendations.`,
        crumbs: [['Home', '/'], ['Analyze', '/analyze'], [analysis.brandName, '/analyze']],
        schema: [...sharedSchemas(), breadcrumbSchema([['Home', '/'], ['Analyze', '/analyze'], [analysis.brandName, '/analyze']])],
        html: `
            ${pageHero('Analyze', `Business DNA for ${analysis.brandName}`, `${analysis.summary}`, `
                <div class="meta-grid">
                    <article class="meta-card"><strong>Source URL</strong><p>${analysis.url}</p></article>
                    <article class="meta-card"><strong>Vertical</strong><p>${analysis.vertical}</p></article>
                    <article class="meta-card"><strong>Prompt status</strong><p>${analysis.promptLine}</p></article>
                </div>
            `)}

            ${scanForm({
                inputValue: analysis.url,
                promptValue: prompt,
                title: 'Run a new analysis or refine this one',
                subtitle: 'Change the source URL or add a prompt to regenerate the Business DNA view.',
                buttonLabel: 'Refresh analysis',
                showPrompt: true,
                includeExamples: false,
                formClass: 'analyze-page-form',
            })}

            <section class="analysis-grid">
                <article class="analysis-card">
                    <div class="feature-label">Brand profile</div>
                    <h3>${analysis.brandName}</h3>
                    <p>${analysis.descriptor}</p>
                    <ul class="detail-list">
                        ${analysis.dnaBullets.map((bullet) => `<li>${bullet}</li>`).join('')}
                    </ul>
                </article>

                <article class="analysis-card">
                    <div class="feature-label">Palette system</div>
                    <h3>${analysis.palette.name}</h3>
                    <div class="palette-row">
                        ${analysis.palette.chips.map((chip, index) => `
                            <div class="palette-card">
                                <div class="palette-swatch" style="background:${chip}"></div>
                                <strong>${analysis.palette.labels[index]}</strong>
                                <span>${chip}</span>
                            </div>
                        `).join('')}
                    </div>
                </article>

                <article class="analysis-card">
                    <div class="feature-label">Typography and voice</div>
                    <h3>Presentation rules</h3>
                    <div class="detail-stack">
                        <div><strong>Typography</strong><p>${analysis.typography}</p></div>
                        <div><strong>Tone</strong><p>${analysis.tone}</p></div>
                        <div><strong>Imagery</strong><p>${analysis.imagery}</p></div>
                    </div>
                </article>
            </section>

            <section class="section">
                <div class="section-header">
                    <div class="eyebrow">Campaign outputs</div>
                    <h2>Turn the Business DNA into launch-ready directions.</h2>
                    <p>These generated concepts inherit the site profile instead of starting from a blank template.</p>
                </div>
                <div class="campaign-grid">
                    ${analysis.campaignCards.map((campaign) => `
                        <article class="campaign-card">
                            <div class="resource-meta">Suggested concept</div>
                            <h3>${campaign.name}</h3>
                            <p>${campaign.detail}</p>
                        </article>
                    `).join('')}
                </div>
            </section>

            <section class="section">
                <div class="section-header">
                    <div class="eyebrow">Recommended next prompts</div>
                    <h2>Guide the next iteration with short instructions.</h2>
                </div>
                <div class="prompt-grid">
                    ${analysis.recommendedPrompts.map((item) => `<article class="prompt-card">${item}</article>`).join('')}
                </div>
            </section>

            <section class="analysis-grid">
                <article class="analysis-card">
                    <div class="feature-label">Export focus</div>
                    <h3>Top formats</h3>
                    <div class="pill-row">
                        ${analysis.assetFocus.map((item) => `<span>${item}</span>`).join('')}
                    </div>
                    <p class="analysis-note">Suggested improvement: tighten ${analysis.missingFocus} before exporting.</p>
                </article>

                <article class="analysis-card">
                    <div class="feature-label">Processing notes</div>
                    <h3>Analysis summary</h3>
                    <ol class="detail-list ordered">
                        ${analysis.steps.map((item) => `<li>${item}</li>`).join('')}
                    </ol>
                </article>

                <article class="analysis-card">
                    <div class="feature-label">JSON payload</div>
                    <h3>Business DNA preview</h3>
                    <pre class="json-preview">${JSON.stringify(analysis.jsonPreview, null, 2)}</pre>
                </article>
            </section>

            ${ctaBand()}
        `,
    };
}

function renderRoute(route) {
    const { path, params } = route;

    if (path === '/') {
        return {
            title: 'AI brand-content website',
            description: defaultDescription,
            crumbs: [['Home', '/']],
            schema: [...sharedSchemas(), faqSchema(faqItems.slice(0, 6))],
            html: homePage(),
        };
    }

    if (path === '/analyze') {
        return analysisPage(params);
    }

    if (path === '/what-is-it') {
        return {
            title: 'What an AI brand-content tool is',
            description: 'Understand how website-based brand analysis becomes an editable Business DNA profile before asset generation.',
            crumbs: [['Home', '/'], ['What it is', path]],
            schema: [...sharedSchemas(), breadcrumbSchema([['Home', '/'], ['What it is', path]])],
            html: simplePage({
                eyebrow: 'What it is',
                title: 'A website-first AI marketing workflow.',
                lead: 'The product starts by analyzing a real website URL, then turns what it finds into an editable Business DNA profile for campaign generation.',
                body: [
                    'The strongest positioning is not "AI that makes graphics." It is "AI that understands the brand before it generates." That distinction is what high-intent comparison and educational traffic cares about.',
                    'The Business DNA concept makes the process legible. Rather than promising vague intelligence, the site should explain that the product builds an editable profile from visible website cues.',
                ],
                extra: `
                    <div class="signal-list">
                        <span>Color palette</span>
                        <span>Typography pairing</span>
                        <span>Imagery patterns</span>
                        <span>Tone of voice</span>
                        <span>Logo references</span>
                        <span>Business overview tags</span>
                    </div>
                `,
                meta: `
                    <div class="meta-grid">
                        <article class="meta-card"><strong>Input</strong><p>Website URL first</p></article>
                        <article class="meta-card"><strong>Review layer</strong><p>Editable Business DNA profile</p></article>
                        <article class="meta-card"><strong>Output</strong><p>Campaign-ready creative directions</p></article>
                    </div>
                `,
            }),
        };
    }

    if (path === '/how-to-use') {
        return {
            title: 'How the Business DNA workflow works',
            description: 'Follow the 3-step path from website URL to brand profile to campaign generation and refinement.',
            crumbs: [['Home', '/'], ['How it works', path]],
            schema: [...sharedSchemas(), breadcrumbSchema([['Home', '/'], ['How it works', path]])],
            html: `
                ${pageHero('How it works', 'URL in, Business DNA out, campaigns next.', 'Keep the product story operational: users enter a site, review the extracted brand profile, then generate and refine campaign assets.')}
                <section class="section">
                    <div class="workflow-grid">${workflowHtml()}</div>
                </section>
                <section class="prose">
                    <p>The workflow does not end after the first generation pass. Show that users can adjust headlines, text size, product emphasis, background treatment, and layout feel with short natural-language instructions.</p>
                    <p>That refinement story matters because it reassures visitors that the system is not a black box. The scan is automatic, but the result is still steerable.</p>
                    <div class="prompt-row">
                        <span>Make the headline feel more premium</span>
                        <span>Use a softer background with higher text contrast</span>
                        <span>Create horizontal and square versions for paid social</span>
                    </div>
                </section>
                ${ctaBand()}
            `,
        };
    }

    if (path === '/troubleshooting') {
        return {
            title: 'Troubleshooting website-based brand analysis',
            description: 'Support content for access issues, weak scans, brand mismatches, and gated availability.',
            crumbs: [['Home', '/'], ['Troubleshooting', path]],
            schema: [...sharedSchemas(), breadcrumbSchema([['Home', '/'], ['Troubleshooting', path]])],
            html: simplePage({
                eyebrow: 'Troubleshooting',
                title: 'Answer the access and quality questions before support gets buried.',
                lead: 'This content cluster should capture region issues, blocked scans, browser friction, and weak generation results while still routing users to a clear next step.',
                body: [
                    'Access and availability questions are some of the highest-intent support searches, so they deserve first-class pages rather than being buried inside a generic help center.',
                    'Each troubleshooting page should end with a practical next action: retry with a better source page, review the Business DNA profile, join the community, or use a fallback route while access is gated.',
                ],
                extra: `
                    <div class="signal-list">
                        <span>Website blocked or partially accessible</span>
                        <span>Weak or inconsistent brand signals</span>
                        <span>Brand mismatch in generated assets</span>
                        <span>Copy feels generic or off-tone</span>
                        <span>Unsupported browser or region limitations</span>
                        <span>Fallback CTA for gated access</span>
                    </div>
                `,
            }),
        };
    }

    if (path === '/regions') {
        return {
            title: 'Regions and availability',
            description: 'Clarify where the product is available, how beta access works, and what to do if a region is unsupported.',
            crumbs: [['Home', '/'], ['Regions', path]],
            schema: [...sharedSchemas(), breadcrumbSchema([['Home', '/'], ['Regions', path]])],
            html: simplePage({
                eyebrow: 'Regions and availability',
                title: 'Make access status easy to understand.',
                lead: 'Use this page for beta notes, supported regions, language limitations, and waitlist messaging so users can self-qualify quickly.',
                body: [
                    'A strong availability page should make supported markets, rollout constraints, and language limitations obvious instead of hiding them inside a generic help article.',
                    'When access is restricted, replace the dead end with a guide-first or community-first CTA so users still have a useful next step.',
                ],
                meta: `
                    <div class="meta-grid">
                        <article class="meta-card"><strong>Availability status</strong><p>Public, beta, waitlist, or invite-only</p></article>
                        <article class="meta-card"><strong>Language support</strong><p>Call out any English-first limitations</p></article>
                        <article class="meta-card"><strong>Fallback path</strong><p>Use guides or community when launch access is restricted</p></article>
                    </div>
                `,
            }),
        };
    }

    if (path === '/compare/design-suite') {
        return {
            title: 'Website-first brand extraction versus design suites',
            description: 'Compare website-based brand extraction to manual design-suite workflows for setup, editing, and output consistency.',
            crumbs: [['Home', '/'], ['Comparisons', '/compare/design-suite'], ['Design suite comparison', path]],
            schema: [...sharedSchemas(), breadcrumbSchema([['Home', '/'], ['Comparisons', '/compare/design-suite'], ['Design suite comparison', path]])],
            html: `
                ${pageHero('Comparison', 'Website-first brand extraction versus template-first design.', 'Comparison pages should focus on setup friction, automation depth, editing flow, and how reliably each workflow stays on-brand.')}
                <section class="comparison-table-wrap">
                    <table class="comparison-table">
                        <thead>
                            <tr><th>Criteria</th><th>Brand Content Studio</th><th>Manual design suite</th></tr>
                        </thead>
                        <tbody>
                            <tr><td>Brand setup</td><td>Extracted from a live website</td><td>Usually manual brand kit or template selection</td></tr>
                            <tr><td>Starting point</td><td>Business DNA profile</td><td>Canvas or preset layout</td></tr>
                            <tr><td>Editing model</td><td>Prompt-based refinement plus profile review</td><td>Mostly manual layout changes</td></tr>
                            <tr><td>Campaign output</td><td>Multi-variant concepts tied to brand signals</td><td>Depends on template reuse</td></tr>
                            <tr><td>Best fit</td><td>Small teams who need faster brand-consistent assets</td><td>Teams comfortable designing from a blank or templated canvas</td></tr>
                        </tbody>
                    </table>
                </section>
                ${ctaBand()}
            `,
        };
    }

    if (path === '/roadmap') {
        return {
            title: 'Feature updates and roadmap',
            description: 'Track updates for image generation, animation variants, product-photo workflows, and campaign grounding.',
            crumbs: [['Home', '/'], ['Feature updates', path]],
            schema: [...sharedSchemas(), breadcrumbSchema([['Home', '/'], ['Feature updates', path]])],
            html: `
                ${pageHero('Feature updates', 'Use release notes to keep the product story fresh.', 'This page should carry the newer capability narrative: image generation improvements, campaign grounding, animation, and product-scene workflows.')}
                <section class="resource-grid">
                    ${roadmapItems.map(([name, status, releaseDate, description]) => `
                        <article class="resource-card">
                            <div class="resource-meta">${status} · ${releaseDate}</div>
                            <h3>${name}</h3>
                            <p>${description}</p>
                        </article>
                    `).join('')}
                </section>
                ${ctaBand()}
            `,
        };
    }

    if (path === '/guides') {
        return {
            title: 'Guides and tutorials',
            description: 'Educational content for first campaigns, prompt tips, exporting, and troubleshooting a Business DNA workflow.',
            crumbs: [['Home', '/'], ['Guides', path]],
            schema: [...sharedSchemas(), breadcrumbSchema([['Home', '/'], ['Guides', path]])],
            html: `
                ${pageHero('Guides', 'Create the educational layer that search traffic expects.', 'Use tutorial templates for first campaigns, prompt patterns, editing tips, exporting, and troubleshooting.')}
                <section class="resource-grid">${guidesHtml()}</section>
                ${ctaBand()}
            `,
        };
    }

    if (path === '/faq') {
        return {
            title: 'Frequently asked questions',
            description: 'FAQ coverage for what the product is, how it works, whether it is free, where it is available, and what it can create.',
            crumbs: [['Home', '/'], ['FAQ', path]],
            schema: [...sharedSchemas(), breadcrumbSchema([['Home', '/'], ['FAQ', path]]), faqSchema(faqItems)],
            html: `
                ${pageHero('FAQ', 'Answer the objections that block conversion.', 'Use a structured FAQ for homepage reuse, deep links, and JSON-LD.')}
                <section class="faq-list">${faqHtml()}</section>
                ${ctaBand()}
            `,
        };
    }

    if (path === '/case-studies') {
        return {
            title: 'Case studies and examples',
            description: 'Example use cases for turning website analysis into a repeatable brand-content workflow.',
            crumbs: [['Home', '/'], ['Case studies', path]],
            schema: [...sharedSchemas(), breadcrumbSchema([['Home', '/'], ['Case studies', path]])],
            html: `
                ${pageHero('Case studies', 'Use examples to make the workflow feel concrete.', 'Even short case-study cards help visitors picture how a website scan turns into a repeatable content system.')}
                <section class="resource-grid">
                    ${caseStudies.map(([title, summary, result]) => `
                        <article class="resource-card">
                            <h3>${title}</h3>
                            <p>${summary}</p>
                            <p><strong>${result}</strong></p>
                        </article>
                    `).join('')}
                </section>
                ${ctaBand()}
            `,
        };
    }

    if (path === '/community') {
        return {
            title: 'Community and support hub',
            description: 'A community path for access updates, prompt sharing, troubleshooting, and onboarding resources.',
            crumbs: [['Home', '/'], ['Community', path]],
            schema: [...sharedSchemas(), breadcrumbSchema([['Home', '/'], ['Community', path]])],
            html: simplePage({
                eyebrow: 'Community',
                title: 'Give visitors a lower-friction path when they are not ready to launch.',
                lead: 'A community page supports beta updates, prompt sharing, troubleshooting, and product feedback without forcing every visitor into the same CTA.',
                body: [
                    'Use this page to explain what members get: access updates, campaign walkthroughs, prompt ideas, troubleshooting help, and early feature notes.',
                    'The community route is especially useful when launch access depends on beta status or geography, because it replaces a dead end with a useful next step.',
                ],
            }),
        };
    }

    if (path.startsWith('/guides/')) {
        const article = guides.find((guide) => guide.slug === path.split('/')[2]);
        if (article) {
            return {
                title: article.title,
                description: article.excerpt,
                crumbs: [['Home', '/'], ['Guides', '/guides'], [article.title, path]],
                schema: [...sharedSchemas(), breadcrumbSchema([['Home', '/'], ['Guides', '/guides'], [article.title, path]]), articleSchema(article)],
                html: `
                    ${pageHero(article.category, article.title, article.excerpt, `
                        <div class="meta-grid">
                            <article class="meta-card"><strong>Read time</strong><p>${article.readTime}</p></article>
                            <article class="meta-card"><strong>Published</strong><p>27 Apr 2026</p></article>
                            <article class="meta-card"><strong>Use case</strong><p>SEO education and CTA routing</p></article>
                        </div>
                    `)}
                    <section class="prose">
                        ${article.body.map((paragraph) => `<p>${paragraph}</p>`).join('')}
                    </section>
                    <section class="section">
                        <div class="section-header">
                            <div class="eyebrow">Related articles</div>
                            <h2>Keep the internal linking loop working.</h2>
                        </div>
                        <div class="resource-grid">${guidesHtml(guides.filter((guide) => guide.slug !== article.slug).slice(0, 3))}</div>
                    </section>
                    ${ctaBand()}
                `,
            };
        }
    }

    if (path.startsWith('/features/')) {
        const feature = featuresPages.find((entry) => entry.slug === path.split('/')[2]);
        if (feature) {
            return {
                title: feature.title,
                description: feature.intro,
                crumbs: [['Home', '/'], ['Features', path], [feature.title, path]],
                schema: [...sharedSchemas(), breadcrumbSchema([['Home', '/'], ['Features', path], [feature.title, path]])],
                html: `
                    ${pageHero('Capability', feature.title, feature.intro)}
                    <section class="prose">
                        <p>Capability pages help the site rank for specific feature searches while extending the main product story beyond the core URL-to-brand workflow.</p>
                        <p>Each page should explain what the capability does, when to use it, and how it stays anchored to the Business DNA profile instead of drifting into generic output.</p>
                        <ul>${feature.bullets.map((bullet) => `<li>${bullet}</li>`).join('')}</ul>
                    </section>
                    ${ctaBand()}
                `,
            };
        }
    }

    return {
        title: 'Page not found',
        description: defaultDescription,
        crumbs: [['Home', '/'], ['Not found', path]],
        schema: sharedSchemas(),
        html: `
            ${pageHero('Not found', 'This page does not exist yet.', 'Try analyzing a website or use the main navigation to explore the core routes.')}
            <section class="empty-state surface">
                <p>The standalone app includes an analyzer, guides, comparisons, roadmap, FAQ, and feature pages.</p>
            </section>
        `,
    };
}

function renderLayout(routeModel, routeInfo) {
    const currentPath = routeInfo.path;
    const navHtml = navItems.map(([label, href]) => `
        <a href="${href}" class="${href.replace(/^#/, '') === currentPath ? 'active' : ''}">${label}</a>
    `).join('');

    const breadcrumbHtml = routeModel.crumbs.map((crumb, index) => {
        if (index === routeModel.crumbs.length - 1) return `<strong>${crumb[0]}</strong>`;
        return `<a href="#${crumb[1]}">${crumb[0]}</a>`;
    }).join(' / ');

    return `
        <div class="site">
            <div class="announcement">
                <div class="shell">
                    <p>Beta update: roadmap pages now cover campaign grounding, animation variants, and product-scene generation.</p>
                    <a href="#/roadmap">View updates</a>
                </div>
            </div>

            <header class="site-header">
                <div class="shell">
                    <a class="brand" href="#/">
                        <div class="brand-mark">BC</div>
                        <div class="brand-copy">
                            <strong>${siteName}</strong>
                            <span>Business DNA marketing system</span>
                        </div>
                    </a>

                    <nav class="nav" aria-label="Primary">${navHtml}</nav>

                    <div class="header-actions">
                        <a class="button" href="#/analyze">Analyze site</a>
                        <button class="menu-button" type="button" id="menu-toggle">Menu</button>
                    </div>
                </div>

                <div class="mobile-panel shell" id="mobile-panel">
                    ${navItems.map(([label, href]) => `<a href="${href}">${label}</a>`).join('')}
                    <a class="button" href="#/analyze">Analyze site</a>
                </div>
            </header>

            <main class="shell page">
                <nav class="breadcrumbs" aria-label="Breadcrumb">${breadcrumbHtml}</nav>
                ${routeInfo.path !== '/' ? scanForm({
                    title: 'Analyze a website from any page',
                    subtitle: 'Paste a URL to open its Business DNA profile immediately.',
                    buttonLabel: 'Analyze now',
                    includeExamples: false,
                    compact: true,
                    formClass: 'global-scan-bar',
                }) : ''}
                ${routeModel.html}
            </main>

            <footer class="footer">
                <div class="shell">
                    <div>
                        <div class="eyebrow">Brand Content Studio</div>
                        <p>A standalone informational and analyzer experience built around website-based brand extraction.</p>
                    </div>
                    <div class="footer-links">
                        ${footerLinks.map(([label, href]) => `<a href="${href}">${label}</a>`).join('')}
                    </div>
                </div>
            </footer>
        </div>
    `;
}

function bindInteractions() {
    const mobilePanel = document.getElementById('mobile-panel');
    const menuToggle = document.getElementById('menu-toggle');
    if (menuToggle && mobilePanel) {
        menuToggle.addEventListener('click', () => {
            const open = mobilePanel.classList.toggle('open');
            document.body.classList.toggle('menu-open', open);
        });
    }

    document.querySelectorAll('[data-faq]').forEach((button) => {
        button.addEventListener('click', () => {
            const item = button.closest('.faq-item');
            if (!item) return;
            const open = item.classList.toggle('open');
            const symbol = button.querySelector('span:last-child');
            if (symbol) symbol.textContent = open ? '-' : '+';
        });
    });

    document.querySelectorAll('[data-example-url]').forEach((button) => {
        button.addEventListener('click', () => {
            const form = button.closest('[data-scan-form]');
            const input = form?.querySelector('[data-site-input]');
            if (input) input.value = button.getAttribute('data-example-url') || '';
            input?.focus();
        });
    });

    document.querySelectorAll('[data-scan-form]').forEach((form) => {
        form.addEventListener('submit', (event) => {
            event.preventDefault();
            const urlInput = form.querySelector('[data-site-input]');
            const promptInput = form.querySelector('[data-refine-input]');
            const errorNode = form.querySelector('[data-form-error]');
            const normalized = normalizeUrl(urlInput?.value || '');

            if (!normalized) {
                if (errorNode) errorNode.textContent = 'Enter a valid website URL to build the Business DNA profile.';
                urlInput?.focus();
                return;
            }

            const nextParams = new URLSearchParams({ url: normalized });
            const promptValue = promptInput?.value?.trim();
            if (promptValue) nextParams.set('prompt', promptValue);

            window.location.hash = `/analyze?${nextParams.toString()}`;
        });
    });
}

function rotateDemoStatus() {
    const statuses = [
        'Analyzing palette and typography',
        'Drafting Business DNA profile',
        'Generating campaign variants',
    ];
    let index = 0;
    const node = document.getElementById('demo-status');
    if (!node) return;

    window.clearInterval(window.__demoInterval);
    window.__demoInterval = window.setInterval(() => {
        index = (index + 1) % statuses.length;
        node.textContent = statuses[index];
    }, 2200);
}

function render() {
    const routeInfo = parseRoute();
    const routeModel = renderRoute(routeInfo);
    document.body.classList.remove('menu-open');

    updateSeo({
        title: routeModel.title,
        description: routeModel.description,
        path: routeInfo.path,
        schema: routeModel.schema,
    });

    document.getElementById('app').innerHTML = renderLayout(routeModel, routeInfo);
    bindInteractions();
    rotateDemoStatus();
}

window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', render);
