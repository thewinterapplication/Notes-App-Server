import { google } from "googleapis";
import { config } from "../config";

function buildOAuthClient() {
    return new google.auth.OAuth2(
        config.google.oauthClientId,
        config.google.oauthClientSecret,
        config.google.oauthRedirectUri
    );
}

export function getAuthUrl(): string {
    const client = buildOAuthClient();
    return client.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        scope: ["https://www.googleapis.com/auth/calendar.events"],
    });
}

export async function exchangeCodeForTokens(code: string): Promise<string> {
    const client = buildOAuthClient();
    const { tokens } = await client.getToken(code);
    console.log("=== GOOGLE REFRESH TOKEN (paste into .env) ===");
    console.log(tokens.refresh_token);
    console.log("==============================================");
    return tokens.refresh_token || "";
}

export async function createGuidanceMeet(params: {
    summary: string;
    description: string;
    startISO: string;
    endISO: string;
}): Promise<{ eventId: string; meetLink: string; htmlLink: string }> {
    const client = buildOAuthClient();
    client.setCredentials({ refresh_token: config.google.adminRefreshToken });

    const calendar = google.calendar({ version: "v3", auth: client });

    const requestId = `guidance-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const res = await calendar.events.insert({
        calendarId: config.google.adminCalendarId,
        conferenceDataVersion: 1,
        requestBody: {
            summary: params.summary,
            description: params.description,
            start: { dateTime: params.startISO, timeZone: "UTC" },
            end: { dateTime: params.endISO, timeZone: "UTC" },
            conferenceData: {
                createRequest: {
                    requestId,
                    conferenceSolutionKey: { type: "hangoutsMeet" },
                },
            },
        },
    });

    const event = res.data;
    const meetLink = event.conferenceData?.entryPoints?.find(
        (ep) => ep.entryPointType === "video"
    )?.uri || event.hangoutLink || "";

    return {
        eventId: event.id || "",
        meetLink,
        htmlLink: event.htmlLink || "",
    };
}
