import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.username || !body?.password) {
    return NextResponse.json({ error: 'Missing credentials' }, { status: 400 });
  }

  const validUser = process.env.ALERTS_USERNAME ?? 'admin';
  const validPass = process.env.ALERTS_PASSWORD ?? 'admin';

  if (body.username === validUser && body.password === validPass) {
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
}
