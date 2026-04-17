import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

/** Maps corridor key ("Country||Method") to the scraper script filename. */
const CORRIDOR_SCRIPT: Record<string, string> = {
  'Indonesia||Bank Deposit': 'run-idr.js',
  'Thailand||Bank Deposit': 'run-thb.js',
  'Vietnam||Bank Deposit': 'run-vnd.js',
  'Nepal||Bank Deposit': 'run-npr.js',
  'Philippines||Bank Deposit': 'run-php.js',
  'Philippines||Cash Pickup': 'run-php.js',
  'Cambodia||Bank Deposit': 'run-khm.js',
  'Cambodia||Cash Pickup': 'run-khm.js',
  'China||Alipay': 'run-cny.js',
  'Mongolia||Bank Deposit': 'run-mnt.js',
  'Myanmar||Bank Deposit': 'run-mmk.js',
  'Pakistan||Bank Deposit': 'run-pkr.js',
  'Laos||Bank Deposit (LAK)': 'run-lak.js',
  'Laos||Bank Deposit (USD)': 'run-lak-usd.js',
  'Sri Lanka||Bank Deposit': 'run-lkr.js',
  'India||Bank Deposit': 'run-inr.js',
  'Timor Leste||Bank Deposit': 'run-tls.js',
  'Timor Leste||Cash Pickup (MoneyGram)': 'run-tls.js',
  'Bangladesh||Bank Deposit': 'run-bdt.js',
  'Uzbekistan||Cash Pickup': 'run-uzb.js',
  'Uzbekistan||Card Payment': 'run-uzb-card.js',
  'Russia||Cash Payment': 'run-rub.js',
  'Russia||Card Payment': 'run-rub.js',
  'Kazakhstan||Cash Pickup': 'run-kzt.js',
  'Kyrgyzstan||Cash Pickup': 'run-kgs.js',
  'Ghana||Bank Deposit': 'run-ghs.js',
  'Ghana||Mobile Wallet': 'run-ghs.js',
  'South Africa||Bank Deposit': 'run-zar.js',
  'Canada||Bank Deposit': 'run-cad.js',
  'Nigeria||Bank Deposit': 'run-ngn.js',
};

export async function POST(req: NextRequest) {
  const { country, deliveryMethod } = await req.json();
  if (!country || !deliveryMethod) {
    return NextResponse.json({ error: 'country and deliveryMethod required' }, { status: 400 });
  }

  const corridorKey = `${country}||${deliveryMethod}`;
  const script = CORRIDOR_SCRIPT[corridorKey];
  if (!script) {
    return NextResponse.json({ error: `Unknown corridor: ${corridorKey}` }, { status: 400 });
  }

  const githubPat = process.env.GITHUB_PAT;
  const githubOwner = process.env.GITHUB_OWNER;
  const githubRepo = process.env.GITHUB_REPO;
  if (!githubPat || !githubOwner || !githubRepo) {
    return NextResponse.json({ error: 'GitHub integration not configured' }, { status: 500 });
  }

  const checkId = randomUUID();

  // Trigger the check-realtime workflow via GitHub API
  const res = await fetch(
    `https://api.github.com/repos/${githubOwner}/${githubRepo}/actions/workflows/check-realtime.yml/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `token ${githubPat}`,
        Accept: 'application/vnd.github.v3+json',
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: { script, check_id: checkId },
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: `GitHub API error: ${res.status} ${text}` }, { status: 502 });
  }

  return NextResponse.json({ checkId, corridor: corridorKey, status: 'triggered' });
}
