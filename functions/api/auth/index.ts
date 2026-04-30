// Cloudflare Pages Function: /api/auth
// OAuth handshake step 1 — redirige l'utente del CMS a GitHub OAuth.
//
// Decap CMS chiama questo endpoint quando l'utente clicca "Login with GitHub"
// su /admin. Noi generiamo uno state casuale e lo passiamo a GitHub.

interface Env {
  GITHUB_CLIENT_ID: string;
}

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const url = new URL(request.url);
  const provider = url.searchParams.get('provider') || 'github';

  if (provider !== 'github') {
    return new Response('Provider non supportato', { status: 400 });
  }

  // State random per CSRF protection (validato in callback)
  const state = crypto.randomUUID();

  const githubUrl = new URL('https://github.com/login/oauth/authorize');
  githubUrl.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  githubUrl.searchParams.set('redirect_uri', `${url.origin}/api/auth/callback`);
  githubUrl.searchParams.set('scope', 'repo,user');
  githubUrl.searchParams.set('state', state);

  // Salva lo state in cookie httpOnly per validazione lato callback
  const headers = new Headers({
    Location: githubUrl.toString(),
    'Set-Cookie': `cmu_oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
  });

  return new Response(null, { status: 302, headers });
};
