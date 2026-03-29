import { NextRequest, NextResponse } from "next/server";
import { resolveMetadataBatch } from "@/lib/metadata-resolver";

const CACHE_CONTROL = "public, s-maxage=1800, stale-while-revalidate=3600";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const uris = Array.isArray(body?.uris) ? body.uris : [];
    const metadataMap = await resolveMetadataBatch(uris);

    return NextResponse.json(
      { metadataMap },
      {
        headers: {
          "Cache-Control": CACHE_CONTROL,
        },
      }
    );
  } catch {
    return NextResponse.json(
      { metadataMap: {} },
      {
        status: 400,
        headers: {
          "Cache-Control": CACHE_CONTROL,
        },
      }
    );
  }
}
