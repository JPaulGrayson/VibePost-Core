// Conversion tracking utility for landing pages

interface TrackingParams {
  site: string;
  path: string;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  eventType?: string;
  eventData?: Record<string, any>;
}

// Get or create a unique visitor ID
function getVisitorId(): string {
  const key = 'vibepost_visitor_id';
  let visitorId = localStorage.getItem(key);
  if (!visitorId) {
    visitorId = 'v_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
    localStorage.setItem(key, visitorId);
  }
  return visitorId;
}

// Extract UTM parameters from URL
function getUtmParams(): Record<string, string | null> {
  const params = new URLSearchParams(window.location.search);
  return {
    utmSource: params.get('utm_source'),
    utmMedium: params.get('utm_medium'),
    utmCampaign: params.get('utm_campaign'),
    utmContent: params.get('utm_content'),
  };
}

// Main tracking function
export async function track(params: TrackingParams): Promise<void> {
  try {
    const utmParams = getUtmParams();
    const visitorId = getVisitorId();
    
    const trackingData = {
      site: params.site,
      path: params.path,
      utmSource: params.utmSource ?? utmParams.utmSource,
      utmMedium: params.utmMedium ?? utmParams.utmMedium,
      utmCampaign: params.utmCampaign ?? utmParams.utmCampaign,
      utmContent: params.utmContent ?? utmParams.utmContent,
      visitorId,
      eventType: params.eventType || 'pageview',
      eventData: params.eventData || null,
    };
    
    await fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(trackingData),
    });
  } catch (error) {
    console.error('Tracking error:', error);
  }
}

// Track page view (call on component mount)
export function trackPageView(site: string, path?: string): void {
  track({
    site,
    path: path || window.location.pathname,
    eventType: 'pageview',
  });
}

// Track specific events (signups, clicks, etc.)
export function trackEvent(site: string, eventType: string, eventData?: Record<string, any>): void {
  track({
    site,
    path: window.location.pathname,
    eventType,
    eventData,
  });
}
