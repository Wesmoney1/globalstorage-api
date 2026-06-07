const kv = await Deno.openKv();

Deno.serve(async (request) => {
  const url = new URL(request.url);
  const path = url.pathname;

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (path === "/sdk.js") {
    const clientScript = `
      const BASE_URL = "${url.origin}";
      
      async function hashKey(namespace, key) {
        const combinedInput = \`\${namespace}:\${key}\`;
        const msgBuffer = new TextEncoder().encode(combinedInput);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      }

      window.GlobalStorage = {
        init(namespaceName) {
          if (!namespaceName) {
            throw new Error("GlobalStorage: A unique namespace string is required.");
          }
          
          return {
            async get(key) {
              const hashedKey = await hashKey(namespaceName, key);
              const res = await fetch(\`\${BASE_URL}/get/\${hashedKey}\`);
              const data = await res.json();
              return data.value; // Returns the raw number directly instead of an array
            },
            async set(key, value) { // Only takes a single value argument now
              const hashedKey = await hashKey(namespaceName, key);
              const res = await fetch(\`\${BASE_URL}/set\`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ key: hashedKey, value: Number(value) })
              });
              return res.ok;
            }
          };
        }
      };
    `;
    return new Response(clientScript, {
      headers: { "Content-Type": "application/javascript", ...corsHeaders },
    });
  }

  if (path === "/set" && request.method === "POST") {
    try {
      const { key, value } = await request.json();
      if (!key) return new Response("Missing key", { status: 400 });

      await kv.set(["keys", key], Number(value) || 0);
      
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    } catch (err) {
      return new Response("Invalid Request Payload", { status: 400 });
    }
  }
  if (path.startsWith("/get/")) {
    const key = path.split("/get/")[1];
    if (!key) return new Response("Missing key", { status: 400 });
    
    const record = await kv.get(["keys", key]);
    
    // Default to 0 if the key doesn't exist yet
    const value = record.value !== null ? record.value : 0;

    return new Response(JSON.stringify({ key, value: value }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  return new Response("Zero-Config DB running on Deno Deploy. Include /sdk.js in your project script tag.", { status: 200 });
});
