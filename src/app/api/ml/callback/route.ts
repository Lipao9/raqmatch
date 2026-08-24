import { NextResponse } from "next/server";

/**
 * OAuth redirect target for the Mercado Livre application.
 *
 * It exists because Mercado Livre rejects `http://localhost` as a redirect URI,
 * so the one-time authorisation has to land on a real HTTPS host, and because
 * that authorisation will have to be repeated: ML rotates the refresh token on
 * every use, so any break in the chain means going through the browser again.
 * Reading the code off a page beats digging it out of the address bar.
 *
 * Nothing secret passes through here. The authorisation code is single-use,
 * expires in minutes, and is worthless without the client secret, which lives
 * only in `.env.local` on the operator's machine. `/api/` is disallowed in
 * robots.txt, so this is never indexed.
 *
 * Served as text/plain so the reflected code cannot be interpreted as markup.
 */
export function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const code = params.get("code");
  const error = params.get("error");

  if (error) {
    return new NextResponse(
      `Authorisation failed: ${error}\n${params.get("error_description") ?? ""}\n`,
      { status: 400, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }

  if (!code) {
    return new NextResponse(
      "Missing ?code. Start the flow from the Mercado Livre authorisation URL.\n",
      { status: 400, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }

  return new NextResponse(
    `Authorisation code:\n\n${code}\n\nPaste it into: npm run ml:auth -- ${code}\nIt is single-use and expires within minutes.\n`,
    {
      status: 200,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        // Never let a proxy or the browser keep a one-time code around.
        "cache-control": "no-store",
      },
    },
  );
}
