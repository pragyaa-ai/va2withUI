export { default } from "next-auth/middleware";

export const config = {
  // Protect all routes EXCEPT:
  // - /api/auth/* (NextAuth endpoints)
  // - /api/telephony/* (telephony service - internal VM calls)
  // - /api/calls/ingest (telephony data ingestion - internal VM calls)
  // - /login (login page)
  // - /_next/* (Next.js internals)
  // - /favicon.ico, /logos/* (static assets)
  matcher: ["/((?!api/auth|api/telephony|api/calls/ingest|login|_next/static|_next/image|favicon.ico|logos/).*)"]
};




