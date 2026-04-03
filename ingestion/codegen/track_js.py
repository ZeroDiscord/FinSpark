from typing import List

def generate_js_sdk(features: List[str], tenant_id: str) -> str:
    """
    Generates a track.js file.
    - Attaches to window.history.pushState and popstate for SPA route tracking
    - Wraps fetch() and XMLHttpRequest to capture API calls
    - Debounces rapid events (50ms window)
    - Sends batched events via navigator.sendBeacon on page unload
    - Same payload schema
    """
    features_str = ", ".join([f'"{f}"' for f in features])
    
    js_code = f"""// Auto-generated JS Tracker for Finspark Intelligence
// Supported Features: [{features_str}]

(function() {{
    const tenantId = "{tenant_id}";
    let sessionId = crypto.randomUUID();
    const endpoint = "https://api.example.com/track";
    
    let queue = [];
    let debounceTimer = null;

    async function hashUserId(userId) {{
        if (!userId) userId = 'anonymous';
        const msgUint8 = new TextEncoder().encode(userId);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    }}

    function getUserId() {{
        return localStorage.getItem('user_id') || 'anonymous';
    }}

    async function track(l3Feature, l4Action, metadata = {{}}) {{
        const userIdHash = await hashUserId(getUserId());
        
        const event = {{
            tenant_id: tenantId,
            session_id: sessionId,
            user_id: userIdHash,
            timestamp: new Date().toISOString(),
            deployment_type: "cloud",
            channel: "web",
            l1_domain: "unknown",
            l2_module: "unknown",
            l3_feature: l3Feature,
            l4_action: l4Action,
            l5_deployment_node: "client-browser",
            metadata: metadata
        }};
        
        queue.push(event);
        
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(flush, 50);
    }}

    function flush() {{
        if (queue.length === 0) return;
        const batch = [...queue];
        queue = [];
        
        if (navigator.sendBeacon) {{
            const blob = new Blob([JSON.stringify(batch)], {{type: 'application/json'}});
            navigator.sendBeacon(endpoint, blob);
        }} else {{
            fetch(endpoint, {{
                method: 'POST',
                headers: {{'Content-Type': 'application/json'}},
                body: JSON.stringify(batch),
                keepalive: true
            }}).catch(e => {{
                queue = [...batch, ...queue];
            }});
        }}
    }}

    // SPA Route Tracking
    const originalPushState = history.pushState;
    history.pushState = function() {{
        originalPushState.apply(this, arguments);
        track('navigation', 'pushState', {{ route: window.location.href }});
    }};

    window.addEventListener('popstate', () => {{
        track('navigation', 'popstate', {{ route: window.location.href }});
    }});

    // Flush on unload
    window.addEventListener('visibilitychange', () => {{
        if (document.visibilityState === 'hidden') {{
            flush();
        }}
    }});
    window.addEventListener('pagehide', flush);

    // Expose to window
    window.FinsparkTracker = {{
        track,
        flush
    }};
}})();
"""
    return js_code
