import { NextRequest } from 'next/server';
import { handleApiRoute } from '../../../src/server/attendanceApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return handleApiRoute(request);
}

export async function POST(request: NextRequest) {
  return handleApiRoute(request);
}

export async function PUT(request: NextRequest) {
  return handleApiRoute(request);
}

export async function DELETE(request: NextRequest) {
  return handleApiRoute(request);
}
