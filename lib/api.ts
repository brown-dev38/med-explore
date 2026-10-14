import { NextResponse } from "next/server";

export function errorResponse(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

export function successResponse(data: unknown, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

export function parseId(value: string): bigint | null {
  return /^\d+$/.test(value) ? BigInt(value) : null;
}
