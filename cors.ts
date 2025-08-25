

function restrictOriginFromRequest(request: Request): string|null {
    if (Bun.env.DEV === "1") {
        return "*";
    }
    const productionOriginsWhitelist = [process.env.OFFICIAL_ORIGIN ?? "https://demo.netismic.com"];
    const clientIP = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                     request.headers.get('x-real-ip') || 
                     (request as any).socket?.remoteAddress || 
                     'unknown';
    console.log(new Date().toISOString(), "CORS check for", clientIP, "Origin:", request.headers.get("origin"), "->", request.url);
    let origin = request.headers.get("origin");
    if (origin && productionOriginsWhitelist.includes(origin))
        return origin;
    return null;
}

export function makeHeaders(contentType: string,allowedOrigin: string|null, allowedMethods: string = "GET, POST, OPTIONS", req: Request): Record<string, string> {
    return {
        "Content-Type": contentType,
        //"Cache-Control": "no-cache, no-transform",
        ...((allowedOrigin !== null) ? { "Access-Control-Allow-Origin": allowedOrigin } : {}),
        // "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Headers": req?.headers.get("access-control-request-headers") ?? "*",
        "Access-Control-Allow-Methods": allowedMethods,
    }
}

export function getCORSAllowedOriginOrResponse(req: Request, allowedMethods: string): string|Response {
    const allowedOrigin = restrictOriginFromRequest(req);
    if (allowedOrigin === null) {
        return new Response("Not allowed", { status: 405, headers: makeHeaders("text/plain", allowedOrigin, allowedMethods, req) });
    }
    return allowedOrigin;
}