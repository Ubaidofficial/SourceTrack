export const demoData = {
  SaaS: {
    label: "SaaS",
    revenueLabel: "Revenue",
    conversionsLabel: "Conversions",
    aiRevenueLabel: "AI Revenue",
    metrics: [
      { id: 'visitors', label: 'Visitors', value: '4,840', trend: 'Last 30 days' },
      { id: 'revenue', label: 'Revenue', value: '$18,420', trend: '↗ +23.5% attribution' },
      { id: 'conversions', label: 'Conversions', value: '184', trend: '3.8% conv. rate' },
      { id: 'revPerVisitor', label: 'Rev / Visitor', value: '$3.80', trend: 'Lifetime value' },
      { id: 'live', label: 'Live Visitors', value: '14', trend: 'Real-time tracking', isLive: true },
      { id: 'aiRevenue', label: 'AI Revenue', value: '$3,840', trend: 'ChatGPT, Claude, etc.' },
    ],
    chartData: [
      { date: 'May 10', visitors: 110, revenue: 380 },
      { date: 'May 13', visitors: 130, revenue: 490 },
      { date: 'May 16', visitors: 125, revenue: 420 },
      { date: 'May 19', visitors: 150, revenue: 610 },
      { date: 'May 22', visitors: 140, revenue: 530 },
      { date: 'May 25', visitors: 175, revenue: 720 },
      { date: 'May 28', visitors: 190, revenue: 810 },
      { date: 'May 31', visitors: 205, revenue: 940 },
      { date: 'Jun 03', visitors: 195, revenue: 880 },
      { date: 'Jun 06', visitors: 215, revenue: 1020 },
      { date: 'Jun 09', visitors: 230, revenue: 1120 }
    ],
    tables: {
      sources: [
        { name: 'ChatGPT', visitors: '1,240', conversions: 48, rate: '3.9%', revenue: '$3,840' },
        { name: 'Google Organic', visitors: '1,420', conversions: 51, rate: '3.6%', revenue: '$5,100' },
        { name: 'Google Ads', visitors: '980', conversions: 42, rate: '4.3%', revenue: '$6,200' },
        { name: 'Direct', visitors: '850', conversions: 28, rate: '3.3%', revenue: '$2,140' },
        { name: 'Partner', visitors: '350', conversions: 15, rate: '4.3%', revenue: '$1,140' },
      ],
      ai: [
        { name: 'ChatGPT', visitors: '1,240', conversions: 48, rate: '3.9%', revenue: '$3,840' },
        { name: 'Claude', visitors: '420', conversions: 14, rate: '3.3%', revenue: '$980' },
        { name: 'Gemini', visitors: '310', conversions: 10, rate: '3.2%', revenue: '$720' },
        { name: 'Perplexity', visitors: '280', conversions: 9, rate: '3.2%', revenue: '$640' },
      ],
      pages: [
        { name: '/pricing', visitors: '1,850', conversions: 92, rate: '5.0%', revenue: '$9,200' },
        { name: '/blog/attribution-guide', visitors: '1,240', conversions: 31, rate: '2.5%', revenue: '$3,100' },
        { name: '/features', visitors: '950', conversions: 28, rate: '2.9%', revenue: '$2,800' },
        { name: '/docs', visitors: '800', conversions: 33, rate: '4.1%', revenue: '$3,320' },
      ],
      country: [
        { name: 'United States', visitors: '2,420', conversions: 98, rate: '4.0%', revenue: '$9,800' },
        { name: 'United Kingdom', visitors: '820', conversions: 31, rate: '3.8%', revenue: '$3,100' },
        { name: 'Germany', visitors: '640', conversions: 24, rate: '3.8%', revenue: '$2,400' },
        { name: 'Canada', visitors: '410', conversions: 15, rate: '3.7%', revenue: '$1,500' },
      ],
      browser: [
        { name: 'Chrome', visitors: '2,840', conversions: 110, rate: '3.9%', revenue: '$11,000' },
        { name: 'Safari', visitors: '1,250', conversions: 44, rate: '3.5%', revenue: '$4,400' },
        { name: 'Firefox', visitors: '450', conversions: 18, rate: '4.0%', revenue: '$1,800' },
        { name: 'Edge', visitors: '300', conversions: 12, rate: '4.0%', revenue: '$1,220' },
      ],
      device: [
        { name: 'Desktop', visitors: '3,340', conversions: 138, rate: '4.1%', revenue: '$13,800' },
        { name: 'Mobile', visitors: '1,320', conversions: 40, rate: '3.0%', revenue: '$4,000' },
        { name: 'Tablet', visitors: '180', conversions: 6, rate: '3.3%', revenue: '$620' },
      ]
    },
    journeys: {
      'ChatGPT': {
        sourceName: 'ChatGPT',
        steps: ['ChatGPT', 'Blog Post', 'Pricing', 'Stripe Checkout'],
        firstTouch: 'ChatGPT (AI Referral)',
        lastTouch: 'Direct',
        revenue: '$120.00',
        status: 'Attributed (Linear Model)',
        stitchingMethod: 'st_aid (Cookie Stitching)',
        conversionType: 'Stripe Checkout'
      },
      'Google Organic': {
        sourceName: 'Google Organic',
        steps: ['Google Search', 'Homepage', 'Features', 'Trial Signup'],
        firstTouch: 'Google Search (Organic)',
        lastTouch: 'Direct',
        revenue: '$49.00',
        status: 'Attributed (Last Touch)',
        stitchingMethod: 'cookie',
        conversionType: 'Trial Signup'
      },
      'Google Ads': {
        sourceName: 'Google Ads',
        steps: ['Google Ads', 'Landing Page', 'Pricing', 'Stripe Checkout'],
        firstTouch: 'Google Ads (Paid Search)',
        lastTouch: 'Google Ads',
        revenue: '$250.00',
        status: 'Attributed (Click ID)',
        stitchingMethod: 'gclid (Google Click ID)',
        conversionType: 'Stripe Checkout'
      },
      'Direct': {
        sourceName: 'Direct',
        steps: ['Direct', 'Pricing', 'Stripe Checkout'],
        firstTouch: 'Direct',
        lastTouch: 'Direct',
        revenue: '$120.00',
        status: 'Attributed (First Touch)',
        stitchingMethod: 'cookie',
        conversionType: 'Stripe Checkout'
      },
      'Partner': {
        sourceName: 'Partner',
        steps: ['Partner Blog', 'Affiliate Landing', 'Pricing', 'Stripe Checkout'],
        firstTouch: 'Partner Referral',
        lastTouch: 'Direct',
        revenue: '$99.00',
        status: 'Attributed (Affiliate)',
        stitchingMethod: 'ref_param',
        conversionType: 'Stripe Checkout'
      },
      'Claude': {
        sourceName: 'Claude',
        steps: ['Claude AI', 'Blog Post', 'Trial Signup'],
        firstTouch: 'Claude (AI Referral)',
        lastTouch: 'Direct',
        revenue: '$0.00',
        status: 'Attributed (Last Touch)',
        stitchingMethod: 'st_aid (Cookie Stitching)',
        conversionType: 'Trial Signup'
      },
      'Gemini': {
        sourceName: 'Gemini',
        steps: ['Gemini AI', 'Docs Page', 'Trial Signup'],
        firstTouch: 'Gemini (AI Referral)',
        lastTouch: 'Direct',
        revenue: '$0.00',
        status: 'Attributed (First Touch)',
        stitchingMethod: 'st_aid (Cookie Stitching)',
        conversionType: 'Trial Signup'
      },
      'Perplexity': {
        sourceName: 'Perplexity',
        steps: ['Perplexity AI', 'Pricing', 'Stripe Checkout'],
        firstTouch: 'Perplexity (AI Referral)',
        lastTouch: 'Direct',
        revenue: '$120.00',
        status: 'Attributed (Linear)',
        stitchingMethod: 'st_aid (Cookie Stitching)',
        conversionType: 'Stripe Checkout'
      },
      '/pricing': {
        sourceName: '/pricing',
        steps: ['Direct', 'Pricing', 'Stripe Checkout'],
        firstTouch: 'Direct',
        lastTouch: 'Direct',
        revenue: '$120.00',
        status: 'Attributed',
        stitchingMethod: 'cookie',
        conversionType: 'Stripe Checkout'
      },
      '/blog/attribution-guide': {
        sourceName: '/blog/attribution-guide',
        steps: ['Google Search', 'Blog Post', 'Pricing', 'Stripe Checkout'],
        firstTouch: 'Google Organic',
        lastTouch: 'Direct',
        revenue: '$120.00',
        status: 'Attributed',
        stitchingMethod: 'cookie',
        conversionType: 'Stripe Checkout'
      },
      '/features': {
        sourceName: '/features',
        steps: ['LinkedIn', 'Features', 'Pricing', 'Stripe Checkout'],
        firstTouch: 'LinkedIn Organic',
        lastTouch: 'Direct',
        revenue: '$120.00',
        status: 'Attributed',
        stitchingMethod: 'cookie',
        conversionType: 'Stripe Checkout'
      },
      '/docs': {
        sourceName: '/docs',
        steps: ['ChatGPT', 'Docs Page', 'Trial Signup'],
        firstTouch: 'ChatGPT (AI Referral)',
        lastTouch: 'Direct',
        revenue: '$0.00',
        status: 'Attributed',
        stitchingMethod: 'st_aid (Cookie Stitching)',
        conversionType: 'Trial Signup'
      }
    }
  },
  eCommerce: {
    label: "eCommerce",
    revenueLabel: "Revenue",
    conversionsLabel: "Orders",
    aiRevenueLabel: "AI Revenue",
    metrics: [
      { id: 'visitors', label: 'Visitors', value: '12,000', trend: 'Last 30 days' },
      { id: 'revenue', label: 'Revenue', value: '$42,870', trend: '↗ +18.2% attribution' },
      { id: 'conversions', label: 'Orders', value: '312', trend: '2.6% conv. rate' },
      { id: 'revPerVisitor', label: 'AOV', value: '$137.40', trend: 'Average order value' },
      { id: 'live', label: 'Live Visitors', value: '28', trend: 'Real-time tracking', isLive: true },
      { id: 'aiRevenue', label: 'AI Revenue', value: '$2,140', trend: 'ChatGPT, Perplexity, etc.' },
    ],
    chartData: [
      { date: 'May 10', visitors: 280, revenue: 1050 },
      { date: 'May 13', visitors: 320, revenue: 1190 },
      { date: 'May 16', visitors: 310, revenue: 1120 },
      { date: 'May 19', visitors: 360, revenue: 1450 },
      { date: 'May 22', visitors: 350, revenue: 1320 },
      { date: 'May 25', visitors: 410, revenue: 1720 },
      { date: 'May 28', visitors: 440, revenue: 1910 },
      { date: 'May 31', visitors: 480, revenue: 2140 },
      { date: 'Jun 03', visitors: 460, revenue: 1980 },
      { date: 'Jun 06', visitors: 510, revenue: 2280 },
      { date: 'Jun 09', visitors: 540, revenue: 2450 }
    ],
    tables: {
      sources: [
        { name: 'Meta Ads', visitors: '4,210', conversions: 122, rate: '2.9%', revenue: '$18,400' },
        { name: 'Google Shopping', visitors: '3,140', conversions: 89, rate: '2.8%', revenue: '$12,800' },
        { name: 'TikTok', visitors: '2,150', conversions: 48, rate: '2.2%', revenue: '$5,820' },
        { name: 'ChatGPT', visitors: '920', conversions: 21, rate: '2.3%', revenue: '$2,140' },
        { name: 'Email', visitors: '1,580', conversions: 32, rate: '2.0%', revenue: '$3,710' },
      ],
      ai: [
        { name: 'ChatGPT', visitors: '920', conversions: 21, rate: '2.3%', revenue: '$2,140' },
        { name: 'Perplexity', visitors: '240', conversions: 5, rate: '2.1%', revenue: '$510' },
        { name: 'Claude', visitors: '180', conversions: 3, rate: '1.7%', revenue: '$320' },
        { name: 'Gemini', visitors: '110', conversions: 2, rate: '1.8%', revenue: '$240' },
      ],
      pages: [
        { name: '/products/leather-jacket', visitors: '3,840', conversions: 98, rate: '2.6%', revenue: '$13,426' },
        { name: '/products/classic-sneakers', visitors: '2,920', conversions: 78, rate: '2.7%', revenue: '$10,686' },
        { name: '/cart', visitors: '2,400', conversions: 122, rate: '5.1%', revenue: '$16,714' },
        { name: '/reviews', visitors: '1,120', conversions: 14, rate: '1.3%', revenue: '$1,918' },
      ],
      country: [
        { name: 'United States', visitors: '6,420', conversions: 172, rate: '2.7%', revenue: '$23,500' },
        { name: 'United Kingdom', visitors: '1,980', conversions: 52, rate: '2.6%', revenue: '$7,120' },
        { name: 'Canada', visitors: '1,240', conversions: 31, rate: '2.5%', revenue: '$4,280' },
        { name: 'Australia', visitors: '950', conversions: 22, rate: '2.3%', revenue: '$3,020' },
      ],
      browser: [
        { name: 'Safari', visitors: '5,840', conversions: 148, rate: '2.5%', revenue: '$20,280' },
        { name: 'Chrome', visitors: '4,950', conversions: 132, rate: '2.7%', revenue: '$18,100' },
        { name: 'Firefox', visitors: '610', conversions: 18, rate: '3.0%', revenue: '$2,470' },
        { name: 'Edge', visitors: '600', conversions: 14, rate: '2.3%', revenue: '$2,020' },
      ],
      device: [
        { name: 'Mobile', visitors: '7,840', conversions: 195, rate: '2.5%', revenue: '$26,715' },
        { name: 'Desktop', visitors: '3,560', conversions: 105, rate: '2.9%', revenue: '$14,420' },
        { name: 'Tablet', visitors: '600', conversions: 12, rate: '2.0%', revenue: '$1,735' },
      ]
    },
    journeys: {
      'Meta Ads': {
        sourceName: 'Meta Ads',
        steps: ['Meta Ads', 'Product Page', 'Add to Cart', 'Purchase Complete'],
        firstTouch: 'Meta Ads (Instagram)',
        lastTouch: 'Meta Ads',
        revenue: '$148.00',
        status: 'Attributed (Last Touch)',
        stitchingMethod: 'fbclid (Meta Click ID)',
        conversionType: 'Store Purchase'
      },
      'Google Shopping': {
        sourceName: 'Google Shopping',
        steps: ['Google Shopping', 'Product Page', 'Purchase Complete'],
        firstTouch: 'Google Ads (Shopping)',
        lastTouch: 'Google Ads',
        revenue: '$89.00',
        status: 'Attributed (First Touch)',
        stitchingMethod: 'gclid (Google Click ID)',
        conversionType: 'Store Purchase'
      },
      'TikTok': {
        sourceName: 'TikTok',
        steps: ['TikTok', 'Product Page', 'Reviews Page', 'Purchase Complete'],
        firstTouch: 'TikTok Referral',
        lastTouch: 'Direct',
        revenue: '$110.00',
        status: 'Attributed (Linear Model)',
        stitchingMethod: 'ttclid (TikTok Click ID)',
        conversionType: 'Store Purchase'
      },
      'ChatGPT': {
        sourceName: 'ChatGPT',
        steps: ['ChatGPT', 'Product Recommendation', 'Purchase Complete'],
        firstTouch: 'ChatGPT (AI Referral)',
        lastTouch: 'Direct',
        revenue: '$95.00',
        status: 'Attributed (Linear)',
        stitchingMethod: 'st_aid (Cookie Stitching)',
        conversionType: 'Store Purchase'
      },
      'Email': {
        sourceName: 'Email',
        steps: ['Email Newsletter', 'Promo Landing', 'Purchase Complete'],
        firstTouch: 'Email (Klaviyo Campaign)',
        lastTouch: 'Email',
        revenue: '$165.00',
        status: 'Attributed (UTM Campaign)',
        stitchingMethod: 'utm_source',
        conversionType: 'Store Purchase'
      },
      'Perplexity': {
        sourceName: 'Perplexity',
        steps: ['Perplexity AI', 'Product Page', 'Purchase Complete'],
        firstTouch: 'Perplexity (AI Referral)',
        lastTouch: 'Direct',
        revenue: '$85.00',
        status: 'Attributed',
        stitchingMethod: 'st_aid (Cookie Stitching)',
        conversionType: 'Store Purchase'
      },
      'Claude': {
        sourceName: 'Claude',
        steps: ['Claude AI', 'Product Page', 'Purchase Complete'],
        firstTouch: 'Claude (AI Referral)',
        lastTouch: 'Direct',
        revenue: '$120.00',
        status: 'Attributed',
        stitchingMethod: 'st_aid (Cookie Stitching)',
        conversionType: 'Store Purchase'
      },
      'Gemini': {
        sourceName: 'Gemini',
        steps: ['Gemini AI', 'Product Page', 'Purchase Complete'],
        firstTouch: 'Gemini (AI Referral)',
        lastTouch: 'Direct',
        revenue: '$75.00',
        status: 'Attributed',
        stitchingMethod: 'st_aid (Cookie Stitching)',
        conversionType: 'Store Purchase'
      },
      '/products/leather-jacket': {
        sourceName: '/products/leather-jacket',
        steps: ['Meta Ads', 'Leather Jacket Page', 'Purchase Complete'],
        firstTouch: 'Meta Ads',
        lastTouch: 'Direct',
        revenue: '$189.00',
        status: 'Attributed',
        stitchingMethod: 'fbclid',
        conversionType: 'Store Purchase'
      },
      '/products/classic-sneakers': {
        sourceName: '/products/classic-sneakers',
        steps: ['Google Shopping', 'Sneakers Page', 'Purchase Complete'],
        firstTouch: 'Google Shopping',
        lastTouch: 'Direct',
        revenue: '$110.00',
        status: 'Attributed',
        stitchingMethod: 'gclid',
        conversionType: 'Store Purchase'
      },
      '/cart': {
        sourceName: '/cart',
        steps: ['Direct', 'Cart Page', 'Purchase Complete'],
        firstTouch: 'Direct',
        lastTouch: 'Direct',
        revenue: '$85.00',
        status: 'Attributed',
        stitchingMethod: 'cookie',
        conversionType: 'Store Purchase'
      },
      '/reviews': {
        sourceName: '/reviews',
        steps: ['TikTok', 'Reviews Page', 'Purchase Complete'],
        firstTouch: 'TikTok',
        lastTouch: 'Direct',
        revenue: '$95.00',
        status: 'Attributed',
        stitchingMethod: 'ttclid',
        conversionType: 'Store Purchase'
      }
    }
  },
  LeadGen: {
    label: "Lead Gen",
    revenueLabel: "Pipeline Value",
    conversionsLabel: "Leads",
    aiRevenueLabel: "AI Pipeline",
    metrics: [
      { id: 'visitors', label: 'Visitors', value: '8,390', trend: 'Last 30 days' },
      { id: 'revenue', label: 'Pipeline Value', value: '$96,500', trend: '↗ +27.8% attribution' },
      { id: 'conversions', label: 'Leads', value: '428', trend: '5.1% conv. rate' },
      { id: 'revPerVisitor', label: 'Val / Lead', value: '$225.40', trend: 'Qualified: 73 leads' },
      { id: 'live', label: 'Live Visitors', value: '19', trend: 'Real-time tracking', isLive: true },
      { id: 'aiRevenue', label: 'AI Pipeline', value: '$14,800', trend: 'ChatGPT, Gemini, etc.' },
    ],
    chartData: [
      { date: 'May 10', visitors: 190, revenue: 2100 },
      { date: 'May 13', visitors: 220, revenue: 2400 },
      { date: 'May 16', visitors: 215, revenue: 2300 },
      { date: 'May 19', visitors: 250, revenue: 3100 },
      { date: 'May 22', visitors: 240, revenue: 2800 },
      { date: 'May 25', visitors: 280, revenue: 3600 },
      { date: 'May 28', visitors: 310, revenue: 3900 },
      { date: 'May 31', visitors: 330, revenue: 4200 },
      { date: 'Jun 03', visitors: 320, revenue: 4000 },
      { date: 'Jun 06', visitors: 340, revenue: 4600 },
      { date: 'Jun 09', visitors: 360, revenue: 5100 }
    ],
    tables: {
      sources: [
        { name: 'Google Ads', visitors: '2,240', conversions: 128, rate: '5.7%', revenue: '$32,400' },
        { name: 'LinkedIn', visitors: '1,850', conversions: 94, rate: '5.0%', revenue: '$24,500' },
        { name: 'ChatGPT', visitors: '640', conversions: 38, rate: '5.9%', revenue: '$8,400' },
        { name: 'Referral', visitors: '920', conversions: 42, rate: '4.5%', revenue: '$9,200' },
        { name: 'Direct', visitors: '1,450', conversions: 58, rate: '4.0%', revenue: '$11,600' },
      ],
      ai: [
        { name: 'ChatGPT', visitors: '640', conversions: 38, rate: '5.9%', revenue: '$8,400' },
        { name: 'Claude', visitors: '310', conversions: 18, rate: '5.8%', revenue: '$3,800' },
        { name: 'Gemini', visitors: '220', conversions: 12, rate: '5.4%', revenue: '$2,600' },
        { name: 'Perplexity', visitors: '150', conversions: 8, rate: '5.3%', revenue: '$1,800' },
      ],
      pages: [
        { name: '/landing-page-roi', visitors: '3,100', conversions: 184, rate: '5.9%', revenue: '$41,400' },
        { name: '/case-study-saas', visitors: '1,840', conversions: 92, rate: '5.0%', revenue: '$20,700' },
        { name: '/book-a-call', visitors: '1,420', conversions: 112, rate: '7.8%', revenue: '$25,200' },
        { name: '/resources/whitepaper', visitors: '980', conversions: 24, rate: '2.4%', revenue: '$5,400' },
      ],
      country: [
        { name: 'United States', visitors: '4,520', conversions: 238, rate: '5.2%', revenue: '$53,700' },
        { name: 'Canada', visitors: '1,120', conversions: 58, rate: '5.1%', revenue: '$13,050' },
        { name: 'United Kingdom', visitors: '950', conversions: 48, rate: '5.0%', revenue: '$10,800' },
        { name: 'Australia', visitors: '620', conversions: 31, rate: '5.0%', revenue: '$6,975' },
      ],
      browser: [
        { name: 'Chrome', visitors: '4,850', conversions: 244, rate: '5.0%', revenue: '$55,000' },
        { name: 'Safari', visitors: '2,100', conversions: 104, rate: '4.9%', revenue: '$23,400' },
        { name: 'Firefox', visitors: '820', conversions: 44, rate: '5.3%', revenue: '$9,900' },
        { name: 'Edge', visitors: '620', conversions: 36, rate: '5.8%', revenue: '$8,200' },
      ],
      device: [
        { name: 'Desktop', visitors: '5,840', conversions: 312, rate: '5.3%', revenue: '$70,300' },
        { name: 'Mobile', visitors: '2,250', conversions: 108, rate: '4.8%', revenue: '$24,350' },
        { name: 'Tablet', visitors: '300', conversions: 8, rate: '2.6%', revenue: '$1,850' },
      ]
    },
    journeys: {
      'Google Ads': {
        sourceName: 'Google Ads',
        steps: ['Google Ads', 'Landing Page', 'PDF Download', 'Booked Call'],
        firstTouch: 'Google Ads (Paid Search)',
        lastTouch: 'Direct',
        revenue: '$450.00',
        status: 'Attributed (First Touch)',
        stitchingMethod: 'gclid (Google Click ID)',
        conversionType: 'Lead Callback'
      },
      'LinkedIn': {
        sourceName: 'LinkedIn',
        steps: ['LinkedIn', 'Landing Page', 'Case Study', 'Booked Call'],
        firstTouch: 'LinkedIn Organic',
        lastTouch: 'LinkedIn Organic',
        revenue: '$750.00',
        status: 'Attributed (W-Shaped Model)',
        stitchingMethod: 'cookie (Direct Stitch)',
        conversionType: 'Booked Meeting'
      },
      'ChatGPT': {
        sourceName: 'ChatGPT',
        steps: ['ChatGPT', 'Resource Page', 'Booking Page', 'Form Submit'],
        firstTouch: 'ChatGPT (AI Referral)',
        lastTouch: 'Direct',
        revenue: '$250.00',
        status: 'Attributed (Linear)',
        stitchingMethod: 'st_aid (Cookie Stitching)',
        conversionType: 'Contact Form'
      },
      'Referral': {
        sourceName: 'Referral',
        steps: ['Partner Blog', 'Landing Page', 'Contact Form Submit'],
        firstTouch: 'Partner Referral',
        lastTouch: 'Direct',
        revenue: '$350.00',
        status: 'Attributed (Last Touch)',
        stitchingMethod: 'cookie',
        conversionType: 'Contact Form'
      },
      'Direct': {
        sourceName: 'Direct',
        steps: ['Direct', 'Contact Page', 'Contact Form Submit'],
        firstTouch: 'Direct',
        lastTouch: 'Direct',
        revenue: '$200.00',
        status: 'Attributed',
        stitchingMethod: 'cookie',
        conversionType: 'Contact Form'
      },
      'Claude': {
        sourceName: 'Claude',
        steps: ['Claude AI', 'Resource Page', 'Booked Call'],
        firstTouch: 'Claude (AI Referral)',
        lastTouch: 'Direct',
        revenue: '$250.00',
        status: 'Attributed',
        stitchingMethod: 'st_aid (Cookie Stitching)',
        conversionType: 'Booked Meeting'
      },
      'Gemini': {
        sourceName: 'Gemini',
        steps: ['Gemini AI', 'Resource Page', 'Booked Call'],
        firstTouch: 'Gemini (AI Referral)',
        lastTouch: 'Direct',
        revenue: '$250.00',
        status: 'Attributed',
        stitchingMethod: 'st_aid (Cookie Stitching)',
        conversionType: 'Booked Meeting'
      },
      'Perplexity': {
        sourceName: 'Perplexity',
        steps: ['Perplexity AI', 'Case Study', 'Contact Form Submit'],
        firstTouch: 'Perplexity (AI Referral)',
        lastTouch: 'Direct',
        revenue: '$200.00',
        status: 'Attributed',
        stitchingMethod: 'st_aid (Cookie Stitching)',
        conversionType: 'Contact Form'
      },
      '/landing-page-roi': {
        sourceName: '/landing-page-roi',
        steps: ['Google Ads', 'Landing Page', 'Booked Call'],
        firstTouch: 'Google Ads',
        lastTouch: 'Direct',
        revenue: '$450.00',
        status: 'Attributed',
        stitchingMethod: 'gclid',
        conversionType: 'Booked Meeting'
      },
      '/case-study-saas': {
        sourceName: '/case-study-saas',
        steps: ['LinkedIn', 'Case Study Page', 'Booked Call'],
        firstTouch: 'LinkedIn',
        lastTouch: 'Direct',
        revenue: '$750.00',
        status: 'Attributed',
        stitchingMethod: 'cookie',
        conversionType: 'Booked Meeting'
      },
      '/book-a-call': {
        sourceName: '/book-a-call',
        steps: ['Direct', 'Booking Page', 'Booked Call'],
        firstTouch: 'Direct',
        lastTouch: 'Direct',
        revenue: '$250.00',
        status: 'Attributed',
        stitchingMethod: 'cookie',
        conversionType: 'Booked Meeting'
      },
      '/resources/whitepaper': {
        sourceName: '/resources/whitepaper',
        steps: ['Partner Site', 'Whitepaper Page', 'Download Form'],
        firstTouch: 'Partner Referral',
        lastTouch: 'Direct',
        revenue: '$150.00',
        status: 'Attributed',
        stitchingMethod: 'cookie',
        conversionType: 'Form Submit'
      }
    }
  }
};
