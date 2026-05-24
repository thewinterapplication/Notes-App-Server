import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { config } from "../config";

interface OTPResponse {
    Status: string;
    Details: string;
}

interface OTPSessionPayload {
    nonce: string;
    expiresAt: number;
    otpHash: string;
    phone: string;
}

interface SendOTPResult {
    success: boolean;
    sessionId?: string;
    message: string;
}

interface VerifyOTPResult {
    success: boolean;
    message: string;
    phone?: string;
}

export class OTPService {
    private apiKey: string;
    private baseUrl: string;
    private sessionSecret: string;
    private otpExpiryMs = 5 * 60 * 1000;

    constructor() {
        this.apiKey = config.otp.apiKey;
        this.baseUrl = config.otp.baseUrl;
        this.sessionSecret = config.otp.sessionSecret;
    }

    private normalizePhoneNumber(phoneNumber: string): string {
        let cleanPhone = phoneNumber.replace(/[^\d]/g, "");

        if (cleanPhone.startsWith("0") && cleanPhone.length === 11) {
            cleanPhone = cleanPhone.substring(1);
        }

        // 2Factor SMS API expects Indian mobile numbers with country code.
        if (cleanPhone.length === 10) {
            cleanPhone = `91${cleanPhone}`;
        }

        return cleanPhone;
    }

    private generateOTP(): string {
        return randomInt(1000, 10000).toString();
    }

    private hashOTP(nonce: string, otp: string, expiresAt: number): string {
        return createHmac("sha256", this.sessionSecret)
            .update(`${nonce}:${otp}:${expiresAt}`)
            .digest("hex");
    }

    private signPayload(encodedPayload: string): string {
        return createHmac("sha256", this.sessionSecret)
            .update(encodedPayload)
            .digest("base64url");
    }

    private safeEqual(left: string, right: string): boolean {
        const leftBuffer = Buffer.from(left);
        const rightBuffer = Buffer.from(right);

        if (leftBuffer.length !== rightBuffer.length) {
            return false;
        }

        return timingSafeEqual(leftBuffer, rightBuffer);
    }

    private buildSessionId(otp: string, phone: string): string {
        const payload: OTPSessionPayload = {
            nonce: randomUUID(),
            expiresAt: Date.now() + this.otpExpiryMs,
            otpHash: "",
            phone
        };

        payload.otpHash = this.hashOTP(payload.nonce, otp, payload.expiresAt);

        const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
        const signature = this.signPayload(encodedPayload);

        return `${encodedPayload}.${signature}`;
    }

    private parseSessionId(sessionId: string): OTPSessionPayload | null {
        const [encodedPayload, signature] = sessionId.split(".");

        if (!encodedPayload || !signature) {
            return null;
        }

        if (!this.safeEqual(this.signPayload(encodedPayload), signature)) {
            return null;
        }

        try {
            const payload = JSON.parse(
                Buffer.from(encodedPayload, "base64url").toString("utf8")
            ) as OTPSessionPayload;

            if (
                typeof payload.nonce !== "string" ||
                typeof payload.expiresAt !== "number" ||
                typeof payload.otpHash !== "string" ||
                typeof payload.phone !== "string"
            ) {
                return null;
            }

            return payload;
        } catch {
            return null;
        }
    }

    private async parseOTPResponse(response: Response): Promise<OTPResponse> {
        const body = await response.text();

        try {
            return JSON.parse(body) as OTPResponse;
        } catch {
            return {
                Status: response.ok ? "Success" : "Error",
                Details: body || response.statusText
            };
        }
    }

    /**
     * Send OTP to a phone number using 2Factor SMS API
     * @param phoneNumber - Phone number with or without country code
     * @returns Signed session ID for OTP verification
     */
    async sendOTP(phoneNumber: string): Promise<SendOTPResult> {
        if (!this.apiKey) {
            return {
                success: false,
                message: "OTP service not configured. Please set TWOFACTOR_API_KEY."
            };
        }

        if (!this.sessionSecret) {
            return {
                success: false,
                message: "OTP session secret not configured."
            };
        }

        const cleanPhone = this.normalizePhoneNumber(phoneNumber);
        const otp = this.generateOTP();
        const sessionId = this.buildSessionId(otp, cleanPhone);

        try {
            const url = `${this.baseUrl}/${this.apiKey}/SMS/${cleanPhone}/${otp}`;

            const response = await fetch(url, {
                method: "POST"
            });
            const data = await this.parseOTPResponse(response);

            if (response.ok && data.Status === "Success") {
                return {
                    success: true,
                    sessionId,
                    message: "SMS OTP sent successfully"
                };
            }

            return {
                success: false,
                message: data.Details || "Failed to send SMS OTP"
            };
        } catch (error: any) {
            return {
                success: false,
                message: error.message || "Failed to send SMS OTP"
            };
        }
    }

    /**
     * Verify OTP entered by user
     * @param sessionId - Signed session ID received when OTP was sent
     * @param otp - OTP entered by user
     * @returns Verification result
     */
    async verifyOTP(sessionId: string, otp: string): Promise<VerifyOTPResult> {
        if (!this.sessionSecret) {
            return {
                success: false,
                message: "OTP session secret not configured."
            };
        }

        const session = this.parseSessionId(sessionId);

        if (!session) {
            return {
                success: false,
                message: "Invalid OTP session"
            };
        }

        if (Date.now() > session.expiresAt) {
            return {
                success: false,
                message: "OTP expired. Please request a new OTP."
            };
        }

        const expectedHash = this.hashOTP(session.nonce, otp, session.expiresAt);

        if (!this.safeEqual(expectedHash, session.otpHash)) {
            return {
                success: false,
                message: "Invalid OTP"
            };
        }

        return {
            success: true,
            message: "OTP verified successfully",
            phone: session.phone
        };
    }
}
