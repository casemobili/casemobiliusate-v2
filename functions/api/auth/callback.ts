// Cloudflare Pages Function: /api/auth/callback
// OAuth handshake step 2 — riceve "code" da GitHub, lo scambia con access_token,
// poi notifica il CMS via window.postMessage e chiude il popup.

interface Env {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
}

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (!code) {
    return new Response('OAuth code mancante', { status: 400 });
  }

  // Verifica state contro cookie (CSRF protection)
  const cookieHeader = request.headers.get('Cookie') || '';
  const cookieState = cookieHeader.match(/cmu_oauth_state=([^;]+)/)?.[1];
  if (!state || !cookieState || state !== cookieState) {
    return new Response('OAuth state non valido (possibile CSRF)', { status: 400 });
  }

  // Scambia code per access_token
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });

  if (!tokenRes.ok) {
    return new Response(`Errore scambio token: ${tokenRes.status}`, { status: 502 });
  }

  const tokenData = (await tokenRes.json()) as { access_token?: string; error?: string };

  if (!tokenData.access_token) {
    return new Response(`OAuth fallito: ${tokenData.error || 'no token'}`, { status: 502 });
  }

  // Decap CMS aspetta una risposta HTML che fa postMessage al window opener.
  // Il formato del message è: "authorization:github:success:<json-payload>"
  const payload = JSON.stringify({
    token: tokenData.access_token,
    provider: 'github',
  });

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Login completato</title></head>
<body>
<script>
(function() {
  function receiveMessage(e) {
    window.opener.postMessage(
      'authorization:github:success:${payload.replace(/'/g, "\\'")}',
      e.origin
    );
    window.removeEventListener("message", receiveMessage, false);
  }
  window.addEventListener("message", receiveMessage, false);
  window.opener.postMessage("authorizing:github", "*");
})();
</script>
<p>Login GitHub completato. Puoi chiudere questa finestra.</p>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Cancella il cookie state (one-shot)
      'Set-Cookie': 'cmu_oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
    },
  });
};
